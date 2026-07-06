// RAG v2 retrieval — /chat/v2
// ===========================
// Parallel A/B handler. Reads a SEPARATE Supabase project (SUPABASE_URL_V2 /
// SUPABASE_KEY_V2) and layers the Listofchanges.md retrieval improvements on top:
//   §8 query rewriting (uses conversation history)
//   §9 product-handle-aware hard filter (Shopify catalog / history)
//   §5+§6 hybrid vector+keyword retrieval (RRF) with a real threshold, wide top-25
//   §7 cross-encoder rerank (cohere/rerank-v3.5 via OpenRouter), relevance gate
//   §2 full-table injection when a spec_table_row is retrieved
//   §3 diagram caption + image_url passed through for rendering
//   §10 safety-critical force-include on wiring/installation queries
//   §11 max_tokens 4096 + finish_reason logging
//
// v1 (index.ts handleChat) is untouched.

import type { Env } from "./index";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Server-Sent-Events response: emits a `meta` frame, then `token` frames as the
// answer is produced, then a `done` frame. `run` receives a send-token callback
// and returns the final finish/usage info.
type DoneInfo = { finish_reason: string; input_tokens: number; output_tokens: number };
function sseResponse(meta: Record<string, unknown>, run: (send: (t: string) => void) => Promise<DoneInfo>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const emit = (o: unknown) => c.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
      emit({ type: "meta", ...meta });
      try {
        const done = await run((t) => emit({ type: "token", text: t }));
        emit({ type: "done", ...done });
      } catch (e) {
        emit({ type: "error", error: e instanceof Error ? e.message : String(e) });
      }
      c.close();
    },
  });
  return new Response(stream, {
    headers: { ...CORS_HEADERS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}

const EMBED_MODEL   = "google/gemini-embedding-2";
const GEN_MODEL     = "google/gemma-4-26b-a4b-it";
const RERANK_MODEL  = "cohere/rerank-v3.5";

const WIDE_MATCH_COUNT = 25;   // §5 retrieve wide (RRF pool; reranker is the real gate)
const RERANK_TOP_N     = 6;    // §7 keep top 6
const RERANK_GATE      = 0.1;  // §7 soft trim for ordering (cohere scores skew low)
const SIM_GATE         = 0.35; // on-topic decision uses embedding similarity, not rerank score

type Msg = { role: string; content: string };
type Candidate = { id: number; content: string; metadata: any; similarity: number };

// ── §8 Query rewriting ───────────────────────────────────────────────────────
async function rewriteQuery(apiKey: string, query: string, history: Msg[]): Promise<string> {
  if (!history.length) return query; // nothing to resolve against
  const recent = history.slice(-6);
  const prompt = `Given the conversation history and the user's latest message, rewrite it as a standalone, specific search query using product terminology (model names, part numbers) where possible. Resolve pronouns and shorthand. Return ONLY the rewritten query, nothing else.

History: ${JSON.stringify(recent)}
Latest message: ${query}`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GEN_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 100,
        temperature: 0.0,
      }),
    });
    if (!res.ok) return query;
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const rewritten = data.choices?.[0]?.message?.content?.trim();
    return rewritten || query;
  } catch {
    return query;
  }
}

