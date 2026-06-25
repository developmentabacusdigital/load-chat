(function () {
  'use strict';

  // ─── Config — override via window.MoMoConfig before this script loads ───────
  var cfg          = window.MoMoConfig || {};
  var API_URL      = cfg.apiUrl      || 'https://rag-worker.abhijaydutta123.workers.dev';
  var SUPPORT_PAGE = cfg.supportPage || '/pages/support';
  var ASSET_BASE   = cfg.assetBase   || 'https://load-chat-ruddy.vercel.app';

  if (document.getElementById('momo-widget-root')) return; // prevent double-init

  // ─── Load marked.js on demand ────────────────────────────────────────────────
  function loadMarked(cb) {
    if (window.marked) { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    s.onload = cb;
    s.onerror = cb; // still init widget even if marked fails to load
    document.head.appendChild(s);
  }

  function parseMarkdown(text) {
    try {
      if (!window.marked) return text.replace(/\n/g, '<br>');
      var html = window.marked.parse(text, { breaks: true, gfm: true });
      // open all links in new tab without touching the marked Renderer API
      return html.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
    } catch (e) {
      return text.replace(/\n/g, '<br>');
    }
  }

  // ─── Styles (scoped to #momo-widget-root, !important on layout-critical props) ─
  var css = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');

    #momo-widget-root *, #momo-widget-root *::before, #momo-widget-root *::after {
      box-sizing: border-box !important; font-family: 'Outfit', sans-serif !important;
    }
    #momo-widget-root img { max-width: none !important; }

    /* Bubble */
    #momo-bubble {
      all: unset;
      position: fixed !important; bottom: 28px !important; right: 28px !important; z-index: 99999 !important;
      width: 64px !important; height: 64px !important; border-radius: 50% !important;
      background: #C42633 !important; cursor: pointer !important;
      box-shadow: 0 8px 28px rgba(196,38,51,0.45) !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      transition: transform 0.2s, box-shadow 0.2s !important;
    }
    #momo-bubble:hover { transform: scale(1.08) !important; box-shadow: 0 12px 36px rgba(196,38,51,0.55) !important; }
    #momo-bubble svg { width: 28px !important; height: 28px !important; fill: #fff !important; }
    #momo-bubble-badge {
      position: absolute !important; top: -4px !important; right: -4px !important;
      width: 18px !important; height: 18px !important; border-radius: 50% !important;
      background: #27A644 !important; border: 2px solid #fff !important;
      animation: momo-pulse 2s infinite !important;
    }
    @keyframes momo-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(39,166,68,0.5); }
      50%      { box-shadow: 0 0 0 6px rgba(39,166,68,0); }
    }

    /* Panel */
    #momo-panel {
      position: fixed !important; bottom: 104px !important; right: 28px !important; z-index: 99998 !important;
      width: 380px !important; height: 540px !important;
      background: #fff !important; border-radius: 20px !important;
      box-shadow: 0 20px 60px rgba(0,0,0,0.18) !important;
      border: 1px solid #E8E8ED !important;
      display: flex !important; flex-direction: column !important; overflow: hidden !important;
      transform: scale(0.92) translateY(16px) !important; opacity: 0 !important; pointer-events: none !important;
      transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), opacity 0.2s, width 0.25s, height 0.25s, bottom 0.25s, right 0.25s, border-radius 0.25s !important;
      transform-origin: bottom right !important; margin: 0 !important; padding: 0 !important;
    }
    #momo-panel.momo-open {
      transform: scale(1) translateY(0) !important; opacity: 1 !important; pointer-events: all !important;
    }
    #momo-panel.momo-fullscreen {
      top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
      width: 100% !important; height: 100% !important; border-radius: 0 !important;
      transform: scale(1) translateY(0) !important;
    }

    /* Panel Header */
    .momo-panel-header {
      background: #C42633 !important; padding: 14px 16px !important;
      display: flex !important; align-items: center !important; gap: 10px !important; flex-shrink: 0 !important;
      margin: 0 !important;
    }
    .momo-header-avatar {
      width: 38px !important; height: 38px !important; border-radius: 50% !important; overflow: hidden !important;
      background: rgba(255,255,255,0.15) !important; flex-shrink: 0 !important;
      margin: 0 !important; padding: 0 !important;
    }
    .momo-header-avatar img { width: 100% !important; height: 100% !important; object-fit: cover !important; display: block !important; }
    .momo-header-info { flex: 1 !important; min-width: 0 !important; }
    .momo-header-info strong { display: block !important; color: #fff !important; font-size: 0.92rem !important; font-weight: 700 !important; line-height: 1.2 !important; }
    .momo-header-info span { color: rgba(255,255,255,0.85) !important; font-size: 0.72rem !important; display: flex !important; align-items: center !important; gap: 4px !important; }
    .momo-status-dot {
      width: 8px !important; height: 8px !important; border-radius: 50% !important; background: #27A644 !important;
      display: inline-block !important; flex-shrink: 0 !important;
    }
    .momo-header-actions { display: flex !important; gap: 6px !important; flex-shrink: 0 !important; }
    .momo-icon-btn {
      all: unset !important;
      width: 30px !important; height: 30px !important; border-radius: 50% !important; cursor: pointer !important;
      background: rgba(255,255,255,0.18) !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      transition: background 0.2s !important;
    }
    .momo-icon-btn:hover { background: rgba(255,255,255,0.32) !important; }
    .momo-icon-btn svg { width: 15px !important; height: 15px !important; display: block !important; }

    /* Chat body */
    .momo-chat-body {
      flex: 1 !important; overflow-y: auto !important; padding: 16px !important;
      display: flex !important; flex-direction: column !important; gap: 14px !important;
      scroll-behavior: smooth !important; background: #F9F9FB !important; margin: 0 !important;
    }
    .momo-chat-body::-webkit-scrollbar { width: 4px !important; }
    .momo-chat-body::-webkit-scrollbar-thumb { background: #D1D1D1 !important; border-radius: 10px !important; }

    /* Messages */
    .momo-msg { display: flex !important; gap: 8px !important; animation: momo-fadeIn 0.25s ease !important; margin: 0 !important; }
    .momo-msg.momo-user { flex-direction: row-reverse !important; }
    .momo-msg-avatar { width: 30px !important; height: 30px !important; border-radius: 50% !important; overflow: hidden !important; flex-shrink: 0 !important; align-self: flex-end !important; }
    .momo-msg-avatar img { width: 100% !important; height: 100% !important; object-fit: cover !important; display: block !important; }
    .momo-msg-content { max-width: 82% !important; display: flex !important; flex-direction: column !important; gap: 4px !important; }
    .momo-msg.momo-user .momo-msg-content { align-items: flex-end !important; }
    .momo-bubble-text {
      padding: 10px 14px !important; border-radius: 14px !important; font-size: 0.85rem !important; line-height: 1.55 !important;
      word-break: break-word !important; white-space: normal !important; margin: 0 !important;
    }
    .momo-msg.momo-user .momo-bubble-text { background: #C42633 !important; color: #fff !important; border-bottom-right-radius: 3px !important; }
    .momo-msg.momo-ai .momo-bubble-text  { background: #fff !important; color: #1D1D21 !important; border-bottom-left-radius: 3px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.06) !important; }
    .momo-bubble-text p { margin: 0 0 8px 0 !important; }
    .momo-bubble-text p:last-child { margin-bottom: 0 !important; }
    .momo-bubble-text ul, .momo-bubble-text ol { margin: 0 0 8px 16px !important; padding: 0 !important; }
    .momo-bubble-text li { margin: 0 0 4px 0 !important; }
    .momo-bubble-text code { background: rgba(0,0,0,0.06) !important; padding: 1px 5px !important; border-radius: 3px !important; font-family: monospace !important; }
    .momo-bubble-text strong { font-weight: 700 !important; }
    .momo-bubble-text a { color: #C42633 !important; text-decoration: underline !important; font-weight: 600 !important; }
    .momo-bubble-text a:hover { color: #A51D29 !important; }
    .momo-sources { display: flex !important; flex-wrap: wrap !important; gap: 4px !important; margin: 6px 0 0 0 !important; }
    .momo-badge {
      background: #FCE8E9 !important; color: #C42633 !important; border: 1px solid rgba(196,38,51,0.12) !important;
      padding: 2px 8px !important; border-radius: 20px !important; font-size: 0.68rem !important; font-weight: 700 !important;
    }
    .momo-msg-imgs { margin: 6px 0 0 0 !important; }
    .momo-inline-img { max-width: 100% !important; border-radius: 6px !important; border: 1px solid #E8E8ED !important; margin-bottom: 6px !important; display: block !important; }

    /* Thinking dots */
    .momo-thinking { display: flex !important; gap: 4px !important; padding: 4px 0 !important; align-items: center !important; }
    .momo-thinking span {
      width: 6px !important; height: 6px !important; background: #A0A0B0 !important; border-radius: 50% !important;
      animation: momo-dots 1s infinite ease-in-out !important; display: block !important;
    }
    .momo-thinking span:nth-child(2) { animation-delay: 0.2s !important; }
    .momo-thinking span:nth-child(3) { animation-delay: 0.4s !important; }
    @keyframes momo-dots {
      0%,60%,100% { transform: translateY(0); }
      30%          { transform: translateY(-4px); }
    }

    /* Input area */
    .momo-input-area {
      padding: 12px 14px !important; border-top: 1px solid #E8E8ED !important;
      background: #fff !important; flex-shrink: 0 !important; margin: 0 !important;
    }
    .momo-input-row {
      display: flex !important; align-items: center !important; gap: 6px !important;
      background: #F9F9FB !important; border: 1.5px solid #E8E8ED !important;
      border-radius: 30px !important; padding: 4px 4px 4px 14px !important;
      transition: border-color 0.2s !important; margin: 0 !important;
    }
    .momo-input-row:focus-within { border-color: #C42633 !important; }
    .momo-input-row input {
      all: unset !important;
      flex: 1 !important; font-size: 0.88rem !important; color: #1D1D21 !important;
      height: 36px !important; line-height: 36px !important; cursor: text !important;
    }
    .momo-send-btn {
      all: unset !important;
      width: 36px !important; height: 36px !important; border-radius: 50% !important; background: #C42633 !important;
      cursor: pointer !important; display: flex !important; align-items: center !important;
      justify-content: center !important; transition: background 0.2s, transform 0.15s !important; flex-shrink: 0 !important;
    }
    .momo-send-btn:hover { background: #A51D29 !important; transform: scale(1.05) !important; }
    .momo-send-btn:disabled { background: #D1D1D1 !important; cursor: not-allowed !important; transform: none !important; }
    .momo-send-btn svg { width: 15px !important; height: 15px !important; stroke: #fff !important; fill: none !important; display: block !important; }
    .momo-input-footer {
      text-align: center !important; font-size: 0.62rem !important; color: #B0B0C0 !important;
      margin: 6px 0 0 0 !important; font-weight: 600 !important; text-transform: uppercase !important; letter-spacing: 0.04em !important;
    }
    .momo-full-page-link {
      display: block !important; text-align: center !important; margin: 0 0 8px 0 !important;
      font-size: 0.76rem !important; font-weight: 600 !important; color: #C42633 !important;
      text-decoration: none !important; padding: 6px !important; border-radius: 8px !important;
      border: 1px solid rgba(196,38,51,0.2) !important; transition: background 0.2s !important;
    }
    .momo-full-page-link:hover { background: #FCE8E9 !important; }

    /* Welcome card */
    .momo-welcome-card {
      background: #fff !important; border: 1px solid #E8E8ED !important; border-radius: 14px !important;
      padding: 16px !important; text-align: center !important; box-shadow: 0 2px 8px rgba(0,0,0,0.05) !important;
      margin: 0 !important;
    }
    .momo-welcome-card h4 { color: #C42633 !important; font-size: 0.92rem !important; margin: 0 0 6px 0 !important; font-weight: 700 !important; }
    .momo-welcome-card p { color: #5E5E6E !important; font-size: 0.78rem !important; margin: 0 0 12px 0 !important; line-height: 1.4 !important; }
    .momo-suggestions { display: flex !important; flex-direction: column !important; gap: 6px !important; }
    .momo-suggestion {
      all: unset !important;
      display: block !important; width: 100% !important;
      background: #F9F9FB !important; border: 1px solid #E8E8ED !important; border-radius: 8px !important;
      padding: 8px 12px !important; font-size: 0.76rem !important; font-weight: 600 !important;
      color: #333 !important; cursor: pointer !important; text-align: left !important;
      transition: all 0.15s !important; line-height: 1.4 !important;
    }
    .momo-suggestion:hover { border-color: #C42633 !important; background: #FCE8E9 !important; color: #C42633 !important; }

    /* Tooltip overlay */
    #momo-tooltip {
      position: fixed !important; bottom: 104px !important; right: 104px !important; z-index: 99997 !important;
      background: #fff !important; border-radius: 14px !important; padding: 14px 16px !important;
      box-shadow: 0 8px 30px rgba(0,0,0,0.14) !important; border: 1px solid #E8E8ED !important;
      max-width: 240px !important; animation: momo-fadeIn 0.3s ease !important;
      display: none !important;
    }
    #momo-tooltip.momo-show { display: block !important; }
    #momo-tooltip p { font-size: 0.82rem !important; color: #1D1D21 !important; line-height: 1.4 !important; margin: 0 0 8px 0 !important; }
    #momo-tooltip .momo-tooltip-close {
      position: absolute !important; top: 8px !important; right: 10px !important; cursor: pointer !important;
      font-size: 1rem !important; color: #A0A0B0 !important; line-height: 1 !important;
    }
    #momo-tooltip .momo-tooltip-cta {
      all: unset !important;
      display: inline-block !important;
      background: #C42633 !important; color: #fff !important; border-radius: 6px !important;
      padding: 6px 14px !important; font-size: 0.78rem !important; font-weight: 700 !important; cursor: pointer !important;
    }
    #momo-tooltip .momo-tooltip-cta:hover { background: #A51D29 !important; }

    /* Product page contextual badge */
    #momo-context-badge {
      position: fixed !important; bottom: 104px !important; right: 28px !important; z-index: 99997 !important;
      background: #1D1D21 !important; color: #fff !important; border-radius: 10px !important;
      padding: 10px 14px !important; font-size: 0.78rem !important; font-weight: 600 !important;
      max-width: 220px !important; cursor: pointer !important; box-shadow: 0 6px 20px rgba(0,0,0,0.2) !important;
      display: none !important; line-height: 1.4 !important;
    }
    #momo-context-badge.momo-show { display: block !important; }
    #momo-context-badge span { color: #ff9999 !important; }

    @keyframes momo-fadeIn  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes momo-slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

    /* Mobile */
    @media (max-width: 480px) {
      #momo-panel { width: calc(100vw - 24px) !important; right: 12px !important; bottom: 88px !important; height: 70vh !important; }
      #momo-bubble { bottom: 16px !important; right: 16px !important; }
      #momo-tooltip { right: 12px !important; bottom: 88px !important; max-width: calc(100vw - 48px) !important; }
      #momo-context-badge { right: 12px !important; max-width: calc(100vw - 80px) !important; }
    }
  `;

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ─── HTML ────────────────────────────────────────────────────────────────────
  var root = document.createElement('div');
  root.id = 'momo-widget-root';
  root.innerHTML = `
    <!-- Tooltip overlay (first visit / product page) -->
    <div id="momo-tooltip">
      <span class="momo-tooltip-close" id="momo-tooltip-close">&times;</span>
      <p id="momo-tooltip-text">Hi! I'm <strong>Miss MoMo</strong>, your motor protection expert. Have a question?</p>
      <button class="momo-tooltip-cta" id="momo-tooltip-cta">Ask Miss MoMo</button>
      <div class="momo-tooltip-arrow"></div>
    </div>

    <!-- Contextual product badge -->
    <div id="momo-context-badge">
      <span class="momo-badge-close" id="momo-context-close">&times;</span>
      Have questions about this product? <span>Ask Miss MoMo →</span>
    </div>

    <!-- Floating Bubble -->
    <button id="momo-bubble" aria-label="Chat with Miss MoMo">
      <div id="momo-bubble-badge"></div>
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/>
      </svg>
    </button>

    <!-- Chat Panel -->
    <div id="momo-panel" role="dialog" aria-label="Miss MoMo chat">
      <div class="momo-panel-header">
        <div class="momo-header-avatar">
          <img src="${ASSET_BASE}/momo.gif" alt="Miss MoMo" id="momo-avatar-img">
        </div>
        <div class="momo-header-info">
          <strong>Miss MoMo</strong>
          <span><span class="momo-status-dot" id="momo-status-dot"></span><span id="momo-status-label">Ready</span></span>
        </div>
        <div class="momo-header-actions">
          <button class="momo-icon-btn" id="momo-fullscreen-btn" aria-label="Toggle fullscreen">
            <svg id="momo-fs-expand-icon" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
            <svg id="momo-fs-compress-icon" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">
              <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
              <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
            </svg>
          </button>
          <a href="${SUPPORT_PAGE}" class="momo-icon-btn momo-expand-btn" title="Open full support page" aria-label="Open full support page">
            <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
          <button class="momo-icon-btn" id="momo-close-btn" aria-label="Close chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="momo-chat-body" id="momo-chat-body">
        <!-- Welcome card -->
        <div class="momo-welcome-card" id="momo-welcome-card">
          <h4>Hi! I'm Miss MoMo 👋</h4>
          <p>Your motor protection & load monitoring expert. What can I help with?</p>
          <div class="momo-suggestions">
            <button class="momo-suggestion" data-q="What is the Electronic Shear Pin control used for?">⚡ What is the Electronic Shear Pin?</button>
            <button class="momo-suggestion" data-q="How do I install the PMP-25?">🔧 How do I install the PMP-25?</button>
            <button class="momo-suggestion" data-q="What is the difference between UPC and PFR?">📊 UPC vs PFR — what's the difference?</button>
          </div>
        </div>
      </div>

      <div class="momo-input-area">
        <div class="momo-input-row">
          <input type="text" id="momo-input" placeholder="Ask me anything..." autocomplete="off">
          <button class="momo-send-btn" id="momo-send-btn" aria-label="Send">
            <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2" fill="#fff" stroke="none"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // ─── DOM refs ────────────────────────────────────────────────────────────────
  var bubble           = document.getElementById('momo-bubble');
  var panel            = document.getElementById('momo-panel');
  var closeBtn         = document.getElementById('momo-close-btn');
  var fullscreenBtn    = document.getElementById('momo-fullscreen-btn');
  var fsExpandIcon     = document.getElementById('momo-fs-expand-icon');
  var fsCompressIcon   = document.getElementById('momo-fs-compress-icon');
  var chatBody         = document.getElementById('momo-chat-body');
  var input            = document.getElementById('momo-input');
  var sendBtn          = document.getElementById('momo-send-btn');
  var statusDot        = document.getElementById('momo-status-dot');
  var statusLabel      = document.getElementById('momo-status-label');
  var avatarImg        = document.getElementById('momo-avatar-img');
  var welcomeCard      = document.getElementById('momo-welcome-card');
  var tooltip          = document.getElementById('momo-tooltip');
  var tooltipText      = document.getElementById('momo-tooltip-text');
  var tooltipCta       = document.getElementById('momo-tooltip-cta');
  var tooltipClose     = document.getElementById('momo-tooltip-close');
  var ctxBadge         = document.getElementById('momo-context-badge');
  var ctxClose         = document.getElementById('momo-context-close');

  var isOpen       = false;
  var isTyping     = false;
  var isFullscreen = false;

  // ─── Panel open/close ────────────────────────────────────────────────────────
  function openPanel() {
    isOpen = true;
    panel.classList.add('momo-open');
    bubble.setAttribute('aria-expanded', 'true');
    hideTooltip();
    hideContextBadge();
    setTimeout(function () { input.focus(); }, 250);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('momo-open');
    bubble.setAttribute('aria-expanded', 'false');
  }

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
    panel.classList.toggle('momo-fullscreen', isFullscreen);
    fsExpandIcon.style.display   = isFullscreen ? 'none'  : '';
    fsCompressIcon.style.display = isFullscreen ? ''      : 'none';
  }

  bubble.addEventListener('click', function () { isOpen ? closePanel() : openPanel(); });
  closeBtn.addEventListener('click', closePanel);
  fullscreenBtn.addEventListener('click', toggleFullscreen);

  // ─── Tooltip ─────────────────────────────────────────────────────────────────
  function showTooltip(text) {
    tooltipText.innerHTML = text;
    tooltip.classList.add('momo-show');
  }
  function hideTooltip() { tooltip.classList.remove('momo-show'); }

  tooltipClose.addEventListener('click', function () {
    hideTooltip();
    localStorage.setItem('momo_welcomed', '1');
  });
  tooltipCta.addEventListener('click', function () {
    hideTooltip();
    openPanel();
    localStorage.setItem('momo_welcomed', '1');
  });

  // ─── Context badge ───────────────────────────────────────────────────────────
  function showContextBadge() { ctxBadge.classList.add('momo-show'); }
  function hideContextBadge() { ctxBadge.classList.remove('momo-show'); }

  ctxClose.addEventListener('click', function (e) {
    e.stopPropagation();
    hideContextBadge();
    sessionStorage.setItem('momo_ctx_dismissed', '1');
  });
  ctxBadge.addEventListener('click', function () { openPanel(); });

  // ─── Overlay logic ───────────────────────────────────────────────────────────
  function initOverlays() {
    var isProductPage = /\/products\//.test(window.location.pathname);
    var welcomed      = localStorage.getItem('momo_welcomed');
    var ctxDismissed  = sessionStorage.getItem('momo_ctx_dismissed');

    if (isProductPage && !ctxDismissed) {
      // Show the dark contextual badge after 2s on product pages
      setTimeout(function () {
        if (!isOpen) showContextBadge();
      }, 2000);
    } else if (!welcomed) {
      // Show welcome tooltip after 4s on first ever visit
      setTimeout(function () {
        if (!isOpen) {
          showTooltip('Hi! I\'m <strong>Miss MoMo</strong> — your motor protection expert. Have a question about our products?');
        }
      }, 4000);
    }
  }

  // ─── Chat logic ──────────────────────────────────────────────────────────────
  function appendMsg(role, html, sources) {
    if (welcomeCard) { welcomeCard.remove(); welcomeCard = null; }

    var div = document.createElement('div');
    div.className = 'momo-msg ' + (role === 'user' ? 'momo-user' : 'momo-ai');

    var sourcesHtml = '';
    if (sources && sources.length) {
      sourcesHtml = '<div class="momo-sources">' +
        sources.map(function (s) { return '<span class="momo-badge">📄 ' + s + '</span>'; }).join('') +
        '</div>';
    }

    div.innerHTML =
      '<div class="momo-msg-content">' +
        '<div class="momo-bubble-text">' + html + '</div>' +
        sourcesHtml +
      '</div>';
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
    return div;
  }

  function showThinking() {
    var div = document.createElement('div');
    div.className = 'momo-msg momo-ai';
    div.id = 'momo-thinking';
    div.innerHTML =
      '<div class="momo-msg-content"><div class="momo-bubble-text">' +
        '<div class="momo-thinking"><span></span><span></span><span></span></div>' +
      '</div></div>';
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function hideThinking() {
    var el = document.getElementById('momo-thinking');
    if (el) el.remove();
  }

  function setStatus(state) {
    if (state === 'thinking') {
      statusDot.style.background = '#F59E0B';
      statusLabel.textContent = 'Thinking...';
      avatarImg.src = ASSET_BASE + '/Thinking_Momo.gif';
    } else if (state === 'offline') {
      statusDot.style.background = '#EF4444';
      statusLabel.textContent = 'Offline';
    } else {
      statusDot.style.background = '#27A644';
      statusLabel.textContent = 'Ready';
      avatarImg.src = ASSET_BASE + '/momo.gif';
    }
  }

  async function sendMessage() {
    var query = input.value.trim();
    if (!query || isTyping) return;

    isTyping = true;
    localStorage.setItem('momo_welcomed', '1');

    appendMsg('user', query);
    input.value = '';
    sendBtn.disabled = true;
    showThinking();
    setStatus('thinking');

    try {
      var res = await fetch(API_URL + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query }),
      });
      var data = await res.json();
      hideThinking();

      if (res.ok) {
        // Strip any [SHOW_IMAGE:N] tags from the answer (images not shown in widget)
        var cleanAnswer = data.answer.replace(/\[SHOW_IMAGE:\s*\d+\]/g, '').trim();
        // Also strip embedded base64 image markdown so they don't clutter the text
        cleanAnswer = cleanAnswer.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, '');

        var html = parseMarkdown(cleanAnswer);
        appendMsg('ai', html, data.sources || []);
      } else {
        appendMsg('ai', '<strong>Error:</strong> ' + (data.error || 'The AI service encountered an issue.'));
      }
    } catch (err) {
      hideThinking();
      appendMsg('ai', '<strong>Connection error.</strong> Could not reach Miss MoMo. Please try again.');
    } finally {
      isTyping = false;
      sendBtn.disabled = false;
      setStatus('ready');
      input.focus();
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Suggestion chips
  root.querySelectorAll('.momo-suggestion').forEach(function (btn) {
    btn.addEventListener('click', function () {
      input.value = btn.dataset.q;
      openPanel();
      sendMessage();
    });
  });

  // ─── Health check ────────────────────────────────────────────────────────────
  fetch(API_URL + '/health').catch(function () { setStatus('offline'); });

  // ─── Load marked.js then init overlays ───────────────────────────────────────
  loadMarked(initOverlays);
})();
