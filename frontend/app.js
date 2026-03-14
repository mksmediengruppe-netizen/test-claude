/* ═══════════════════════════════════════════════════════════════
   Super Agent v6.0 — Main Application Logic
   Manus-inspired UI with full feature set
═══════════════════════════════════════════════════════════════ */

'use strict';

// ── State ──────────────────────────────────────────────────────
const STATE = {
  isLoggedIn: false,
  currentUser: null,
  currentChatId: null,
  chats: {},
  isGenerating: false,
  isPaused: false,
  currentAbortController: null,
  taskSteps: [],
  taskStepCount: 0,
  totalCost: 0,
  chatCost: 0,
  taskCost: 0,
  totalTokens: 0,
  selectedModel: 'meta-llama/llama-3.1-70b-instruct',
  enhancedMode: false,
  agentComputerVisible: false,
  sidebarCollapsed: false,
  settings: {
    streaming: true,
    autosave: true,
    updates: true,
    emailTask: false,
    browserNotif: false,
    sound: false,
    lang: 'ru',
    theme: 'dark',
    fontSize: 15,
    backendUrl: '',
    openrouterKey: '',
    profileName: '',
    agentContext: '',
  },
  analytics: [],
  canvases: [],
  scheduledTasks: [],
  auditLog: [],
  commandPaletteOpen: false,
};

// ── Config ─────────────────────────────────────────────────────
const CONFIG = {
  BACKEND_URL: window.location.origin.includes('localhost') || window.location.origin.includes('8080') ? 'https://minimax.mksitdev.ru' : window.location.origin,
  DEFAULT_MODEL: 'meta-llama/llama-3.1-70b-instruct',
  USERS: {
    admin: { password: 'admin', role: 'Admin', name: 'Admin' },
    user: { password: 'user123', role: 'User', name: 'User' },
  },
  MODELS: {
    'meta-llama/llama-3.1-70b-instruct': { name: 'Llama 3.1 70B', inputCost: 0.00000035, outputCost: 0.0000004 },
    'anthropic/claude-3.5-sonnet': { name: 'Claude 3.5 Sonnet', inputCost: 0.000003, outputCost: 0.000015 },
    'openai/gpt-4o': { name: 'GPT-4o', inputCost: 0.0000025, outputCost: 0.00001 },
    'google/gemini-flash-1.5': { name: 'Gemini Flash 1.5', inputCost: 0.000000075, outputCost: 0.0000003 },
    'deepseek/deepseek-r1': { name: 'DeepSeek R1', inputCost: 0.00000055, outputCost: 0.00000219 },
  },
};

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  applyTheme(STATE.settings.theme);
  applyFontSize(STATE.settings.fontSize);
  checkAutoLogin();
  setupDragDrop();
  setupKeyboardShortcuts();
  setupScrollDetection();
  // Welcome suggestion hover
  document.querySelectorAll('.welcome-suggestion').forEach(btn => {
    btn.addEventListener('mouseenter', () => btn.style.borderColor = 'var(--accent-primary)');
    btn.addEventListener('mouseleave', () => btn.style.borderColor = 'var(--border-color)');
  });
});

// ── Settings Persistence ───────────────────────────────────────
function loadSettings() {
  try {
    const saved = localStorage.getItem('sa_settings');
    if (saved) Object.assign(STATE.settings, JSON.parse(saved));
    const savedChats = localStorage.getItem('sa_chats');
    if (savedChats) STATE.chats = JSON.parse(savedChats);
    const savedAnalytics = localStorage.getItem('sa_analytics');
    if (savedAnalytics) STATE.analytics = JSON.parse(savedAnalytics);
    const savedCanvases = localStorage.getItem('sa_canvases');
    if (savedCanvases) STATE.canvases = JSON.parse(savedCanvases);
    const savedScheduled = localStorage.getItem('sa_scheduled');
    if (savedScheduled) STATE.scheduledTasks = JSON.parse(savedScheduled);
    const savedAudit = localStorage.getItem('sa_audit');
    if (savedAudit) STATE.auditLog = JSON.parse(savedAudit);
  } catch(e) {}
}

function saveSettings() {
  localStorage.setItem('sa_settings', JSON.stringify(STATE.settings));
}

function saveChats() {
  if (STATE.settings.autosave) {
    localStorage.setItem('sa_chats', JSON.stringify(STATE.chats));
  }
}

function saveAnalytics() {
  localStorage.setItem('sa_analytics', JSON.stringify(STATE.analytics));
}

// ── Auth ───────────────────────────────────────────────────────
async function checkAutoLogin() {
  const savedToken = localStorage.getItem('sa_token');
  if (savedToken) {
    try {
      // Validate token with backend
      const resp = await fetch(`${CONFIG.BACKEND_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${savedToken}` }
      });
      if (resp.ok) {
        const userData = await resp.json();
        STATE.currentUser = { ...userData, token: savedToken };
        STATE.isLoggedIn = true;
        localStorage.setItem('sa_user', JSON.stringify(STATE.currentUser));
        showApp();
        return;
      } else {
        // Token expired
        localStorage.removeItem('sa_user');
        localStorage.removeItem('sa_token');
      }
    } catch(e) {
      // Network error — try cached user
      const savedUser = localStorage.getItem('sa_user');
      if (savedUser) {
        try {
          STATE.currentUser = JSON.parse(savedUser);
          STATE.currentUser.token = savedToken;
          STATE.isLoggedIn = true;
          showApp();
          return;
        } catch(e2) {}
      }
    }
  }
  showLogin();
}

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appRoot').classList.add('hidden');
  setTimeout(() => document.getElementById('loginUser')?.focus(), 100);
  const passEl = document.getElementById('loginPass');
  const userEl = document.getElementById('loginUser');
  if (passEl) passEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  if (userEl) userEl.addEventListener('keydown', e => { if (e.key === 'Enter') passEl?.focus(); });
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appRoot').classList.remove('hidden');
  initApp();
}

async function doLogin() {
  const emailEl = document.getElementById('loginUser');
  const passEl = document.getElementById('loginPass');
  const errorEl = document.getElementById('loginErr');
  const btnEl = document.querySelector('.login-btn');

  const email = emailEl?.value?.trim() || '';
  const password = passEl?.value || '';

  if (!email || !password) {
    if (errorEl) { errorEl.textContent = 'Введите email и пароль'; errorEl.classList.remove('hidden'); }
    return;
  }

  // Show loading state
  if (btnEl) { btnEl.textContent = 'Вход...'; btnEl.disabled = true; }
  if (errorEl) errorEl.classList.add('hidden');

  try {
    const backendUrl = CONFIG.BACKEND_URL;
    const resp = await fetch(`${backendUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();

    if (resp.ok && data.token) {
      STATE.currentUser = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
        settings: data.user.settings || {},
        token: data.token,
      };
      STATE.isLoggedIn = true;
      localStorage.setItem('sa_user', JSON.stringify(STATE.currentUser));
      localStorage.setItem('sa_token', data.token);
      addAuditEntry('auth', `Вход пользователя ${data.user.email}`);
      showApp();
    } else {
      const msg = data.error || 'Неверный email или пароль';
      if (errorEl) { errorEl.textContent = msg; errorEl.classList.remove('hidden'); }
      if (passEl) { passEl.value = ''; passEl.focus(); }
    }
  } catch(e) {
    if (errorEl) { errorEl.textContent = 'Ошибка соединения с сервером'; errorEl.classList.remove('hidden'); }
  } finally {
    if (btnEl) { btnEl.textContent = 'Войти'; btnEl.disabled = false; }
  }
}

function toggleEye() {
  const input = document.getElementById('loginPass') || document.getElementById('loginPass');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function togglePassword() {
  const input = document.getElementById('loginPass');
  const icon = document.getElementById('eyeIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    input.type = 'password';
    icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
}

// ── App Init ───────────────────────────────────────────────────
async function initApp() {
  // Update user info
  const name = STATE.currentUser?.name || 'Admin';
  const userNameEl = document.getElementById('sbUserName');
  const userAvatarEl = document.getElementById('sbAvatar');
  const userRoleEl = document.getElementById('sbUserRole');
  if (userNameEl) userNameEl.textContent = name;
  if (userAvatarEl) userAvatarEl.textContent = name[0].toUpperCase();
  if (userRoleEl) userRoleEl.textContent = STATE.currentUser?.role || 'User';

  // Load settings into UI
  applySettingsToUI();

  // Load backend URL
  const savedUrl = STATE.settings.backendUrl || CONFIG.BACKEND_URL;
  CONFIG.BACKEND_URL = savedUrl;

  // Switch to chat tab first
  switchTab('chat');

  // Load chats from backend
  const token = STATE.currentUser?.token || localStorage.getItem('sa_token');
  if (token) {
    try {
      const resp = await fetch(`${CONFIG.BACKEND_URL}/api/chats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        const backendChats = data.chats || [];
        // Merge backend chats into STATE.chats
        backendChats.forEach(bc => {
          const localId = 'bc_' + bc.id;
          if (!STATE.chats[localId]) {
            STATE.chats[localId] = {
              id: localId,
              backendId: bc.id,
              title: bc.title || 'Новый чат',
              messages: (bc.messages || []).map(m => ({
                role: m.role,
                content: m.content,
                cost: m.cost || 0,
                tokens: m.tokens || 0,
              })),
              createdAt: bc.created_at || new Date().toISOString(),
              totalCost: bc.total_cost || 0,
              totalTokens: bc.total_tokens || 0,
              model: STATE.selectedModel,
            };
          }
        });
        saveChats();
      }
    } catch(e) {}
  }

  // Render chat list
  renderChatList();

  // If no chats, create one
  if (Object.keys(STATE.chats).length === 0) {
    newChat();
  } else {
    // Load last chat
    const lastChatId = localStorage.getItem('sa_last_chat');
    if (lastChatId && STATE.chats[lastChatId]) {
      loadChat(lastChatId);
    } else {
      const firstId = Object.keys(STATE.chats)[0];
      loadChat(firstId);
    }
  }

  // Init analytics charts
  initAnalyticsCharts();

  // Populate other tabs
  renderAgents();
  renderTemplates();
  renderConnectors();
  renderScheduledTasks();
  renderAuditLog();
  renderAdminPanel();
  renderCanvases();

  showToast('Добро пожаловать, ' + name + '!', 'success');
}