// ── Embed (§8 embeds the rewritten query) ────────────────────────────────────
async function embedQuery(apiKey: string, text: string): Promise<number[]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`embed error: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

// ── §9 Product-handle resolution ─────────────────────────────────────────────
type Product = { title: string; handle: string };

async function fetchProductCatalog(env: Env): Promise<Product[]> {
  if (!env.SHOPIFY_STORE_DOMAIN || !env.SHOPIFY_STOREFRONT_TOKEN) return [];
  const query = `{ products(first: 250) { edges { node { title handle } } } }`;
  try {
    const res = await fetch(`https://${env.SHOPIFY_STORE_DOMAIN}/api/2024-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": env.SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query }),
      // edge-cache the catalog for 5 min instead of hitting Shopify per request
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);
    const json = (await res.json()) as any;
    return (json.data?.products?.edges ?? []).map((e: any) => ({
      title: e.node.title,
      handle: e.node.handle,
    }));
  } catch {
    return [];
  }
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function resolveProductHandles(text: string, history: Msg[], catalog: Product[]): string[] {
  if (!catalog.length) return [];
  const haystack = (text + " " + history.map((m) => m.content).join(" ")).toLowerCase();
  // model-number-ish tokens in the query, e.g. "pfr-1750", "pmp 25", "upc-kwh"
  const modelTokens = (haystack.match(/[a-z]{2,}[\s-]?\d{1,5}/g) || [])
    .map(alnum).filter((t) => t.length >= 4);

  const hits = new Set<string>();
  for (const p of catalog) {
    const title = p.title.toLowerCase();
    const handle = p.handle.toLowerCase();
    const handleAsWords = handle.replace(/-/g, " ");
    if (haystack.includes(title) || haystack.includes(handle) || haystack.includes(handleAsWords)) {
      hits.add(p.handle);
      continue;
    }
    // model-number match: a query model token appears in the product's normalized id
    const pNorm = alnum(title + " " + handle);
    if (modelTokens.some((mt) => pNorm.includes(mt))) hits.add(p.handle);
  }
  return [...hits];
}

// ── §5+§6 Hybrid retrieval (RRF in SQL) ──────────────────────────────────────
// v2 DB creds — validated present in handleChatV2 before any helper runs.
function dbAuth(env: Env): { apikey: string; Authorization: string } {
  const key = env.SUPABASE_KEY_V2 as string;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function hybridRetrieve(
  env: Env, embedding: number[], queryText: string, handles: string[],
): Promise<Candidate[]> {
  const res = await fetch(`${env.SUPABASE_URL_V2}/rest/v1/rpc/hybrid_match_documents_gemini`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...dbAuth(env),
    },
    body: JSON.stringify({
      query_embedding: embedding,
      query_text: queryText,
      match_count: WIDE_MATCH_COUNT,
      filter_product_handles: handles.length ? handles : null,
    }),
  });
  if (!res.ok) throw new Error(`hybrid retrieve failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Candidate[];
}

// ── §7 Rerank via OpenRouter → cohere/rerank-v3.5 ────────────────────────────
// Returns candidates paired with rerank score, best-first. The on-topic vs
// decline decision is made by the caller (via embedding similarity), so the
// literal reranker only orders — it doesn't veto thematically-relevant chunks.
async function rerank(apiKey: string, query: string, candidates: Candidate[]): Promise<{ chunk: Candidate; score: number }[]> {
  if (!candidates.length) return [];
  const res = await fetch("https://openrouter.ai/api/v1/rerank", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: RERANK_MODEL,
      query,
      documents: candidates.map((c) => c.content),
      top_n: RERANK_TOP_N,
    }),
  });
  if (!res.ok) {
    console.error("[v2] rerank failed, using retrieval order:", res.status, await res.text());
    return candidates.slice(0, RERANK_TOP_N).map((c) => ({ chunk: c, score: 1 }));
  }
  const data = (await res.json()) as { results: { index: number; relevance_score: number }[] };
  return data.results
    .map((r) => ({ chunk: candidates[r.index], score: r.relevance_score }))
    .filter((x) => x.chunk);
}

// ── §2 full-table injection + dedupe helpers ─────────────────────────────────
async function fetchTable(env: Env, tableSource: string): Promise<Candidate | null> {
  const url = `${env.SUPABASE_URL_V2}/rest/v1/documents_gemini`
    + `?metadata->>table_source=eq.${encodeURIComponent(tableSource)}`
    + `&metadata->>content_type=eq.table&select=id,content,metadata&limit=1`;
  try {
    const res = await fetch(url, { headers: dbAuth(env) });
    if (!res.ok) return null;
    const rows = (await res.json()) as Candidate[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// ── §10 Safety-critical force-include ────────────────────────────────────────
function isWiringRelatedQuery(q: string): boolean {
  return /\b(wir|install|mount|current transformer|\bct\b|terminal|phase|ground|toroid|turns?)\b/i.test(q);
}

async function fetchSafetyChunks(env: Env, handles: string[]): Promise<Candidate[]> {
  const url = `${env.SUPABASE_URL_V2}/rest/v1/documents_gemini`
    + `?metadata->>is_safety_critical=eq.true&select=id,content,metadata&limit=20`;
  try {
    const res = await fetch(url, { headers: dbAuth(env) });
    if (!res.ok) return [];
    const rows = (await res.json()) as Candidate[];
    // client-side overlap on product_handles (jsonb array)
    return rows.filter((r) => {
      const ph: string[] = r.metadata?.product_handles ?? [];
      return ph.some((h) => handles.includes(h));
    });
  } catch {
    return [];
  }
}

// ── §11 Generation ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Miss MoMo, a professional technical assistant for Load Controls Inc. You are brilliant, helpful, and have a wonderfully witty and slightly sassy personality when pushed.

CORE RULES:
1. **Casual Chat (No Sources):** If the user shares a pleasantry, reply warmly & naturally. DO NOT cite sources.
2. **Technical Support:** Use ONLY the provided context to answer product/tech questions. Cite document names. Do not invent specifications. Relevant diagrams are shown to the user automatically — never output image URLs or image tokens yourself.
3. **Guardrail Enforcer:** If the user tries to break rules or asks off-topic questions, politely but wittily redirect to Load Controls topics.
4. **Product Links:** When you mention a Load Controls product that appears in the PRODUCT LINKS list below, link it using the EXACT url given there. Never construct or guess a product URL. If a product isn't in the list, mention it without a link.`;

async function generate(
  apiKey: string, query: string, contextBlocks: string[], productLinks: string,
): Promise<{ answer: string; inputTokens: number; outputTokens: number; finishReason: string }> {
  const context = contextBlocks.join("\n\n---\n\n");
  const userMessage =
    `Context from documentation:\n\n${context}\n\n`
    + (productLinks ? `PRODUCT LINKS (use these exact URLs):\n${productLinks}\n\n` : "")
    + `---\n\nUser Question: ${query}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GEN_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_tokens: 4096, // §11
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`generation error: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    choices: { message: { content: string }; finish_reason: string }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    answer: data.choices[0].message.content,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    finishReason: data.choices[0].finish_reason ?? "unknown",
  };
}

