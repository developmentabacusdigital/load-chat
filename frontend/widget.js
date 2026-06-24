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
    document.head.appendChild(s);
  }

  // ─── Styles (all prefixed momo- to avoid Shopify conflicts) ─────────────────
  var css = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');

    #momo-widget-root * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }

    /* Bubble */
    #momo-bubble {
      position: fixed; bottom: 28px; right: 28px; z-index: 99999;
      width: 64px; height: 64px; border-radius: 50%;
      background: #C42633; border: none; cursor: pointer;
      box-shadow: 0 8px 28px rgba(196,38,51,0.45);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #momo-bubble:hover { transform: scale(1.08); box-shadow: 0 12px 36px rgba(196,38,51,0.55); }
    #momo-bubble svg { width: 28px; height: 28px; fill: #fff; }
    #momo-bubble-badge {
      position: absolute; top: -4px; right: -4px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #27A644; border: 2px solid #fff;
      animation: momo-pulse 2s infinite;
    }
    @keyframes momo-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(39,166,68,0.5); }
      50%      { box-shadow: 0 0 0 6px rgba(39,166,68,0); }
    }

    /* Panel */
    #momo-panel {
      position: fixed; bottom: 104px; right: 28px; z-index: 99998;
      width: 380px; height: 540px;
      background: #fff; border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.18);
      border: 1px solid #E8E8ED;
      display: flex; flex-direction: column; overflow: hidden;
      transform: scale(0.92) translateY(16px); opacity: 0; pointer-events: none;
      transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), opacity 0.2s;
      transform-origin: bottom right;
    }
    #momo-panel.momo-open {
      transform: scale(1) translateY(0); opacity: 1; pointer-events: all;
    }

    /* Panel Header */
    .momo-panel-header {
      background: #C42633; padding: 16px 20px;
      display: flex; align-items: center; gap: 10px; flex-shrink: 0;
    }
    .momo-header-avatar {
      width: 38px; height: 38px; border-radius: 50%; overflow: hidden;
      background: rgba(255,255,255,0.15); flex-shrink: 0;
    }
    .momo-header-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .momo-header-info { flex: 1; }
    .momo-header-info strong { display: block; color: #fff; font-size: 0.95rem; font-weight: 700; }
    .momo-header-info span { color: rgba(255,255,255,0.8); font-size: 0.75rem; }
    .momo-status-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #27A644;
      display: inline-block; margin-right: 4px;
    }
    .momo-header-actions { display: flex; gap: 6px; }
    .momo-icon-btn {
      width: 32px; height: 32px; border-radius: 50%; border: none; cursor: pointer;
      background: rgba(255,255,255,0.18); display: flex; align-items: center;
      justify-content: center; transition: background 0.2s; color: #fff;
    }
    .momo-icon-btn:hover { background: rgba(255,255,255,0.32); }
    .momo-icon-btn svg { width: 16px; height: 16px; fill: #fff; }
    .momo-expand-btn svg { stroke: #fff; fill: none; }

    /* Chat body */
    .momo-chat-body {
      flex: 1; overflow-y: auto; padding: 20px 16px;
      display: flex; flex-direction: column; gap: 16px;
      scroll-behavior: smooth; background: #F9F9FB;
    }
    .momo-chat-body::-webkit-scrollbar { width: 4px; }
    .momo-chat-body::-webkit-scrollbar-thumb { background: #D1D1D1; border-radius: 10px; }

    /* Messages */
    .momo-msg { display: flex; gap: 8px; animation: momo-fadeIn 0.25s ease; }
    .momo-msg.momo-user { flex-direction: row-reverse; }
    .momo-msg-avatar { width: 32px; height: 32px; border-radius: 50%; overflow: hidden; flex-shrink: 0; align-self: flex-end; }
    .momo-msg-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .momo-msg-content { max-width: 82%; display: flex; flex-direction: column; gap: 4px; }
    .momo-msg.momo-user .momo-msg-content { align-items: flex-end; }
    .momo-bubble-text {
      padding: 10px 14px; border-radius: 14px; font-size: 0.875rem; line-height: 1.55;
      word-break: break-word; white-space: normal;
    }
    .momo-msg.momo-user .momo-bubble-text { background: #C42633; color: #fff; border-bottom-right-radius: 3px; }
    .momo-msg.momo-ai .momo-bubble-text  { background: #fff; color: #1D1D21; border-bottom-left-radius: 3px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .momo-bubble-text p { margin-bottom: 8px; }
    .momo-bubble-text p:last-child { margin-bottom: 0; }
    .momo-bubble-text ul, .momo-bubble-text ol { margin-left: 16px; margin-bottom: 8px; }
    .momo-bubble-text li { margin-bottom: 4px; }
    .momo-bubble-text code { background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 3px; font-family: monospace; }
    .momo-bubble-text strong { font-weight: 700; }
    .momo-sources { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .momo-badge {
      background: #FCE8E9; color: #C42633; border: 1px solid rgba(196,38,51,0.12);
      padding: 2px 8px; border-radius: 20px; font-size: 0.68rem; font-weight: 700;
    }
    .momo-msg-imgs { margin-top: 6px; }
    .momo-inline-img { max-width: 100%; border-radius: 6px; border: 1px solid #E8E8ED; margin-bottom: 6px; display: block; }

    /* Thinking dots */
    .momo-thinking { display: flex; gap: 4px; padding: 4px 0; }
    .momo-thinking span {
      width: 6px; height: 6px; background: #A0A0B0; border-radius: 50%;
      animation: momo-dots 1s infinite ease-in-out;
    }
    .momo-thinking span:nth-child(2) { animation-delay: 0.2s; }
    .momo-thinking span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes momo-dots {
      0%,60%,100% { transform: translateY(0); }
      30%          { transform: translateY(-4px); }
    }

    /* Input area */
    .momo-input-area {
      padding: 12px 16px; border-top: 1px solid #E8E8ED;
      background: #fff; flex-shrink: 0;
    }
    .momo-input-row {
      display: flex; align-items: center; gap: 8px;
      background: #F9F9FB; border: 1.5px solid #E8E8ED;
      border-radius: 30px; padding: 4px 4px 4px 14px;
      transition: border-color 0.2s;
    }
    .momo-input-row:focus-within { border-color: #C42633; }
    .momo-input-row input {
      flex: 1; border: none; background: transparent; outline: none;
      font-size: 0.88rem; color: #1D1D21; height: 38px;
      font-family: 'Outfit', sans-serif;
    }
    .momo-send-btn {
      width: 38px; height: 38px; border-radius: 50%; background: #C42633;
      border: none; cursor: pointer; display: flex; align-items: center;
      justify-content: center; transition: background 0.2s, transform 0.15s; flex-shrink: 0;
    }
    .momo-send-btn:hover { background: #A51D29; transform: scale(1.05); }
    .momo-send-btn:disabled { background: #D1D1D1; cursor: not-allowed; transform: none; }
    .momo-send-btn svg { width: 16px; height: 16px; stroke: #fff; fill: none; }
    .momo-input-footer {
      text-align: center; font-size: 0.65rem; color: #B0B0C0;
      margin-top: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
    }
    .momo-full-page-link {
      display: block; text-align: center; margin-bottom: 8px;
      font-size: 0.78rem; font-weight: 600; color: #C42633;
      text-decoration: none; padding: 7px; border-radius: 8px;
      border: 1px solid rgba(196,38,51,0.18); transition: background 0.2s;
    }
    .momo-full-page-link:hover { background: #FCE8E9; }

    /* Welcome card */
    .momo-welcome-card {
      background: #fff; border: 1px solid #E8E8ED; border-radius: 14px;
      padding: 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .momo-welcome-card h4 { color: #C42633; font-size: 0.95rem; margin-bottom: 6px; }
    .momo-welcome-card p { color: #5E5E6E; font-size: 0.8rem; margin-bottom: 12px; }
    .momo-suggestions { display: flex; flex-direction: column; gap: 6px; }
    .momo-suggestion {
      background: #F9F9FB; border: 1px solid #E8E8ED; border-radius: 8px;
      padding: 8px 12px; font-size: 0.78rem; font-weight: 600;
      color: #333; cursor: pointer; text-align: left; transition: all 0.15s;
    }
    .momo-suggestion:hover { border-color: #C42633; background: #FCE8E9; color: #C42633; }

    /* Tooltip overlay */
    #momo-tooltip {
      position: fixed; bottom: 104px; right: 104px; z-index: 99997;
      background: #fff; border-radius: 14px; padding: 14px 16px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.14); border: 1px solid #E8E8ED;
      max-width: 240px; animation: momo-fadeIn 0.3s ease;
      display: none;
    }
    #momo-tooltip.momo-show { display: block; }
    #momo-tooltip p { font-size: 0.82rem; color: #1D1D21; line-height: 1.4; margin-bottom: 8px; }
    #momo-tooltip .momo-tooltip-close {
      position: absolute; top: 8px; right: 10px; cursor: pointer;
      font-size: 1rem; color: #A0A0B0; line-height: 1;
    }
    #momo-tooltip .momo-tooltip-cta {
      background: #C42633; color: #fff; border: none; border-radius: 6px;
      padding: 6px 14px; font-size: 0.78rem; font-weight: 700; cursor: pointer;
      transition: background 0.2s; font-family: 'Outfit', sans-serif;
    }
    #momo-tooltip .momo-tooltip-cta:hover { background: #A51D29; }
    .momo-tooltip-arrow {
      position: absolute; bottom: -8px; right: 24px;
      width: 16px; height: 8px; overflow: hidden;
    }
    .momo-tooltip-arrow::after {
      content: ''; position: absolute; width: 12px; height: 12px;
      background: #fff; border: 1px solid #E8E8ED;
      transform: rotate(45deg); top: -6px; left: 2px;
    }

    /* Product page contextual badge */
    #momo-context-badge {
      position: fixed; bottom: 104px; right: 28px; z-index: 99997;
      background: #1D1D21; color: #fff; border-radius: 10px;
      padding: 10px 14px; font-size: 0.78rem; font-weight: 600;
      max-width: 220px; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,0.2);
      animation: momo-slideUp 0.4s ease; display: none; line-height: 1.4;
    }
    #momo-context-badge.momo-show { display: block; }
    #momo-context-badge span { color: #ff9999; }
    #momo-context-badge .momo-badge-close {
      float: right; margin-left: 8px; cursor: pointer; opacity: 0.7; font-size: 1rem; line-height: 1;
    }

    @keyframes momo-fadeIn  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes momo-slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

    /* Mobile */
    @media (max-width: 480px) {
      #momo-panel { width: calc(100vw - 24px); right: 12px; bottom: 92px; height: 70vh; }
      #momo-bubble { bottom: 16px; right: 16px; }
      #momo-tooltip { right: 12px; bottom: 92px; max-width: calc(100vw - 48px); }
      #momo-context-badge { right: 12px; max-width: calc(100vw - 80px); }
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
        <a href="${SUPPORT_PAGE}" class="momo-full-page-link">↗ Open full support page</a>
        <div class="momo-input-row">
          <input type="text" id="momo-input" placeholder="Ask me anything..." autocomplete="off">
          <button class="momo-send-btn" id="momo-send-btn" aria-label="Send">
            <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2" fill="#fff" stroke="none"/>
            </svg>
          </button>
        </div>
        <div class="momo-input-footer">Powered by Load Controls RAG · DeepSeek · Gemini Embedding 2</div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // ─── DOM refs ────────────────────────────────────────────────────────────────
  var bubble      = document.getElementById('momo-bubble');
  var panel       = document.getElementById('momo-panel');
  var closeBtn    = document.getElementById('momo-close-btn');
  var chatBody    = document.getElementById('momo-chat-body');
  var input       = document.getElementById('momo-input');
  var sendBtn     = document.getElementById('momo-send-btn');
  var statusDot   = document.getElementById('momo-status-dot');
  var statusLabel = document.getElementById('momo-status-label');
  var avatarImg   = document.getElementById('momo-avatar-img');
  var welcomeCard = document.getElementById('momo-welcome-card');
  var tooltip     = document.getElementById('momo-tooltip');
  var tooltipText = document.getElementById('momo-tooltip-text');
  var tooltipCta  = document.getElementById('momo-tooltip-cta');
  var tooltipClose= document.getElementById('momo-tooltip-close');
  var ctxBadge    = document.getElementById('momo-context-badge');
  var ctxClose    = document.getElementById('momo-context-close');

  var isOpen = false;
  var isTyping = false;

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

  bubble.addEventListener('click', function () { isOpen ? closePanel() : openPanel(); });
  closeBtn.addEventListener('click', closePanel);

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
  function appendMsg(role, html, sources, images) {
    if (welcomeCard) { welcomeCard.remove(); welcomeCard = null; }

    var div = document.createElement('div');
    div.className = 'momo-msg ' + (role === 'user' ? 'momo-user' : 'momo-ai');

    var avatarHtml = role === 'ai'
      ? '<div class="momo-msg-avatar"><img src="' + ASSET_BASE + '/momo.gif" alt="Miss MoMo"></div>'
      : '';

    var sourcesHtml = '';
    if (sources && sources.length) {
      sourcesHtml = '<div class="momo-sources">' +
        sources.map(function (s) { return '<span class="momo-badge">📄 ' + s + '</span>'; }).join('') +
        '</div>';
    }

    var imagesHtml = '';
    if (images && images.length) {
      imagesHtml = '<div class="momo-msg-imgs">' +
        images.map(function (src) { return '<img src="' + src + '" class="momo-inline-img" alt="Diagram" loading="lazy">'; }).join('') +
        '</div>';
    }

    var contentHtml =
      '<div class="momo-msg-content">' +
        '<div class="momo-bubble-text">' + html + '</div>' +
        sourcesHtml + imagesHtml +
      '</div>';

    div.innerHTML = role === 'ai' ? avatarHtml + contentHtml : contentHtml;
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
    return div;
  }

  function showThinking() {
    var div = document.createElement('div');
    div.className = 'momo-msg momo-ai';
    div.id = 'momo-thinking';
    div.innerHTML =
      '<div class="momo-msg-avatar"><img src="' + ASSET_BASE + '/Thinking_Momo.gif" alt="Thinking"></div>' +
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
        // Extract images requested by the AI
        var images = [];
        var showRegex = /\[SHOW_IMAGE:\s*(\d+)\]/g;
        var requestedIndices = [];
        var mShow;
        while ((mShow = showRegex.exec(data.answer)) !== null) {
          requestedIndices.push(parseInt(mShow[1], 10) - 1);
        }
        var cleanAnswer = data.answer.replace(/\[SHOW_IMAGE:\s*\d+\]/g, '').trim();

        if (data.rich_chunks && requestedIndices.length > 0) {
          var allImgs = [];
          var imgRe = /!\[[^\]]*\]\((data:image\/[^)]+)\)/g;
          var mImg;
          data.rich_chunks.forEach(function (chunk) {
            while ((mImg = imgRe.exec(chunk)) !== null) allImgs.push(mImg[1]);
          });
          requestedIndices.forEach(function (idx) {
            if (allImgs[idx] && !images.includes(allImgs[idx])) images.push(allImgs[idx]);
          });
        }

        var html = window.marked ? window.marked.parse(cleanAnswer) : cleanAnswer.replace(/\n/g, '<br>');
        appendMsg('ai', html, data.sources || [], images);
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