function applySettingsToUI() {
  const s = STATE.settings;
  setToggle('streamingToggle', s.streaming);
  setToggle('autosaveToggle', s.autosave);
  setToggle('updatesToggle', s.updates);
  setToggle('emailTaskToggle', s.emailTask);
  setToggle('browserNotifToggle', s.browserNotif);
  setToggle('soundToggle', s.sound);
  if (document.getElementById('backendUrl')) document.getElementById('backendUrl').value = s.backendUrl;
  if (document.getElementById('profileName')) document.getElementById('profileName').value = s.profileName;
  if (document.getElementById('agentContext')) document.getElementById('agentContext').value = s.agentContext;
}

function setToggle(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (value) el.classList.add('active');
  else el.classList.remove('active');
}

// ── Sidebar ────────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  // Support both data-collapsed and data-open attributes
  const isOpen = sidebar.getAttribute('data-open');
  const isCollapsed = sidebar.getAttribute('data-collapsed');
  if (isOpen !== null) {
    const open = isOpen === 'true';
    sidebar.setAttribute('data-open', !open);
  } else {
    const collapsed = isCollapsed === 'true';
    sidebar.setAttribute('data-collapsed', !collapsed);
  }
  STATE.sidebarCollapsed = !STATE.sidebarCollapsed;
}

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sbOverlay');
  sidebar.classList.add('mobile-open');
  if (overlay) overlay.classList.remove('hidden');
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sbOverlay');
  sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.add('hidden');
}

// ── Tab Navigation ─────────────────────────────────────────────
function switchTab(tabName, btn) {
  // Hide all tab panes
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
  // Remove active from all nav items
  document.querySelectorAll('.nav-item, .sb-nav-item').forEach(el => el.classList.remove('active'));

  // Show selected tab
  const tabEl = document.getElementById('tab-' + tabName);
  if (tabEl) tabEl.classList.remove('hidden');

  // Activate nav button
  if (btn) btn.classList.add('active');
  const navEl = document.getElementById('nav-' + tabName);
  if (navEl) navEl.classList.add('active');

  // Mobile: close sidebar
  if (window.innerWidth <= 768) closeMobileSidebar();

  // Tab-specific init
  if (tabName === 'analytics') renderAnalytics();
  if (tabName === 'admin') renderAdminPanel();
}

// ── Chat Management ────────────────────────────────────────────
function newChat() {
  const id = 'chat_' + Date.now();
  STATE.chats[id] = {
    id,
    title: 'Новый чат',
    messages: [],
    createdAt: new Date().toISOString(),
    totalCost: 0,
    totalTokens: 0,
    model: STATE.selectedModel,
  };
  STATE.currentChatId = id;
  saveChats();
  renderChatList();
  loadChat(id);
  switchTab('chat');
  document.getElementById('chatInput').focus();
}

function loadChat(chatId) {
  const chat = STATE.chats[chatId];
  if (!chat) return;

  STATE.currentChatId = chatId;
  STATE.chatCost = chat.totalCost || 0;
  STATE.taskCost = 0;
  STATE.totalTokens = chat.totalTokens || 0;

  localStorage.setItem('sa_last_chat', chatId);

  // Update header
  document.getElementById('chatTitle').textContent = chat.title;
  document.getElementById('chatCostDisplay').textContent = '$' + STATE.chatCost.toFixed(4);
  document.getElementById('totalTokensVal').textContent = STATE.totalTokens.toLocaleString();

  // Render messages
  const messagesEl = document.getElementById('messages');
  const welcomeState = document.getElementById('welcomeScreen');

  if (chat.messages.length === 0) {
    welcomeState.style.display = 'flex';
    messagesEl.querySelectorAll('.message').forEach(m => m.remove());
  } else {
    welcomeState.style.display = 'none';
    messagesEl.querySelectorAll('.message').forEach(m => m.remove());
    chat.messages.forEach(msg => renderMessage(msg.role, msg.content, msg.cost, msg.tokens, false));
    setTimeout(scrollToBottom, 100);
  }

  // Update chat list active state
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  const activeItem = document.querySelector(`[data-chat-id="${chatId}"]`);
  if (activeItem) activeItem.classList.add('active');
}

function deleteChat(chatId, event) {
  event.stopPropagation();
  delete STATE.chats[chatId];
  saveChats();
  renderChatList();
  if (STATE.currentChatId === chatId) {
    const ids = Object.keys(STATE.chats);
    if (ids.length > 0) loadChat(ids[0]);
    else newChat();
  }
  addAuditEntry('chat', `Удалён чат ${chatId}`);
}

