/*
 * Miss MoMo V2 — embeddable chat widget loader
 * ============================================
 * Drop-in floating chat bubble for any website (WordPress, Shopify, plain HTML).
 * Add ONE line to your site, just before </body>:
 *
 *   <script src="https://load-chat-ruddy.vercel.app/embed-v2.js" defer></script>
 *
 * It injects a floating (animated) launcher that opens the V2 chatbot in an
 * isolated iframe, plus a one-time greeting bubble a few seconds after arrival.
 *
 * Optional overrides via a global before the script loads:
 *   <script>window.MISSMOMO = { chatUrl: "https://.../chat-v2.html" };</script>
 */
(function () {
  if (window.__missMomoLoaded) return;
  window.__missMomoLoaded = true;

  var cfg = window.MISSMOMO || {};
  var CHAT_URL = cfg.chatUrl || "https://load-chat-ruddy.vercel.app/chat-v2.html";
  var ASSET    = CHAT_URL.replace(/\/[^/]*$/, "");          // directory of the chat page
  var GIF      = cfg.gif || (ASSET + "/momo-float.gif");
  var GREETING = cfg.greeting ||
    "Hi, I'm Miss MoMo! 👋 Need help finding the right Load Controls product, wiring, specs, or installation info? Just ask — I'm here to help.";
  var Z = 2147483000;
  var SANS = "'DM Sans',-apple-system,system-ui,Segoe UI,Roboto,sans-serif";

  function el(tag, css) { var e = document.createElement(tag); if (css) e.style.cssText = css; return e; }

  // ── Animated floating launcher (the GIF) ──
  var btn = el("button",
    "position:fixed;right:20px;bottom:20px;width:66px;height:66px;border-radius:50%;padding:0;" +
    "border:3px solid #C6283D;box-sizing:border-box;overflow:hidden;background:#fff;cursor:pointer;" +
    "display:flex;align-items:center;justify-content:center;" +
    "box-shadow:0 6px 20px rgba(0,0,0,.22);z-index:" + Z + ";transition:transform .15s;");
  btn.id = "mm-btn";
  btn.setAttribute("aria-label", "Chat with Miss MoMo");
  var GIF_HTML   = '<img src="' + GIF + '" alt="Miss MoMo" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:50%;" />';
  var CLOSE_HTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#C6283D" stroke-width="2.4" stroke-linecap="round"/></svg>';
  btn.innerHTML = GIF_HTML;
  btn.onmouseenter = function () { btn.style.transform = "scale(1.06)"; };
  btn.onmouseleave = function () { btn.style.transform = "scale(1)"; };

  // ── Greeting bubble (once per session, after a short delay) ──
  var bubble = el("div",
    "position:fixed;right:22px;bottom:98px;max-width:250px;background:#fff;color:#171717;" +
    "padding:12px 30px 12px 14px;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.18);" +
    "font:14px/1.45 " + SANS + ";z-index:" + Z + ";display:none;opacity:0;" +
    "transform-origin:bottom right;cursor:pointer;");
  bubble.id = "mm-bubble";
  bubble.innerHTML =
    '<span style="position:absolute;top:6px;right:8px;font-size:16px;line-height:1;color:#8f8f8f;' +
    'cursor:pointer;padding:2px 4px;" id="mm-bubble-x" aria-label="Dismiss">×</span>' +
    '<div>' + GREETING.replace(/</g, "&lt;") + "</div>" +
    // little tail pointing toward the button
    '<span style="position:absolute;bottom:-6px;right:26px;width:14px;height:14px;background:#fff;' +
    'transform:rotate(45deg);box-shadow:3px 3px 6px rgba(0,0,0,.06);"></span>';

  // ── Panel + iframe ──
  var panel = el("div",
    "position:fixed;right:20px;bottom:96px;width:390px;height:calc(100vh - 124px);max-height:660px;" +
    "border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.28);z-index:" + Z + ";" +
    "background:#fff;display:none;opacity:0;transform:translateY(12px);transition:opacity .18s,transform .18s;");
  panel.id = "mm-panel";
  var frame = el("iframe", "width:100%;height:100%;border:0;display:block;");
  frame.setAttribute("title", "Miss MoMo chat");
  frame.setAttribute("allow", "clipboard-write");
  panel.appendChild(frame);

  // ── Responsive: full-screen panel on phones ──
  var style = el("style");
  style.textContent =
    "@keyframes mm-pop{0%{opacity:0;transform:scale(.5)}55%{opacity:1;transform:scale(1.08)}75%{transform:scale(.97)}100%{opacity:1;transform:scale(1)}}" +
    "@media (max-width:640px){" +
    "  #mm-panel{right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;max-height:none!important;border-radius:0!important;}" +
    "  #mm-btn{right:16px!important;bottom:16px!important;}" +
    "  #mm-bubble{right:16px!important;max-width:72vw!important;}" +
    "}";
  document.head.appendChild(style);

  function showBubble() {
    bubble.style.display = "block";
    bubble.style.animation = "none";
    requestAnimationFrame(function () { bubble.style.animation = "mm-pop .5s cubic-bezier(.2,.8,.3,1.1) forwards"; });
  }
  function hideBubble() {
    bubble.style.animation = "none";
    bubble.style.transition = "opacity .2s ease, transform .2s ease";
    bubble.style.opacity = "0"; bubble.style.transform = "scale(.9)";
    setTimeout(function () { bubble.style.display = "none"; }, 220);
  }

  var open = false, loaded = false;
  function setOpen(v) {
    open = v;
    try { localStorage.setItem("mm-open", v ? "1" : "0"); } catch (e) {}  // remember across pages
    if (v) {
      hideBubble();
      btn.innerHTML = CLOSE_HTML;   // launcher turns into a × while open
      if (!loaded) { frame.src = CHAT_URL; loaded = true; }   // lazy-load on first open
      panel.style.display = "block";
      requestAnimationFrame(function () { panel.style.opacity = "1"; panel.style.transform = "translateY(0)"; });
    } else {
      btn.innerHTML = GIF_HTML;     // back to the animated launcher
      panel.style.opacity = "0"; panel.style.transform = "translateY(12px)";
      setTimeout(function () { if (!open) panel.style.display = "none"; }, 180);
    }
  }
  btn.onclick = function () { setOpen(!open); };
  bubble.onclick = function () { setOpen(true); };

  // The chatbot (inside the iframe) posts this when its in-chat close is tapped
  window.addEventListener("message", function (e) {
    if (e && e.data && e.data.type === "missmomo-close") setOpen(false);
  });

  function mount() {
    document.body.appendChild(btn);
    document.body.appendChild(bubble);
    document.body.appendChild(panel);
    document.getElementById("mm-bubble-x").addEventListener("click", function (ev) { ev.stopPropagation(); hideBubble(); });

    // Keep the chat open across page navigations if it was open (conversation is
    // restored inside the iframe from its own localStorage). On phones the panel
    // is full-screen, so we DON'T auto-reopen there — it would cover the page the
    // visitor just navigated to; the conversation is still preserved on reopen.
    try {
      if (localStorage.getItem("mm-open") === "1" && window.innerWidth > 640) { setOpen(true); return; }
    } catch (e) {}

    // One-time greeting: 6–10s after the visitor arrives, once per session
    try {
      if (!sessionStorage.getItem("mm-greeted")) {
        var delay = 6000 + Math.random() * 4000;
        setTimeout(function () {
          if (open) return;
          sessionStorage.setItem("mm-greeted", "1");
          showBubble();
          setTimeout(function () { if (!open) hideBubble(); }, 12000); // auto-dismiss after a while
        }, delay);
      }
    } catch (e) {}
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
