/*
 * Miss MoMo V2 — embeddable chat widget loader
 * ============================================
 * Drop-in floating chat bubble for any website (WordPress, Shopify, plain HTML).
 * Add ONE line to your site, just before </body>:
 *
 *   <script src="https://load-chat-ruddy.vercel.app/embed-v2.js" defer></script>
 *
 * It injects a launcher button that opens the V2 chatbot (chat-v2.html) in an
 * isolated iframe, so it can never clash with your site's CSS/JS.
 *
 * Optional overrides via a global before the script loads:
 *   <script>window.MISSMOMO = { chatUrl: "https://.../chat-v2.html", color: "#d92b2b" };</script>
 */
(function () {
  if (window.__missMomoLoaded) return;
  window.__missMomoLoaded = true;

  var cfg = window.MISSMOMO || {};
  var CHAT_URL = cfg.chatUrl || "https://load-chat-ruddy.vercel.app/chat-v2.html";
  var COLOR    = cfg.color   || "#d92b2b";
  var Z        = 2147483000;

  function el(tag, css) { var e = document.createElement(tag); if (css) e.style.cssText = css; return e; }

  // ── Launcher button ──
  var btn = el("button",
    "position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:0;" +
    "background:" + COLOR + ";color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);" +
    "z-index:" + Z + ";display:flex;align-items:center;justify-content:center;transition:transform .15s;");
  btn.setAttribute("aria-label", "Chat with Miss MoMo");
  btn.innerHTML =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-4 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8Z" fill="#fff"/><circle cx="9" cy="9.5" r="1.2" fill="' + COLOR + '"/><circle cx="12.5" cy="9.5" r="1.2" fill="' + COLOR + '"/><circle cx="16" cy="9.5" r="1.2" fill="' + COLOR + '"/></svg>';
  btn.onmouseenter = function () { btn.style.transform = "scale(1.06)"; };
  btn.onmouseleave = function () { btn.style.transform = "scale(1)"; };

  // ── Panel + iframe ──
  var panel = el("div",
    "position:fixed;right:20px;bottom:92px;width:390px;height:calc(100vh - 120px);max-height:660px;" +
    "border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.28);z-index:" + Z + ";" +
    "background:#fff;display:none;opacity:0;transform:translateY(12px);transition:opacity .18s,transform .18s;");

  var frame = el("iframe", "width:100%;height:100%;border:0;display:block;");
  frame.setAttribute("title", "Miss MoMo chat");
  frame.setAttribute("allow", "clipboard-write");
  panel.appendChild(frame);

  // ── Responsive: full-screen on phones ──
  var style = el("style");
  style.textContent =
    "@media (max-width:640px){" +
    "  #mm-panel{right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;max-height:none!important;border-radius:0!important;}" +
    "  #mm-btn{right:16px!important;bottom:16px!important;}" +
    "}";
  panel.id = "mm-panel"; btn.id = "mm-btn";
  document.head.appendChild(style);

  var open = false, loaded = false;
  function setOpen(v) {
    open = v;
    if (v) {
      if (!loaded) { frame.src = CHAT_URL; loaded = true; }   // lazy-load on first open
      panel.style.display = "block";
      requestAnimationFrame(function () { panel.style.opacity = "1"; panel.style.transform = "translateY(0)"; });
      btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
    } else {
      panel.style.opacity = "0"; panel.style.transform = "translateY(12px)";
      setTimeout(function () { if (!open) panel.style.display = "none"; }, 180);
      btn.innerHTML =
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-4 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8Z" fill="#fff"/><circle cx="9" cy="9.5" r="1.2" fill="' + COLOR + '"/><circle cx="12.5" cy="9.5" r="1.2" fill="' + COLOR + '"/><circle cx="16" cy="9.5" r="1.2" fill="' + COLOR + '"/></svg>';
    }
  }
  btn.onclick = function () { setOpen(!open); };

  function mount() { document.body.appendChild(btn); document.body.appendChild(panel); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