function renderChatList() {
  const list = document.getElementById('chatList');
  const chats = Object.values(STATE.chats).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (chats.length === 0) {
    list.innerHTML = '<div style="padding:8px 10px;font-size:12px;color:var(--text-tertiary);">Нет чатов</div>';
    return;
  }

  list.innerHTML = chats.map(chat => `
    <div class="chat-item ${chat.id === STATE.currentChatId ? 'active' : ''}" 
         data-chat-id="${chat.id}" onclick="loadChat('${chat.id}')">
      <span class="chat-item-icon">💬</span>
      <div class="chat-item-info">
        <div class="chat-item-title">${escapeHtml(chat.title)}</div>
        <div class="chat-item-meta">
          <span>${formatDate(chat.createdAt)}</span>
          ${chat.totalCost > 0 ? `<span class="chat-item-cost">$${chat.totalCost.toFixed(4)}</span>` : ''}
        </div>
      </div>
      <button class="chat-item-delete" onclick="deleteChat('${chat.id}', event)" title="Удалить">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');
}

function filterChats(query) {
  const items = document.querySelectorAll('.chat-item');
  items.forEach(item => {
    const title = item.querySelector('.chat-item-title')?.textContent.toLowerCase() || '';
    item.style.display = title.includes(query.toLowerCase()) ? '' : 'none';
  });
}

// ── Message Rendering ──────────────────────────────────────────
function renderMessage(role, content, cost = 0, tokens = 0, animate = true) {
  const messagesEl = document.getElementById('messages');
  const welcomeState = document.getElementById('welcomeScreen');
  welcomeState.style.display = 'none';

  const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const isUser = role === 'user';
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const msgEl = document.createElement('div');
  msgEl.className = `message ${isUser ? 'user' : 'assistant'}`;
  msgEl.id = msgId;
  if (!animate) msgEl.style.animation = 'none';

  const avatarContent = isUser
    ? (STATE.currentUser?.name?.[0]?.toUpperCase() || 'U')
    : '<svg width="14" height="14" viewBox="0 0 40 40" fill="none"><path d="M12 20L18 14L24 20L30 14" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const formattedContent = isUser ? escapeHtml(content).replace(/\n/g, '<br>') : renderMarkdown(content);

  msgEl.innerHTML = `
    <div class="message-avatar" style="${isUser ? '' : 'background:linear-gradient(135deg,#818cf8,#a855f7);'}">${avatarContent}</div>
    <div class="message-body">
      <div class="message-content" id="content_${msgId}">${formattedContent}</div>
      <div class="message-meta">
        <span>${time}</span>
        ${cost > 0 ? `<span style="color:var(--accent-green);">$${cost.toFixed(6)}</span>` : ''}
        ${tokens > 0 ? `<span>${tokens} токенов</span>` : ''}
      </div>
      ${!isUser ? `
      <div class="message-actions">
        <button class="msg-action-btn" onclick="copyMessage('${msgId}')" title="Копировать">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="msg-action-btn" onclick="regenerateMessage()" title="Повторить">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
        </button>
        <button class="msg-action-btn" onclick="likeMessage('${msgId}')" title="Нравится">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
        </button>
      </div>` : ''}
    </div>
  `;

  messagesEl.appendChild(msgEl);
  scrollToBottom();
  return msgId;
}

function renderMarkdown(text) {
  if (typeof marked === 'undefined') return escapeHtml(text).replace(/\n/g, '<br>');
  try {
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: function(code, lang) {
        return `<div class="code-block-header"><span class="code-lang">${lang || 'code'}</span><div class="code-actions"><button class="code-action-btn" onclick="copyCode(this)">Копировать</button></div></div><code>${escapeHtml(code)}</code>`;
      }
    });
    let html = marked.parse(text);
    // Wrap pre blocks
    html = html.replace(/<pre><code/g, '<pre><code');
    return html;
  } catch(e) {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }
}

// ── Streaming Message ──────────────────────────────────────────
function createStreamingMessage() {
  const messagesEl = document.getElementById('messages');
  const welcomeState = document.getElementById('welcomeScreen');
  welcomeState.style.display = 'none';

  const msgId = 'stream_' + Date.now();
  const msgEl = document.createElement('div');
  msgEl.className = 'message assistant';
  msgEl.id = msgId;

  msgEl.innerHTML = `
    <div class="message-avatar" style="background:linear-gradient(135deg,#818cf8,#a855f7);">
      <svg width="14" height="14" viewBox="0 0 40 40" fill="none"><path d="M12 20L18 14L24 20L30 14" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="message-body">
      <div class="message-content streaming-cursor" id="content_${msgId}"></div>
      <div class="message-meta" id="meta_${msgId}"></div>
    </div>
  `;

  messagesEl.appendChild(msgEl);
  scrollToBottom();
  return msgId;
}

function updateStreamingMessage(msgId, text) {
  const contentEl = document.getElementById('content_' + msgId);
  if (contentEl) {
    contentEl.innerHTML = renderMarkdown(text);
    scrollToBottom();
  }
}

function finalizeStreamingMessage(msgId, fullText, cost, tokens) {
  const contentEl = document.getElementById('content_' + msgId);
  if (contentEl) {
    contentEl.classList.remove('streaming-cursor');
    contentEl.innerHTML = renderMarkdown(fullText);
  }
  const metaEl = document.getElementById('meta_' + msgId);
  if (metaEl) {
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    metaEl.innerHTML = `
      <span>${time}</span>
      ${cost > 0 ? `<span style="color:var(--accent-green);">$${cost.toFixed(6)}</span>` : ''}
      ${tokens > 0 ? `<span>${tokens} токенов</span>` : ''}
    `;
  }
  // Add action buttons
  const msgEl = document.getElementById(msgId);
  if (msgEl) {
    const bodyEl = msgEl.querySelector('.message-body');
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    actionsDiv.innerHTML = `
      <button class="msg-action-btn" onclick="copyMessage('${msgId}')" title="Копировать">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button class="msg-action-btn" onclick="regenerateMessage()" title="Повторить">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
      </button>
    `;
    bodyEl.appendChild(actionsDiv);
  }
}

// ── Send Message ───────────────────────────────────────────────
async function sendMessage() {
  if (STATE.isGenerating) return;

  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  const chat = STATE.chats[STATE.currentChatId];
  if (!chat) { newChat(); return; }

  // Clear input
  input.value = '';
  autoResizeInput(input);

  // Add user message
  chat.messages.push({ role: 'user', content: text });
  renderMessage('user', text);
  saveChats();

  // Update chat title if first message
  if (chat.messages.length === 1) {
    chat.title = text.length > 40 ? text.substring(0, 40) + '...' : text;
    document.getElementById('chatTitle').textContent = chat.title;
    renderChatList();
  }

  // Start generation
  STATE.isGenerating = true;
  STATE.taskCost = 0;
  STATE.taskStepCount = 0;
  STATE.taskSteps = [];

  showGenerationUI(true);
  addAuditEntry('chat', `Запрос: ${text.substring(0, 60)}...`);

  try {
    await callAPI(text, chat);
  } catch(e) {
    if (e.name !== 'AbortError') {
      showToast('Ошибка: ' + (e.message || 'Неизвестная ошибка'), 'error');
      const errMsgId = createStreamingMessage();
      finalizeStreamingMessage(errMsgId, `❌ Ошибка: ${e.message || 'Не удалось получить ответ'}`, 0, 0);
    }
  } finally {
    STATE.isGenerating = false;
    STATE.isPaused = false;
    showGenerationUI(false);
    saveChats();
    renderChatList();
    renderAnalytics();
  }
}

async function callAPI(userMessage, chat) {
  const backendUrl = STATE.settings.backendUrl || CONFIG.BACKEND_URL;
  const token = STATE.currentUser?.token || localStorage.getItem('sa_token') || '';

  // Create streaming message placeholder
  const streamMsgId = createStreamingMessage();
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  // Add task step
  addTaskStep('🤔', 'Анализирую запрос...');

  // Ensure chat exists on backend
  let backendChatId = chat.backendId;
  if (!backendChatId && token) {
    try {
      const createResp = await fetch(`${backendUrl}/api/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title: chat.title }),
      });
      if (createResp.ok) {
        const createData = await createResp.json();
        // API returns {chat: {...}} nested structure
        backendChatId = createData.chat?.id || createData.id;
        chat.backendId = backendChatId;
        saveChats();
      }
    } catch(e) {}
  }

  try {
    STATE.currentAbortController = new AbortController();
    addTaskStep('⚡', 'Генерирую ответ...');

    let response;
    if (backendChatId && token) {
      // Use production API: /api/chats/<chat_id>/send
      response = await fetch(`${backendUrl}/api/chats/${backendChatId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          message: userMessage,
          file_content: chat.pendingFile || '',
        }),
        signal: STATE.currentAbortController.signal,
      });
      chat.pendingFile = '';
    } else {
      // Fallback to /api/chat endpoint
      response = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? {'Authorization': `Bearer ${token}`} : {}) },
        body: JSON.stringify({
          message: userMessage,
          history: chat.messages.slice(-20, -1).map(m => ({ role: m.role, content: m.content })),
          model: STATE.selectedModel,
          enhanced: STATE.enhancedMode,
          stream: STATE.settings.streaming,
        }),
        signal: STATE.currentAbortController.signal,
      });
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      // SSE streaming — production API format
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const type = parsed.type;

            if (type === 'meta') {
              // Show model name and mode
              const mode = parsed.intent_mode || '';
              const modelName = parsed.model || '';
              if (mode) addTaskStep('🔍', `Режим: ${mode} • ${modelName}`);
              // Update model display
              const modelBtn = document.getElementById('modelSelBtn');
              if (modelBtn && modelName) modelBtn.textContent = modelName;
            } else if (type === 'agent_mode') {
              addTaskStep('🤖', parsed.text || 'Агент работает...');
            } else if (type === 'content') {
              fullText += parsed.text || '';
              updateStreamingMessage(streamMsgId, fullText);
            } else if (type === 'tool_call') {
              addTaskStep('🔧', `Инструмент: ${parsed.tool || ''}`);
            } else if (type === 'tool_result') {
              addTaskStep('✅', `Результат: ${(parsed.output || '').substring(0, 60)}`);
            } else if (type === 'file') {
              addTaskStep('📄', `Файл: ${parsed.filename || ''}`);
              if (parsed.url) {
                fullText += `\n\n[📎 ${parsed.filename}](${backendUrl}${parsed.url})`;
                updateStreamingMessage(streamMsgId, fullText);
              }
            } else if (type === 'error') {
              addTaskStep('❌', parsed.message || 'Ошибка');
            } else if (type === 'done') {
              inputTokens = parsed.tokens_in || 0;
              outputTokens = parsed.tokens_out || 0;
            } else if (type === 'step') {
              addTaskStep('📍', parsed.text || '');
            }
          } catch(e) {}
        }
      }
    } else {
      // Non-streaming JSON response
      const data = await response.json();
      fullText = data.response || data.content || data.message || JSON.stringify(data);
      inputTokens = data.usage?.prompt_tokens || estimateTokens(userMessage);
      outputTokens = data.usage?.completion_tokens || estimateTokens(fullText);
      await simulateStreaming(streamMsgId, fullText);
    }

  } catch(fetchError) {
    if (fetchError.name === 'AbortError') throw fetchError;

    // Fallback: direct OpenRouter API call
    addTaskStep('🔄', 'Переключаюсь на прямой API...');

    const apiKey = STATE.settings.openrouterKey;
    if (!apiKey) {
      fullText = generateFallbackResponse(userMessage);
      await simulateStreaming(streamMsgId, fullText);
      inputTokens = estimateTokens(userMessage);
      outputTokens = estimateTokens(fullText);
    } else {
      const result = await callOpenRouterDirect(userMessage, chat.messages, streamMsgId);
      fullText = result.text;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
    }
  }

  // Calculate cost
  const modelConfig = CONFIG.MODELS[STATE.selectedModel] || CONFIG.MODELS[CONFIG.DEFAULT_MODEL];
  const cost = (inputTokens * modelConfig.inputCost) + (outputTokens * modelConfig.outputCost);
  const totalTokens = inputTokens + outputTokens;

  // Update state
  STATE.taskCost = cost;
  STATE.chatCost += cost;
  STATE.totalTokens += totalTokens;
  chat.totalCost = (chat.totalCost || 0) + cost;
  chat.totalTokens = (chat.totalTokens || 0) + totalTokens;

  // Update UI
  const taskCostEl = document.getElementById('chatCostDisplay');
  if (taskCostEl) taskCostEl.textContent = '$' + STATE.chatCost.toFixed(4);
  const tokensEl = document.getElementById('totalTokensVal');
  if (tokensEl) tokensEl.textContent = STATE.totalTokens.toLocaleString();

  // Finalize message
  finalizeStreamingMessage(streamMsgId, fullText, cost, totalTokens);

  // Save to chat history
  chat.messages.push({ role: 'assistant', content: fullText, cost, tokens: totalTokens });

  // Save analytics
  STATE.analytics.push({
    date: new Date().toISOString(),
    query: userMessage.substring(0, 80),
    model: STATE.selectedModel,
    inputTokens,
    outputTokens,
    cost,
    chatId: STATE.currentChatId,
  });
  saveAnalytics();

  addTaskStep('✅', 'Ответ готов');

  // Notification
  if (STATE.settings.browserNotif && document.hidden) {
    new Notification('Super Agent', { body: 'Задача выполнена' });
  }
}

async function callOpenRouterDirect(userMessage, history, streamMsgId) {
  const messages = history.slice(-10).map(m => ({ role: m.role, content: m.content }));

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${STATE.settings.openrouterKey}`,
      'HTTP-Referer': window.location.origin,
    },
    body: JSON.stringify({
      model: STATE.selectedModel,
      messages,
      stream: true,
    }),
    signal: STATE.currentAbortController.signal,
  });

  if (!response.ok) throw new Error(`OpenRouter API error: ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            updateStreamingMessage(streamMsgId, fullText);
          }
          if (parsed.usage) {
            inputTokens = parsed.usage.prompt_tokens || 0;
            outputTokens = parsed.usage.completion_tokens || 0;
          }
        } catch(e) {}
      }
    }
  }

  if (!inputTokens) inputTokens = estimateTokens(userMessage);
  if (!outputTokens) outputTokens = estimateTokens(fullText);

  return { text: fullText, inputTokens, outputTokens };
}

async function simulateStreaming(msgId, text) {
  const words = text.split(' ');
  let current = '';
  const chunkSize = Math.max(1, Math.floor(words.length / 40));

  for (let i = 0; i < words.length; i += chunkSize) {
    if (STATE.currentAbortController?.signal.aborted) break;
    current = words.slice(0, i + chunkSize).join(' ');
    updateStreamingMessage(msgId, current);
    await sleep(30 + Math.random() * 20);
  }
  updateStreamingMessage(msgId, text);
}

function generateFallbackResponse(query) {
  const responses = {
    'деплой': `## Деплой приложения\n\nДля деплоя вашего приложения выполните следующие шаги:\n\n1. **Подготовка сервера**\n\`\`\`bash\nsudo apt update && sudo apt upgrade -y\nnpm install -g pm2\n\`\`\`\n\n2. **Клонирование репозитория**\n\`\`\`bash\ngit clone https://github.com/your/repo.git\ncd repo && npm install\n\`\`\`\n\n3. **Запуск с PM2**\n\`\`\`bash\npm2 start app.js --name "my-app"\npm2 save && pm2 startup\n\`\`\``,
    'код': `## Пример кода\n\nВот пример реализации:\n\n\`\`\`python\ndef process_data(data: list) -> dict:\n    """Обработка данных"""\n    result = {}\n    for item in data:\n        key = item.get('id')\n        if key:\n            result[key] = item\n    return result\n\`\`\`\n\nЭта функция принимает список объектов и возвращает словарь с группировкой по ID.`,
    'default': `Я получил ваш запрос: **"${query}"**\n\nДля полноценной работы необходимо:\n1. Настроить подключение к бэкенду в **Настройках → API ключи**\n2. Или добавить OpenRouter API ключ для прямых запросов\n\nПока что я работаю в демо-режиме. Все функции интерфейса активны и готовы к использованию после настройки API.`,
  };

  const lowerQuery = query.toLowerCase();
  for (const [key, response] of Object.entries(responses)) {
    if (key !== 'default' && lowerQuery.includes(key)) return response;
  }
  return responses.default;
}