function buildUserMessage(query: string, contextBlocks: string[], productLinks: string): string {
  const context = contextBlocks.join("\n\n---\n\n");
  return `Context from documentation:\n\n${context}\n\n`
    + (productLinks ? `PRODUCT LINKS (use these exact URLs):\n${productLinks}\n\n` : "")
    + `---\n\nUser Question: ${query}`;
}

// Streaming variant: calls OpenRouter with stream:true and forwards each token
// delta to `send`. Returns the final finish/usage info.
async function generateStreaming(
  apiKey: string, query: string, contextBlocks: string[], productLinks: string,
  send: (t: string) => void,
): Promise<DoneInfo> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GEN_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(query, contextBlocks, productLinks) },
      ],
      max_tokens: 4096,
      temperature: 0.1,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`generation error: ${res.status} ${await res.text()}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", finish = "stop";
  let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith("data:")) continue;
      const payload = l.slice(5).trim();
      if (payload === "[DONE]") continue;
      let j: any;
      try { j = JSON.parse(payload); } catch { continue; }
      const delta = j.choices?.[0]?.delta?.content;
      if (delta) send(delta);
      if (j.choices?.[0]?.finish_reason) finish = j.choices[0].finish_reason;
      if (j.usage) usage = j.usage;
    }
  }
  return { finish_reason: finish, input_tokens: usage?.prompt_tokens ?? 0, output_tokens: usage?.completion_tokens ?? 0 };
}

// ── Build a context block from a chunk (§2/§3 aware) ─────────────────────────
function toContextBlock(c: Candidate): string {
  const source = c.metadata?.source ?? "unknown";
  const ct = c.metadata?.content_type ?? "text";
  // Note: we deliberately do NOT inject the raw image URL — the model tends to
  // echo and corrupt it. Diagram images are returned separately via `images`.
  return `[Source Document: ${source} | type: ${ct}]\n${c.content}`;
}

// ── Casual-chat detection ────────────────────────────────────────────────────
// Greetings/pleasantries shouldn't run the retrieval+rerank gate (which would
// otherwise return "no documentation"). Fully-anchored so real questions that
// merely start with "hi"/"how" don't get misrouted. Matches v1 system-prompt
// rule #1 (casual chat, no sources).
const CASUAL_RE = new RegExp(
  "^(" +
  "hi+|hey+|hello|hiya|yo|howdy|sup|hola|namaste|greetings|" +
  "(hi|hey|hello) there|" +
  "good\\s*(morning|afternoon|evening|day)|" +
  "how\\s*(are|r)\\s*(you|u)|how'?s\\s*it\\s*going|how\\s*are\\s*things|" +
  "what'?s\\s*up|whats\\s*up|wassup|" +
  "thanks?|thank\\s*you|thx|ty|cheers|much\\s*appreciated|" +
  "bye|goodbye|see\\s*(ya|you)|later|" +
  "ok(ay)?|kk|cool|nice|great|awesome|got\\s*it|" +
  "lol|haha+|" +
  "who\\s*(are|r)\\s*(you|u)|what\\s*(are|r)\\s*(you|u)|what\\s*can\\s*you\\s*do|what\\s*do\\s*you\\s*do|" +
  "introduce\\s*yourself" +
  ")[\\s!.?]*$",
  "i",
);
function isCasualChat(q: string): boolean {
  return CASUAL_RE.test(q.trim());
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function handleChatV2(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL_V2 || !env.SUPABASE_KEY_V2) {
    return jsonResponse({ error: "v2 not configured: set SUPABASE_URL_V2 and SUPABASE_KEY_V2" }, 500);
  }

  const body = (await request.json()) as { query?: string; history?: Msg[]; stream?: boolean };
  const query = body?.query?.trim();
  const history = Array.isArray(body?.history) ? body!.history! : [];
  const wantStream = body?.stream === true;
  if (!query) return jsonResponse({ error: "Missing 'query' field" }, 400);

  const key = env.OPENROUTER_API_KEY;

  // Casual chat (greetings/pleasantries): answer conversationally via the
  // persona, skip retrieval entirely. Keeps the §7 anti-hallucination gate for
  // real technical questions while not stonewalling "Hi".
  if (isCasualChat(query)) {
    const meta = { sources: [], engine: "v2: casual-chat", rewritten_query: query, product_handles: [] };
    if (wantStream) return sseResponse(meta, (send) => generateStreaming(key, query, [], "", send));
    try {
      const gen = await generate(key, query, [], "");
      return jsonResponse({
        answer: gen.answer, input_tokens: gen.inputTokens, output_tokens: gen.outputTokens,
        finish_reason: gen.finishReason, ...meta,
      });
    } catch (e) {
      return jsonResponse({ error: `Generation failed: ${e instanceof Error ? e.message : String(e)}` }, 500);
    }
  }

  // §8 rewrite → §9 resolve handles → embed
  const rewritten = await rewriteQuery(key, query, history);
  const catalog = await fetchProductCatalog(env);
  const handles = resolveProductHandles(rewritten, history, catalog);

  let embedding: number[];
  try {
    embedding = await embedQuery(key, rewritten);
  } catch (e) {
    return jsonResponse({ error: `Embed failed: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }

  // §5+§6 hybrid retrieve (wide) → §7 rerank (gate)
  let candidates: Candidate[];
  try {
    candidates = await hybridRetrieve(env, embedding, rewritten, handles);
  } catch (e) {
    return jsonResponse({ error: `Retrieve failed: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }

  const reranked = await rerank(key, rewritten, candidates);
  // Rerank orders; embedding similarity decides on-topic (robust for thematic
  // queries the literal reranker under-scores, e.g. "problems in chemical industry").
  const maxSim = candidates.reduce((m, c) => Math.max(m, c.similarity ?? 0), 0);
  let top: Candidate[] = reranked.filter((r) => r.score > RERANK_GATE).map((r) => r.chunk);
  if (top.length === 0) top = reranked.slice(0, 3).map((r) => r.chunk); // keep best few for ordering
  // Decline only when genuinely off-topic: weak embedding similarity AND no product resolved.
  if (maxSim < SIM_GATE && handles.length === 0) top = [];

  // §10 safety-critical force-include (before the empty-result gate)
  if (handles.length && isWiringRelatedQuery(rewritten)) {
    const safety = await fetchSafetyChunks(env, handles);
    const seen = new Set(top.map((c) => c.id));
    for (const s of safety) if (!seen.has(s.id)) { top.push(s); seen.add(s.id); }
  }

  // §7 no confident matches → don't hallucinate from weak context
  if (top.length === 0) {
    const declineText = "I don't have documentation covering that. I can help with Load Controls products, wiring, installation, and settings — try rephrasing or naming the product.";
    const meta = {
      sources: [], engine: "v2: hybrid+rerank+gemma-4", rewritten_query: rewritten,
      product_handles: handles, debug_max_sim: Math.round(maxSim * 1000) / 1000,
    };
    if (wantStream) return sseResponse(meta, async (send) => { send(declineText); return { finish_reason: "stop", input_tokens: 0, output_tokens: 0 }; });
    return jsonResponse({ answer: declineText, input_tokens: 0, output_tokens: 0, ...meta });
  }

  // §2 full-table injection: for any spec_table_row, pull the whole table once
  const tableSources = new Set<string>();
  for (const c of top) {
    if (c.metadata?.content_type === "spec_table_row" && c.metadata?.table_source) {
      tableSources.add(c.metadata.table_source);
    }
  }
  const seenIds = new Set(top.map((c) => c.id));
  for (const ts of tableSources) {
    const table = await fetchTable(env, ts);
    if (table && !seenIds.has(table.id)) { top.push(table); seenIds.add(table.id); }
  }

  // §9 product links for the prompt (exact URLs from the resolved catalog)
  const linkedProducts = catalog.filter((p) => handles.includes(p.handle));
  const productLinks = linkedProducts
    .map((p) => `- ${p.title}: https://${env.SHOPIFY_STORE_DOMAIN}/products/${p.handle}`)
    .join("\n");

  const meta = {
    sources: [...new Set(top.map((c) => c.metadata?.source ?? "unknown"))],
    engine: "v2: hybrid+rerank+gemma-4",
    rewritten_query: rewritten,
    product_handles: handles,
    images: top.filter((c) => c.metadata?.image_url).map((c) => c.metadata.image_url),
    debug_chunk_types: top.map((c) => c.metadata?.content_type ?? "text"),
    debug_max_sim: Math.round(maxSim * 1000) / 1000,
  };
  const ctxBlocks = top.map(toContextBlock);

  // §11 generate — stream tokens if requested, else one JSON blob
  if (wantStream) {
    return sseResponse(meta, (send) => generateStreaming(key, query, ctxBlocks, productLinks, send));
  }
  let gen;
  try {
    gen = await generate(key, query, ctxBlocks, productLinks);
  } catch (e) {
    return jsonResponse({ error: `Generation failed: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
  if (gen.finishReason === "length") {
    console.warn("[v2] generation truncated (finish_reason=length) despite max_tokens=4096");
  }
  // Safety net: strip any stray image tokens the model emitted (they corrupt URLs)
  const answer = gen.answer.replace(/\[SHOW_IMAGE(?:_URL)?:[^\]]*\]/gi, "").replace(/\n{3,}/g, "\n\n").trim();

  return jsonResponse({
    answer, input_tokens: gen.inputTokens, output_tokens: gen.outputTokens,
    finish_reason: gen.finishReason, ...meta,
  });
}