// ── Task Stream ────────────────────────────────────────────────
function addTaskStep(icon, text) {
  STATE.taskStepCount++;
  STATE.taskSteps.push({ icon, text, time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });

  const taskStream = document.getElementById('taskProgress');
  const taskStreamBody = document.getElementById('taskSteps');
  const taskStreamCount = document.getElementById('taskProgressCount');

  taskStream.classList.remove('hidden');
  taskStreamCount.textContent = STATE.taskStepCount + ' шагов';

  const stepEl = document.createElement('div');
  stepEl.className = 'task-stream-step';
  stepEl.innerHTML = `
    <span class="step-icon">${icon}</span>
    <span class="step-text">${text}</span>
    <span class="step-time">${STATE.taskSteps[STATE.taskSteps.length - 1].time}</span>
  `;
  taskStreamBody.appendChild(stepEl);
  taskStreamBody.scrollTop = taskStreamBody.scrollHeight;

  // Update terminal
  addTerminalLine(text);
}

function toggleTaskStream() {
  const taskStream = document.getElementById('taskProgress');
  taskStream.classList.toggle('collapsed');
}

function showGenerationUI(show) {
  const progress = document.getElementById('taskProgress');
  const statusBadge = document.getElementById('taskBadge');
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopBtn');

  if (show) {
    if (progress) progress.classList.remove('hidden');
    if (statusBadge) statusBadge.classList.remove('hidden');
    if (sendBtn) { sendBtn.style.display = 'none'; }
    if (stopBtn) { stopBtn.style.display = 'flex'; }
    animateProgress();
  } else {
    if (progress) progress.classList.add('hidden');
    if (statusBadge) statusBadge.classList.add('hidden');
    if (sendBtn) { sendBtn.style.display = 'flex'; }
    if (stopBtn) { stopBtn.style.display = 'none'; }
    const steps = document.getElementById('taskSteps');
    if (steps) steps.innerHTML = '';
  }
}

function animateProgress() {
  const fill = document.getElementById('taskProgressFill');
  const statusText = document.getElementById('taskProgressTitle');
  const statuses = ['Агент думает...', 'Анализирую запрос...', 'Генерирую ответ...', 'Финализирую...'];
  let progress = 0;
  let statusIdx = 0;

  const interval = setInterval(() => {
    if (!STATE.isGenerating) {
      fill.style.width = '100%';
      clearInterval(interval);
      return;
    }
    progress = Math.min(progress + Math.random() * 8, 90);
    fill.style.width = progress + '%';
    if (progress > statusIdx * 25 && statusIdx < statuses.length) {
      statusText.textContent = statuses[statusIdx];
      statusIdx++;
    }
  }, 200);
}

// ── Task Controls ──────────────────────────────────────────────
function pauseTask() {
  STATE.isPaused = !STATE.isPaused;
  const btn = document.getElementById('pauseBtn');
  if (STATE.isPaused) {
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Продолжить';
    btn.style.color = 'var(--accent-yellow)';
    showToast('Задача приостановлена', 'warning');
  } else {
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Пауза';
    btn.style.color = '';
    showToast('Задача возобновлена', 'info');
  }
}

function cancelTask() {
  if (STATE.currentAbortController) {
    STATE.currentAbortController.abort();
  }
  STATE.isGenerating = false;
  STATE.isPaused = false;
  showGenerationUI(false);
  showToast('Задача отменена', 'warning');
  addAuditEntry('chat', 'Задача отменена пользователем');
}

// ── Model Selection ────────────────────────────────────────────
function toggleModelDropdown() {
  const menu = document.getElementById('modelMenu');
  const btn = document.getElementById('modelSelBtn');
  const isOpen = !menu.classList.contains('hidden');
  menu.classList.toggle('hidden');
  btn.setAttribute('aria-expanded', !isOpen);

  if (!isOpen) {
    document.addEventListener('click', closeModelDropdownOutside, { once: true });
  }
}

function closeModelDropdownOutside(e) {
  const wrap = document.querySelector('.model-dropdown-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('modelMenu').classList.add('hidden');
    document.getElementById('modelSelBtn').setAttribute('aria-expanded', 'false');
  }
}

function selectModel(modelId, modelName, dotColor) {
  STATE.selectedModel = modelId;
  document.getElementById('modelSelLabel').textContent = modelName;
  document.getElementById('modelDot').className = `model-dropdown-dot ${dotColor}`;
  document.getElementById('modelMenu').classList.add('hidden');
  document.getElementById('modelSelBtn').setAttribute('aria-expanded', 'false');

  // Update active state
  document.querySelectorAll('.model-dropdown-item').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList.add('active');

  showToast(`Модель: ${modelName}`, 'info');
}

function toggleEnhanced() {
  STATE.enhancedMode = !STATE.enhancedMode;
  const toggle = document.getElementById('enhancedToggle');
  if (STATE.enhancedMode) {
    toggle.classList.add('active');
    showToast('Расширенный режим включён', 'success');
  } else {
    toggle.classList.remove('active');
    showToast('Расширенный режим выключен', 'info');
  }
}

// ── Agent Computer ─────────────────────────────────────────────
function toggleAgentComputer() {
  const panel = document.getElementById('agentComputer');
  STATE.agentComputerVisible = !STATE.agentComputerVisible;
  panel.classList.toggle('hidden', !STATE.agentComputerVisible);
}

function switchAgentTab(tab, btn) {
  document.querySelectorAll('.agent-comp-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('terminalOutput').classList.add('hidden');
  document.getElementById('ac-browser').classList.add('hidden');
  document.getElementById('ac-files').classList.add('hidden');
  document.getElementById('agent' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.remove('hidden');
}

function addTerminalLine(text, type = 'output') {
  const terminal = document.getElementById('terminalOutput');
  const line = document.createElement('div');
  line.className = 'terminal-line';
  line.innerHTML = `<span class="term-${type}">${escapeHtml(text)}</span>`;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

function jumpToLive() {
  const terminal = document.getElementById('terminalOutput');
  terminal.scrollTop = terminal.scrollHeight;
  showToast('Перешёл к актуальному состоянию', 'info');
}

// ── Input Handling ─────────────────────────────────────────────
function handleInputKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function autoResizeInput(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

function useSuggestion(text) {
  const input = document.getElementById('chatInput');
  input.value = text;
  autoResizeInput(input);
  input.focus();
}

// ── File Upload ────────────────────────────────────────────────
function triggerFileUpload() {
  document.getElementById('fileInput').click();
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  files.forEach(file => attachFile(file));
  event.target.value = '';
}

function attachFile(file) {
  const attachedFiles = document.getElementById('attachedFile');
  attachedFiles.classList.remove('hidden');

  const chip = document.createElement('div');
  chip.className = 'attached-file-chip';
  chip.innerHTML = `
    <span>${getFileIcon(file.name)} ${file.name}</span>
    <span style="color:var(--text-tertiary);font-size:11px;">${formatFileSize(file.size)}</span>
    <button onclick="this.parentElement.remove(); checkAttachedFiles()">×</button>
  `;
  attachedFiles.appendChild(chip);
}

function checkAttachedFiles() {
  const attachedFiles = document.getElementById('attachedFile');
  if (attachedFiles.children.length === 0) {
    attachedFiles.classList.add('hidden');
  }
}

function setupDragDrop() {
  const chatBody = document.getElementById('chatWorkspace');
  const dropOverlay = document.getElementById('dropZone');

  chatBody.addEventListener('dragover', e => {
    e.preventDefault();
    dropOverlay.classList.remove('hidden');
  });
  chatBody.addEventListener('dragleave', e => {
    if (!chatBody.contains(e.relatedTarget)) {
      dropOverlay.classList.add('hidden');
    }
  });
  chatBody.addEventListener('drop', e => {
    e.preventDefault();
    dropOverlay.classList.add('hidden');
    Array.from(e.dataTransfer.files).forEach(file => attachFile(file));
  });
}

// ── Voice Input ────────────────────────────────────────────────
let mediaRecorder = null;
let isRecording = false;

function startVoiceInput() {
  const btn = document.getElementById('voiceBtn');
  if (!isRecording) {
    if (!navigator.mediaDevices) { showToast('Микрофон не поддерживается', 'error'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      const chunks = [];
      mediaRecorder.ondataavailable = e => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        showToast('Голосовой ввод записан (демо)', 'info');
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      isRecording = true;
      btn.classList.add('recording');
      showToast('Запись... Нажмите снова для остановки', 'info');
    }).catch(() => showToast('Нет доступа к микрофону', 'error'));
  } else {
    mediaRecorder?.stop();
    isRecording = false;
    btn.classList.remove('recording');
  }
}

// ── Scroll ─────────────────────────────────────────────────────
function scrollToBottom() {
  const messages = document.getElementById('messages');
  messages.scrollTop = messages.scrollHeight;
  document.getElementById('scrollBottomBtn').classList.add('hidden');
}

function setupScrollDetection() {
  const messages = document.getElementById('messages');
  messages.addEventListener('scroll', () => {
    const isAtBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 100;
    document.getElementById('scrollBottomBtn').classList.toggle('hidden', isAtBottom);
  });
}
// ── Auth Actions ───────────────────────────────────────────────────
async function doLogout() {
  const token = STATE.currentUser?.token || localStorage.getItem('sa_token');
  if (token) {
    try {
      await fetch(`${CONFIG.BACKEND_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch(e) {}
  }
  STATE.currentUser = null;
  STATE.isLoggedIn = false;
  STATE.chats = {};
  STATE.analytics = [];
  localStorage.removeItem('sa_user');
  localStorage.removeItem('sa_token');
  localStorage.removeItem('sa_last_chat');
  addAuditEntry('auth', 'Выход из системы');
  showLogin();
}

// ── Chat Actions ───────────────────────────────────────────────────
function clearChat() {if (!confirm('Очистить историю этого чата?')) return;
  const chat = STATE.chats[STATE.currentChatId];
  if (chat) {
    chat.messages = [];
    chat.totalCost = 0;
    chat.totalTokens = 0;
  }
  STATE.chatCost = 0;
  STATE.taskCost = 0;
  STATE.totalTokens = 0;
  document.getElementById('chatCostDisplay').textContent = '$0.0000';
  document.getElementById('chatCostDisplay').textContent = '$0.0000';
  document.getElementById('totalTokensVal').textContent = '0';
  document.getElementById('messages').querySelectorAll('.message').forEach(m => m.remove());
  document.getElementById('welcomeScreen').style.display = 'flex';
  saveChats();
  addAuditEntry('chat', 'Чат очищен');
  showToast('Чат очищен', 'success');
}

function shareChat() {
  const chat = STATE.chats[STATE.currentChatId];
  if (!chat) return;
  const text = chat.messages.map(m => `${m.role === 'user' ? 'Вы' : 'Агент'}: ${m.content}`).join('\n\n');
  navigator.clipboard.writeText(text).then(() => showToast('Чат скопирован в буфер', 'success'));
}

function copyMessage(msgId) {
  const contentEl = document.getElementById('content_' + msgId);
  if (contentEl) {
    navigator.clipboard.writeText(contentEl.innerText).then(() => showToast('Скопировано', 'success'));
  }
}

function copyCode(btn) {
  const pre = btn.closest('pre');
  const code = pre?.querySelector('code');
  if (code) {
    navigator.clipboard.writeText(code.innerText).then(() => {
      btn.textContent = 'Скопировано!';
      setTimeout(() => btn.textContent = 'Копировать', 2000);
    });
  }
}

function likeMessage(msgId) {
  showToast('Спасибо за оценку!', 'success');
}

function regenerateMessage() {
  const chat = STATE.chats[STATE.currentChatId];
  if (!chat || chat.messages.length < 2) return;
  // Remove last assistant message
  const lastMsg = chat.messages[chat.messages.length - 1];
  if (lastMsg.role === 'assistant') {
    chat.messages.pop();
    document.querySelectorAll('.message.assistant:last-child').forEach(m => m.remove());
  }
  // Resend
  const lastUserMsg = chat.messages[chat.messages.length - 1];
  if (lastUserMsg?.role === 'user') sendMessage();
}

// ── Settings Modal ─────────────────────────────────────────────
function openSettings() {
  document.getElementById('settingsModal').classList.remove('hidden');
  updateUsageStats();
}

function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function closeSettingsOnOverlay(e) {
  if (e.target === document.getElementById('settingsModal')) closeSettings();
}

function switchSettingsTab(tab, btn) {
  document.querySelectorAll('.settings-tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.settings-nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('settings-' + tab)?.classList.add('active');
  btn.classList.add('active');
}

function toggleSetting(key, el) {
  el.classList.toggle('active');
  STATE.settings[key] = el.classList.contains('active');
  saveSettings();
}

function saveSetting(key, value) {
  STATE.settings[key] = value;
  saveSettings();
}

function setTheme(theme, el) {
  document.querySelectorAll('.appearance-option').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  STATE.settings.theme = theme;
  saveSettings();
  applyTheme(theme);
}

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', theme);
  }
}

function setFontSize(size) {
  STATE.settings.fontSize = parseInt(size);
  saveSettings();
  applyFontSize(STATE.settings.fontSize);
}

function applyFontSize(size) {
  document.documentElement.style.fontSize = size + 'px';
}

function selectDefaultModel(modelId, el) {
  document.querySelectorAll('.settings-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  STATE.selectedModel = modelId;
  const modelName = CONFIG.MODELS[modelId]?.name || modelId;
  document.getElementById('modelSelLabel').textContent = modelName;
  showToast(`Модель по умолчанию: ${modelName}`, 'success');
}

function saveApiKey() {
  STATE.settings.openrouterKey = document.getElementById('openrouterKey').value;
  saveSettings();
  showToast('API ключ сохранён', 'success');
}

function saveBackendUrl() {
  const url = document.getElementById('backendUrl').value.trim();
  STATE.settings.backendUrl = url;
  CONFIG.BACKEND_URL = url || window.location.origin;
  saveSettings();
  showToast('URL бэкенда сохранён', 'success');
}

function savePersonalization() {
  STATE.settings.profileName = document.getElementById('profileName').value;
  STATE.settings.agentContext = document.getElementById('agentContext').value;
  saveSettings();
  showToast('Персонализация сохранена', 'success');
}

function manageCookies() {
  showToast('Управление куками открыто (демо)', 'info');
}

function clearAllData() {
  if (!confirm('Удалить ВСЕ данные? Это действие необратимо.')) return;
  localStorage.clear();
  showToast('Все данные удалены', 'success');
  setTimeout(() => location.reload(), 1000);
}

function updateUsageStats() {
  const totalCost = STATE.analytics.reduce((sum, a) => sum + (a.cost || 0), 0);
  const totalTokens = STATE.analytics.reduce((sum, a) => sum + (a.inputTokens || 0) + (a.outputTokens || 0), 0);
  const container = document.getElementById('usageStats');
  if (!container) return;
  container.innerHTML = `
    <div class="stat-card"><div class="stat-value" style="color:var(--accent-green);">$${totalCost.toFixed(4)}</div><div class="stat-label">Всего потрачено</div></div>
    <div class="stat-card"><div class="stat-value" style="color:var(--accent-blue);">${totalTokens.toLocaleString()}</div><div class="stat-label">Всего токенов</div></div>
    <div class="stat-card"><div class="stat-value" style="color:var(--accent-purple);">${STATE.analytics.length}</div><div class="stat-label">Запросов</div></div>
    <div class="stat-card"><div class="stat-value" style="color:var(--accent-orange);">${Object.keys(STATE.chats).length}</div><div class="stat-label">Чатов</div></div>
  `;
}

// ── Analytics ──────────────────────────────────────────────────
let costChart = null, modelsChart = null;

function initAnalyticsCharts() {
  // Will be initialized when tab is opened
}

function renderAnalytics() {
  const totalCost = STATE.analytics.reduce((sum, a) => sum + (a.cost || 0), 0);
  const totalTokens = STATE.analytics.reduce((sum, a) => sum + (a.inputTokens || 0) + (a.outputTokens || 0), 0);
  const avgCost = STATE.analytics.length > 0 ? totalCost / STATE.analytics.length : 0;

  // Summary cards
  const summary = document.getElementById('analyticsCards');
  if (summary) {
    summary.innerHTML = `
      <div class="analytics-summary-card"><span class="analytics-summary-icon">💰</span><div><div class="analytics-summary-value" style="color:var(--accent-green);">$${totalCost.toFixed(4)}</div><div class="analytics-summary-label">Общие расходы</div></div></div>
      <div class="analytics-summary-card"><span class="analytics-summary-icon">⚡</span><div><div class="analytics-summary-value" style="color:var(--accent-blue);">${totalTokens.toLocaleString()}</div><div class="analytics-summary-label">Всего токенов</div></div></div>
      <div class="analytics-summary-card"><span class="analytics-summary-icon">📊</span><div><div class="analytics-summary-value" style="color:var(--accent-purple);">${STATE.analytics.length}</div><div class="analytics-summary-label">Запросов</div></div></div>
      <div class="analytics-summary-card"><span class="analytics-summary-icon">📈</span><div><div class="analytics-summary-value" style="color:var(--accent-orange);">$${avgCost.toFixed(4)}</div><div class="analytics-summary-label">Средняя стоимость</div></div></div>
    `;
  }

  // Charts
  renderCostChart();
  renderModelsChart();

  // Table
  const tbody = document.getElementById('analyticsTableBody');
  if (tbody) {
    const recent = STATE.analytics.slice(-20).reverse();
    tbody.innerHTML = recent.map(a => `
      <tr>
        <td>${new Date(a.date).toLocaleDateString('ru-RU')}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.query)}</td>
        <td>${CONFIG.MODELS[a.model]?.name || a.model}</td>
        <td>${((a.inputTokens || 0) + (a.outputTokens || 0)).toLocaleString()}</td>
        <td style="color:var(--accent-green);">$${(a.cost || 0).toFixed(6)}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:20px;">Нет данных</td></tr>';
  }
}

function renderCostChart() {
  const canvas = document.getElementById('costChart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Group by day
  const byDay = {};
  STATE.analytics.forEach(a => {
    const day = new Date(a.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    byDay[day] = (byDay[day] || 0) + (a.cost || 0);
  });

  const labels = Object.keys(byDay).slice(-7);
  const data = labels.map(l => byDay[l]);

  if (costChart) costChart.destroy();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#9898a6' : '#5a5a72';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  costChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels.length > 0 ? labels : ['Нет данных'],
      datasets: [{
        label: 'Стоимость ($)',
        data: data.length > 0 ? data : [0],
        borderColor: '#818cf8',
        backgroundColor: 'rgba(129,140,248,0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#818cf8',
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, callback: v => '$' + v.toFixed(4) }, grid: { color: gridColor } }
      }
    }
  });
}

function renderModelsChart() {
  const canvas = document.getElementById('modelChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const byModel = {};
  STATE.analytics.forEach(a => {
    const name = CONFIG.MODELS[a.model]?.name || a.model;
    byModel[name] = (byModel[name] || 0) + (a.cost || 0);
  });

  const labels = Object.keys(byModel);
  const data = Object.values(byModel);
  const colors = ['#818cf8', '#a855f7', '#60a5fa', '#34d399', '#fb923c'];

  if (modelsChart) modelsChart.destroy();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#9898a6' : '#5a5a72';

  modelsChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels.length > 0 ? labels : ['Нет данных'],
      datasets: [{
        data: data.length > 0 ? data : [1],
        backgroundColor: colors.slice(0, labels.length || 1),
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, padding: 12, font: { size: 11 } } }
      }
    }
  });
}

function exportAnalytics() {
  const csv = ['Дата,Запрос,Модель,Токены,Стоимость'];
  STATE.analytics.forEach(a => {
    csv.push(`"${new Date(a.date).toLocaleDateString('ru-RU')}","${a.query}","${a.model}","${(a.inputTokens||0)+(a.outputTokens||0)}","$${(a.cost||0).toFixed(6)}"`);
  });
  downloadFile('analytics.csv', csv.join('\n'), 'text/csv');
  showToast('Аналитика экспортирована', 'success');
}

// ── Agents ─────────────────────────────────────────────────────
function renderAgents() {
  const agents = [
    { icon: '🚀', name: 'Deploy Agent', desc: 'Деплой и управление серверами. Настройка nginx, pm2, docker.', tools: 'SSH, Docker, Nginx, PM2', badge: 'system' },
    { icon: '💻', name: 'Code Agent', desc: 'Написание, рефакторинг и отладка кода на любом языке.', tools: 'Git, Linter, Formatter', badge: 'system' },
    { icon: '📊', name: 'Data Agent', desc: 'Анализ данных, построение графиков и статистика.', tools: 'Pandas, Matplotlib, SQL', badge: 'system' },
    { icon: '🔍', name: 'Research Agent', desc: 'Исследование тем, поиск информации и составление отчётов.', tools: 'Web Search, Summarizer', badge: 'system' },
    { icon: '📁', name: 'File Agent', desc: 'Работа с файлами: создание, редактирование, конвертация.', tools: 'File System, Converter', badge: 'system' },
    { icon: '💬', name: 'Chat Agent', desc: 'Умный чат-ассистент для общих вопросов и задач.', tools: 'LLM, Memory, Context', badge: 'system' },
  ];

  const list = document.getElementById('agentsGrid');
  if (!list) return;
  list.innerHTML = agents.map(a => `
    <div class="agent-card">
      <div class="agent-card-header">
        <span class="agent-avatar">${a.icon}</span>
        <h3>${a.name}</h3>
        <span class="agent-badge ${a.badge}">${a.badge === 'system' ? 'Системный' : 'Пользовательский'}</span>
      </div>
      <p>${a.desc}</p>
      <div class="agent-tools">🔧 ${a.tools}</div>
    </div>
  `).join('');
}

// ── Templates ──────────────────────────────────────────────────
const TEMPLATES = [
  { icon: '🚀', title: 'Деплой Node.js', desc: 'Полный деплой Node.js приложения на VPS с настройкой nginx и pm2', category: 'deploy', prompt: 'Задеплой Node.js приложение на сервер. Настрой nginx как reverse proxy и pm2 для управления процессами.' },
  { icon: '🐳', title: 'Docker Compose', desc: 'Создание docker-compose.yml для многоконтейнерного приложения', category: 'deploy', prompt: 'Создай docker-compose.yml для приложения с Node.js бэкендом, PostgreSQL и Redis.' },
  { icon: '🔒', title: 'SSL сертификат', desc: 'Настройка Let\'s Encrypt SSL с автообновлением', category: 'deploy', prompt: 'Настрой SSL сертификат Let\'s Encrypt для домена с автообновлением через certbot.' },
  { icon: '🐍', title: 'FastAPI сервис', desc: 'REST API на Python с FastAPI, документацией и тестами', category: 'code', prompt: 'Напиши REST API на Python FastAPI с CRUD операциями, документацией Swagger и unit-тестами.' },
  { icon: '⚛️', title: 'React компонент', desc: 'Переиспользуемый React компонент с TypeScript и тестами', category: 'code', prompt: 'Создай переиспользуемый React компонент с TypeScript, props validation и unit-тестами.' },
  { icon: '🗄️', title: 'SQL оптимизация', desc: 'Анализ и оптимизация медленных SQL запросов', category: 'data', prompt: 'Проанализируй и оптимизируй медленные SQL запросы. Добавь индексы и улучши структуру.' },
  { icon: '📈', title: 'Анализ продаж', desc: 'Анализ данных продаж с визуализацией и прогнозом', category: 'data', prompt: 'Проанализируй данные продаж, построй графики по месяцам и сделай прогноз на следующий квартал.' },
  { icon: '🔍', title: 'Конкурентный анализ', desc: 'Исследование конкурентов и рыночных трендов', category: 'research', prompt: 'Исследуй конкурентов в нише [укажи нишу], их сильные/слабые стороны и рыночные тренды.' },
  { icon: '📄', title: 'Технический отчёт', desc: 'Структурированный технический отчёт по теме', category: 'research', prompt: 'Составь детальный технический отчёт по теме [укажи тему] с источниками и выводами.' },
];

function renderTemplates(filter = 'all') {
  const grid = document.getElementById('templatesGrid');
  if (!grid) return;
  const filtered = filter === 'all' ? TEMPLATES : TEMPLATES.filter(t => t.category === filter);
  grid.innerHTML = filtered.map(t => `
    <div class="template-card" onclick="useTemplate('${escapeHtml(t.prompt)}')">
      <div class="template-card-icon">${t.icon}</div>
      <div class="template-card-title">${t.title}</div>
      <div class="template-card-desc">${t.desc}</div>
      <span class="template-card-tag">${t.category}</span>
    </div>
  `).join('');
}

function filterTemplates(filter, btn) {
  document.querySelectorAll('.template-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTemplates(filter);
}

function useTemplate(prompt) {
  switchTab('chat');
  document.getElementById('chatInput').value = prompt;
  autoResizeInput(document.getElementById('chatInput'));
  document.getElementById('chatInput').focus();
  showToast('Шаблон загружен', 'success');
}

// ── Canvas ─────────────────────────────────────────────────────
function renderCanvases() {
  const list = document.getElementById('canvasGrid');
  if (!list) return;
  if (STATE.canvases.length === 0) {
    list.innerHTML = '<div style="color:var(--text-tertiary);font-size:14px;padding:20px 0;">Нет документов. Создайте первый!</div>';
    return;
  }
  list.innerHTML = STATE.canvases.map((c, i) => `
    <div class="canvas-card" onclick="openCanvas(${i})">
      <div class="canvas-card-title">${escapeHtml(c.title)}</div>
      <div class="canvas-card-meta">${c.type} · ${formatDate(c.updatedAt)}</div>
    </div>
  `).join('');
}

function createCanvas() {
  document.getElementById('canvasGrid').classList.add('hidden');
  document.getElementById('canvasGrid').classList.remove('hidden');
  document.getElementById('canvasTitleInput').value = '';
  document.getElementById('canvasContent').value = '';
  document.getElementById('canvasGrid').setAttribute('data-index', '-1');
}

function openCanvas(index) {
  const canvas = STATE.canvases[index];
  if (!canvas) return;
  document.getElementById('canvasGrid').classList.add('hidden');
  document.getElementById('canvasGrid').classList.remove('hidden');
  document.getElementById('canvasTitleInput').value = canvas.title;
  document.getElementById('canvasContent').value = canvas.content;
  document.getElementById('canvasTypeSelect').value = canvas.type;
  document.getElementById('canvasGrid').setAttribute('data-index', index);
}

function closeCanvasEditor() {
  document.getElementById('canvasGrid').classList.remove('hidden');
  document.getElementById('canvasGrid').classList.add('hidden');
}

function saveCanvas() {
  const title = document.getElementById('canvasTitleInput').value.trim() || 'Без названия';
  const content = document.getElementById('canvasContent').value;
  const type = document.getElementById('canvasTypeSelect').value;
  const index = parseInt(document.getElementById('canvasGrid').getAttribute('data-index'));

  const canvas = { title, content, type, updatedAt: new Date().toISOString() };
  if (index === -1) {
    STATE.canvases.push(canvas);
  } else {
    STATE.canvases[index] = canvas;
  }
  localStorage.setItem('sa_canvases', JSON.stringify(STATE.canvases));
  renderCanvases();
  closeCanvasEditor();
  showToast('Документ сохранён', 'success');
}

async function improveWithAI() {
  const content = document.getElementById('canvasContent').value;
  const instruction = document.getElementById('canvasAiInput').value.trim();
  if (!content || !instruction) { showToast('Введите текст и инструкцию', 'warning'); return; }
  showToast('AI улучшает текст...', 'info');
  // Simulate AI improvement
  await sleep(1500);
  showToast('Текст улучшен (демо)', 'success');
}

// ── Connectors ─────────────────────────────────────────────────
function renderConnectors() {
  const connectors = [
    { icon: '🐙', name: 'GitHub', desc: 'Управление репозиториями и CI/CD', connected: true },
    { icon: '🐋', name: 'Docker Hub', desc: 'Контейнеры и образы', connected: false },
    { icon: '☁️', name: 'AWS', desc: 'Amazon Web Services', connected: false },
    { icon: '🔷', name: 'Azure', desc: 'Microsoft Azure Cloud', connected: false },
    { icon: '📊', name: 'Grafana', desc: 'Мониторинг и дашборды', connected: false },
    { icon: '📬', name: 'Telegram', desc: 'Уведомления в Telegram', connected: false },
    { icon: '🗄️', name: 'PostgreSQL', desc: 'База данных', connected: false },
    { icon: '🔴', name: 'Redis', desc: 'Кэш и очереди', connected: false },
  ];

  const grid = document.getElementById('connectorsGrid');
  if (!grid) return;
  grid.innerHTML = connectors.map(c => `
    <div class="connector-card">
      <span class="connector-icon">${c.icon}</span>
      <div class="connector-info">
        <h3>${c.name}</h3>
        <p>${c.desc}</p>
      </div>
      <div class="connector-status">
        <button class="admin-btn" onclick="toggleConnector('${c.name}', this)" style="${c.connected ? 'color:var(--accent-green);border-color:rgba(52,211,153,0.3);' : ''}">
          ${c.connected ? '✓ Подключён' : 'Подключить'}
        </button>
      </div>
    </div>
  `).join('');
}

function toggleConnector(name, btn) {
  const isConnected = btn.textContent.includes('Подключён');
  if (isConnected) {
    btn.textContent = 'Подключить';
    btn.style.color = '';
    btn.style.borderColor = '';
    showToast(`${name} отключён`, 'info');
  } else {
    btn.textContent = '✓ Подключён';
    btn.style.color = 'var(--accent-green)';
    btn.style.borderColor = 'rgba(52,211,153,0.3)';
    showToast(`${name} подключён`, 'success');
    addAuditEntry('settings', `Подключён коннектор ${name}`);
  }
}

// ── Scheduled Tasks ────────────────────────────────────────────
function renderScheduledTasks() {
  const list = document.getElementById('scheduledList');
  if (!list) return;
  if (STATE.scheduledTasks.length === 0) {
    list.innerHTML = '<div style="color:var(--text-tertiary);font-size:14px;padding:20px 0;">Нет запланированных задач</div>';
    return;
  }
  list.innerHTML = STATE.scheduledTasks.map((t, i) => `
    <div class="scheduled-task-item">
      <div class="scheduled-task-info">
        <div class="scheduled-task-name">${escapeHtml(t.name)}</div>
        <div class="scheduled-task-cron">${t.cron}</div>
      </div>
      <div class="toggle-switch ${t.active ? 'active' : ''}" onclick="toggleScheduledTask(${i}, this)"><span class="toggle-slider"></span></div>
      <button class="admin-btn" onclick="deleteScheduledTask(${i})">Удалить</button>
    </div>
  `).join('');
}

function openScheduleModal() {
  document.getElementById('scheduleModal').classList.add('visible');
}

function closeScheduleModal() {
  document.getElementById('scheduleModal').classList.remove('visible');
}

function saveScheduledTask() {
  const name = document.getElementById('schedName').value.trim();
  const prompt = document.getElementById('schedTask').value.trim();
  const cron = document.getElementById('schedCron').value.trim();
  if (!name || !prompt || !cron) { showToast('Заполните все поля', 'warning'); return; }
  STATE.scheduledTasks.push({ name, prompt, cron, active: true, createdAt: new Date().toISOString() });
  localStorage.setItem('sa_scheduled', JSON.stringify(STATE.scheduledTasks));
  renderScheduledTasks();
  closeScheduleModal();
  showToast('Задача создана', 'success');
  addAuditEntry('settings', `Создана задача по расписанию: ${name}`);
}

function toggleScheduledTask(index, el) {
  el.classList.toggle('active');
  STATE.scheduledTasks[index].active = el.classList.contains('active');
  localStorage.setItem('sa_scheduled', JSON.stringify(STATE.scheduledTasks));
}

function deleteScheduledTask(index) {
  STATE.scheduledTasks.splice(index, 1);
  localStorage.setItem('sa_scheduled', JSON.stringify(STATE.scheduledTasks));
  renderScheduledTasks();
  showToast('Задача удалена', 'info');
}

// ── Audit Log ──────────────────────────────────────────────────
function addAuditEntry(type, message) {
  STATE.auditLog.unshift({
    type, message,
    user: STATE.currentUser?.name || 'System',
    timestamp: new Date().toISOString(),
  });
  if (STATE.auditLog.length > 200) STATE.auditLog = STATE.auditLog.slice(0, 200);
  localStorage.setItem('sa_audit', JSON.stringify(STATE.auditLog));
}

function renderAuditLog() {
  const list = document.getElementById('auditList');
  if (!list) return;
  const icons = { chat: '💬', deploy: '🚀', settings: '⚙️', auth: '🔐' };
  list.innerHTML = STATE.auditLog.slice(0, 50).map(e => `
    <div class="audit-entry">
      <span style="font-size:16px;">${icons[e.type] || '📋'}</span>
      <div style="flex:1;">
        <div style="font-size:13px;">${escapeHtml(e.message)}</div>
        <div style="font-size:11px;color:var(--text-tertiary);">${e.user} · ${new Date(e.timestamp).toLocaleString('ru-RU')}</div>
      </div>
      <span style="font-size:11px;padding:2px 8px;border-radius:var(--radius-full);background:var(--bg-tertiary);color:var(--text-tertiary);">${e.type}</span>
    </div>
  `).join('') || '<div style="padding:20px;text-align:center;color:var(--text-tertiary);">Журнал пуст</div>';
}

function filterAudit(query) {
  const entries = document.querySelectorAll('.audit-entry');
  entries.forEach(e => {
    const text = e.textContent.toLowerCase();
    e.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
  });
}

function filterAuditType(type) {
  renderAuditLog();
  if (type) filterAudit(type);
}

// ── Admin Panel ────────────────────────────────────────────────
function renderAdminPanel() {
  const stats = document.getElementById('adminStats');
  if (stats) {
    const totalCost = STATE.analytics.reduce((sum, a) => sum + (a.cost || 0), 0);
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-value" style="color:var(--accent-green);">$${totalCost.toFixed(4)}</div><div class="stat-label">Общие расходы</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--accent-blue);">${STATE.analytics.length}</div><div class="stat-label">Запросов</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--accent-purple);">${Object.keys(STATE.chats).length}</div><div class="stat-label">Чатов</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--accent-orange);">${STATE.auditLog.length}</div><div class="stat-label">Событий аудита</div></div>
    `;
  }

  const usersTable = document.getElementById('adminUsersTable');
  if (usersTable) {
    usersTable.innerHTML = Object.entries(CONFIG.USERS).map(([username, user]) => `
      <tr>
        <td>${username}</td>
        <td>${user.role}</td>
        <td>${new Date().toLocaleDateString('ru-RU')}</td>
        <td>${STATE.analytics.length}</td>
        <td><button class="admin-btn" onclick="showToast('Действие выполнено', \'info\')">Управление</button></td>
      </tr>
    `).join('');
  }
}

// ── Command Palette ────────────────────────────────────────────
const COMMANDS = [
  { icon: '💬', text: 'Новый чат', action: () => newChat(), shortcut: 'Ctrl+N' },
  { icon: '⚙️', text: 'Настройки', action: () => openSettings(), shortcut: 'Ctrl+,' },
  { icon: '📊', text: 'Аналитика', action: () => switchTab('analytics'), shortcut: '' },
  { icon: '🤖', text: 'Агенты', action: () => switchTab('agents'), shortcut: '' },
  { icon: '📄', text: 'Шаблоны', action: () => switchTab('templates'), shortcut: '' },
  { icon: '✏️', text: 'Холст', action: () => switchTab('canvas'), shortcut: '' },
  { icon: '🔗', text: 'Коннекторы', action: () => switchTab('connectors'), shortcut: '' },
  { icon: '📅', text: 'Расписание', action: () => switchTab('scheduled'), shortcut: '' },
  { icon: '📋', text: 'Аудит', action: () => switchTab('audit'), shortcut: '' },
  { icon: '🌙', text: 'Тёмная тема', action: () => setTheme('dark', document.getElementById('themeDark')), shortcut: '' },
  { icon: '☀️', text: 'Светлая тема', action: () => setTheme('light', document.getElementById('themeLight')), shortcut: '' },
  { icon: '🗑️', text: 'Очистить чат', action: () => clearChat(), shortcut: '' },
  { icon: '📤', text: 'Экспорт аналитики', action: () => exportAnalytics(), shortcut: '' },
  { icon: '🖥️', text: 'Компьютер агента', action: () => toggleAgentComputer(), shortcut: '' },
];

function openCommandPalette() {
  document.getElementById('cmdPalette').classList.remove('hidden');
  STATE.commandPaletteOpen = true;
  renderCommands(COMMANDS);
  setTimeout(() => document.getElementById('cmdInput').focus(), 50);
}

function closeCommandPalette(e) {
  if (e?.target === document.getElementById('cmdPalette') || !e) {
    document.getElementById('cmdPalette').classList.add('hidden');
    STATE.commandPaletteOpen = false;
    document.getElementById('cmdInput').value = '';
  }
}

function renderCommands(commands) {
  const list = document.getElementById('cmdResults');
  list.innerHTML = `
    <div class="command-group-label">Команды</div>
    ${commands.map((c, i) => `
      <div class="command-item" onclick="executeCommand(${COMMANDS.indexOf(c)})" data-index="${i}">
        <span class="command-item-icon">${c.icon}</span>
        <span class="command-item-text">${c.text}</span>
        ${c.shortcut ? `<span class="command-item-shortcut">${c.shortcut}</span>` : ''}
      </div>
    `).join('')}
  `;
}

function filterCommands(query) {
  const filtered = COMMANDS.filter(c => c.text.toLowerCase().includes(query.toLowerCase()));
  renderCommands(filtered);
}

function executeCommand(index) {
  COMMANDS[index]?.action();
  closeCommandPalette();
}

let commandSelectedIndex = 0;
function handleCommandKey(e) {
  const items = document.querySelectorAll('.command-item');
  if (e.key === 'ArrowDown') {
    commandSelectedIndex = Math.min(commandSelectedIndex + 1, items.length - 1);
    items.forEach((item, i) => item.classList.toggle('selected', i === commandSelectedIndex));
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    commandSelectedIndex = Math.max(commandSelectedIndex - 1, 0);
    items.forEach((item, i) => item.classList.toggle('selected', i === commandSelectedIndex));
    e.preventDefault();
  } else if (e.key === 'Enter') {
    items[commandSelectedIndex]?.click();
  } else if (e.key === 'Escape') {
    closeCommandPalette();
  }
}

// ── Keyboard Shortcuts ─────────────────────────────────────────
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) {
      switch(e.key) {
        case 'k': e.preventDefault(); openCommandPalette(); break;
        case 'n': e.preventDefault(); newChat(); break;
        case ',': e.preventDefault(); openSettings(); break;
        case '/': e.preventDefault(); document.getElementById('chatInput')?.focus(); break;
      }
    }
    if (e.key === 'Escape') {
      if (STATE.commandPaletteOpen) closeCommandPalette();
      if (!document.getElementById('settingsModal').classList.contains('hidden')) closeSettings();
    }
  });
}

// ── Toast Notifications ────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-text">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Utilities ──────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return 'только что';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' мин назад';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' ч назад';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', csv: '📊', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', mp4: '🎥', mp3: '🎵', zip: '📦', py: '🐍', js: '📜', ts: '📜', json: '📋', md: '📝' };
  return icons[ext] || '📎';
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
