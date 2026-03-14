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
  selectedModel: 'original',
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

// Pending files to upload with next message
let _pendingFiles = [];

// ── Config ─────────────────────────────────────────────────────
const CONFIG = {
  BACKEND_URL: window.location.origin.includes('localhost') || window.location.origin.includes('8080') ? 'https://minimax.mksitdev.ru' : window.location.origin,
  DEFAULT_MODEL: 'original',
  USD_TO_RUB: 105,
  MODELS: {
    'original': { name: '🔴 Оригинал', desc: 'Grok Code Fast 1 · xAI', inputCost: 0.0000002, outputCost: 0.0000015 },
    'premium':  { name: '🟢 Премиум',  desc: 'MiniMax M2.5 · MiniMax', inputCost: 0.00000027, outputCost: 0.00000095 },
    'budget':   { name: '🔵 Бюджет',   desc: 'DeepSeek V3.2 · DeepSeek', inputCost: 0.00000026, outputCost: 0.00000038 },
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
  renderModelDropdown();
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
        // Always refresh chats from backend (admin sees all chats)
        // Keep only local-only chats (no backendId), replace backend chats
        const localOnlyChats = {};
        Object.entries(STATE.chats).forEach(([id, chat]) => {
          if (!chat.backendId) localOnlyChats[id] = chat;
        });
        STATE.chats = { ...localOnlyChats };
        backendChats.forEach(bc => {
          const localId = 'bc_' + bc.id;
          STATE.chats[localId] = {
            id: localId,
            backendId: bc.id,
            title: bc.title || 'Новый чат',
            messages: [],  // messages loaded on demand
            createdAt: bc.created_at || new Date().toISOString(),
            updatedAt: bc.updated_at || bc.created_at || new Date().toISOString(),
            totalCost: bc.total_cost || 0,
            totalTokens: bc.total_tokens || 0,
            messageCount: bc.message_count || 0,
            model: bc.model_used || STATE.selectedModel,
            owner: bc.owner || '',  // email of owner for admin view
          };
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
  document.querySelectorAll('[id^="tab-"]').forEach(el => { el.classList.add('hidden'); el.classList.remove('active'); });
  // Remove active from all nav items
  document.querySelectorAll('.nav-item, .sb-nav-item').forEach(el => el.classList.remove('active'));

  // Show selected tab
  const tabEl = document.getElementById('tab-' + tabName);
  if (tabEl) { tabEl.classList.remove('hidden'); tabEl.classList.add('active'); }

  // Activate nav button
  if (btn) btn.classList.add('active');
  const navEl = document.getElementById('nav-' + tabName);
  if (navEl) navEl.classList.add('active');

  // Mobile: close sidebar
  if (window.innerWidth <= 768) closeMobileSidebar();

  // Tab-specific init
  if (tabName === 'analytics') renderAnalytics();
  if (tabName === 'admin') renderAdminPanel();
  if (tabName === 'agents') renderAgents();
  if (tabName === 'templates') renderTemplates();
  if (tabName === 'connectors') renderConnectors();
  if (tabName === 'scheduled') renderScheduledTasks();
  if (tabName === 'audit') renderAuditLog();
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
  const isAdminView = STATE.currentUser?.role === 'admin' && chat.owner;
  const titleEl = document.getElementById('chatTitle');
  titleEl.textContent = chat.title;
  if (isAdminView) {
    titleEl.title = `Владелец: ${chat.owner}`;
  } else {
    titleEl.title = '';
  }
  document.getElementById('chatCostDisplay').textContent = '$' + STATE.chatCost.toFixed(4);
  const tokensValEl = document.getElementById('totalTokensVal');
  if (tokensValEl) tokensValEl.textContent = STATE.totalTokens.toLocaleString();
  const msgCountEl = document.getElementById('chatMsgCount');
  if (msgCountEl) {
    const cnt = chat.messages?.length || chat.messageCount || 0;
    msgCountEl.textContent = cnt + ' ' + (cnt === 1 ? 'сообщение' : cnt >= 2 && cnt <= 4 ? 'сообщения' : 'сообщений');
  }

  // Render messages
  const messagesEl = document.getElementById('messages');
  const welcomeState = document.getElementById('welcomeScreen');

  // If chat has backendId but no messages loaded yet, fetch from backend
  const token = STATE.currentUser?.token || localStorage.getItem('sa_token');
  if (chat.backendId && chat.messages.length === 0 && (chat.messageCount || 0) > 0 && token) {
    welcomeState.style.display = 'flex';
    messagesEl.querySelectorAll('.message').forEach(m => m.remove());
    // Show loading indicator
    const loadingEl = document.createElement('div');
    loadingEl.id = 'chat_loading_indicator';
    loadingEl.style.cssText = 'text-align:center;padding:20px;color:var(--text-secondary);font-size:13px;';
    loadingEl.textContent = 'Загрузка сообщений...';
    messagesEl.appendChild(loadingEl);
    fetch(`${CONFIG.BACKEND_URL}/api/chats/${chat.backendId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json()).then(data => {
      const loadEl = document.getElementById('chat_loading_indicator');
      if (loadEl) loadEl.remove();
      if (data.chat && data.chat.messages) {
        chat.messages = data.chat.messages.map(m => ({
          role: m.role,
          content: m.content,
          cost: m.cost || 0,
          tokens: m.tokens || 0,
        }));
        chat.totalCost = data.chat.total_cost || chat.totalCost;
        chat.totalTokens = data.chat.total_tokens || chat.totalTokens;
        saveChats();
        if (STATE.currentChatId === chatId) {
          if (chat.messages.length > 0) {
            welcomeState.style.display = 'none';
            messagesEl.querySelectorAll('.message').forEach(m => m.remove());
            chat.messages.forEach(msg => renderMessage(msg.role, msg.content, msg.cost, msg.tokens, false));
            setTimeout(scrollToBottom, 100);
          }
        }
      }
    }).catch(() => {
      const loadEl = document.getElementById('chat_loading_indicator');
      if (loadEl) loadEl.remove();
    });
  } else if (chat.messages.length === 0) {
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
  if (event) event.stopPropagation();
  closeChatContextMenu();
  if (!confirm('Удалить этот чат? Это действие необратимо.')) return;
  // Delete from backend
  const chat = STATE.chats[chatId];
  const token = STATE.currentUser?.token || localStorage.getItem('sa_token');
  if (chat?.backendId && token) {
    fetch(`${CONFIG.BACKEND_URL}/api/chats/${chat.backendId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {});
  }
  delete STATE.chats[chatId];
  saveChats();
  renderChatList();
  if (STATE.currentChatId === chatId) {
    const ids = Object.keys(STATE.chats);
    if (ids.length > 0) loadChat(ids[0]);
    else newChat();
  }
  addAuditEntry('chat', `Удалён чат ${chatId}`);
  showToast('Чат удалён', 'info');
}

function renameChatInline(chatId, event) {
  if (event) event.stopPropagation();
  closeChatContextMenu();
  const chat = STATE.chats[chatId];
  if (!chat) return;
  const newTitle = prompt('Переименовать чат:', chat.title);
  if (newTitle && newTitle.trim()) {
    chat.title = newTitle.trim();
    saveChats();
    renderChatList();
    if (STATE.currentChatId === chatId) {
      document.getElementById('chatTitle').textContent = chat.title;
    }
    showToast('Чат переименован', 'success');
  }
}

let _chatMenuOpenId = null;
function openChatContextMenu(chatId, event) {
  event.stopPropagation();
  closeChatContextMenu();
  _chatMenuOpenId = chatId;
  const menu = document.createElement('div');
  menu.id = 'chatContextMenu';
  menu.className = 'chat-context-menu';
  menu.innerHTML = `
    <button class="ctx-menu-item" onclick="renameChatInline('${chatId}', event)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Переименовать
    </button>
    <button class="ctx-menu-item danger" onclick="deleteChat('${chatId}', event)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      Удалить
    </button>
  `;
  document.body.appendChild(menu);
  // Position near the button
  if (event.currentTarget && event.currentTarget.getBoundingClientRect) {
    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = rect.left + 'px';
  } else {
    menu.style.top = ((event.clientY || 200) + 4) + 'px';
    menu.style.left = ((event.clientX || 200)) + 'px';
  }
  // Close on outside click
  setTimeout(() => document.addEventListener('click', closeChatContextMenu, { once: true }), 0);
}

function closeChatContextMenu() {
  const menu = document.getElementById('chatContextMenu');
  if (menu) menu.remove();
  _chatMenuOpenId = null;
}

function renderChatList() {
  const list = document.getElementById('chatList');
  const isAdmin = STATE.currentUser?.role === 'admin';
  const chats = Object.values(STATE.chats).sort((a, b) => {
    const ta = a.updatedAt || a.createdAt || '';
    const tb = b.updatedAt || b.createdAt || '';
    return new Date(tb) - new Date(ta);
  });

  if (chats.length === 0) {
    list.innerHTML = '<div style="padding:8px 10px;font-size:12px;color:var(--text-tertiary);">Нет чатов</div>';
    return;
  }

  list.innerHTML = chats.map(chat => {
    const costRub = chat.totalCost > 0 ? (chat.totalCost * CONFIG.USD_TO_RUB).toFixed(2) : null;
    const ownerBadge = isAdmin && chat.owner ? `<span style="font-size:10px;color:var(--accent-orange);margin-left:4px;" title="Владелец: ${escapeHtml(chat.owner)}">👤 ${escapeHtml(chat.owner.split('@')[0])}</span>` : '';
    const msgCount = chat.messageCount > 0 ? `<span style="font-size:10px;color:var(--text-tertiary);">${chat.messageCount} сообщ.</span>` : '';
    return `
    <div class="chat-item ${chat.id === STATE.currentChatId ? 'active' : ''}" 
         data-chat-id="${chat.id}" onclick="loadChat('${chat.id}')">
      <div class="chat-item-info">
        <div class="chat-item-title">${escapeHtml(chat.title)}${ownerBadge}</div>
        <div class="chat-item-meta">
          <span>${formatDate(chat.updatedAt || chat.createdAt)}</span>
          ${costRub ? `<span class="chat-item-cost">₽${costRub}</span>` : ''}
          ${msgCount}
        </div>
      </div>
      <button class="chat-item-menu" onclick="openChatContextMenu('${chat.id}', event)" title="Действия">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>
      </button>
    </div>
  `}).join('');
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

// Detect if a code block looks like a file artifact (JSON, CSV, XML, YAML, etc.)
function getArtifactInfo(lang, code) {
  const fileTypes = {
    json: { ext: 'json', mime: 'application/json', icon: '📄', label: 'JSON' },
    csv: { ext: 'csv', mime: 'text/csv', icon: '📊', label: 'CSV' },
    xml: { ext: 'xml', mime: 'text/xml', icon: '📄', label: 'XML' },
    yaml: { ext: 'yaml', mime: 'text/yaml', icon: '📄', label: 'YAML' },
    yml: { ext: 'yml', mime: 'text/yaml', icon: '📄', label: 'YAML' },
    html: { ext: 'html', mime: 'text/html', icon: '🌐', label: 'HTML' },
    sql: { ext: 'sql', mime: 'text/plain', icon: '🗄️', label: 'SQL' },
    sh: { ext: 'sh', mime: 'text/plain', icon: '💻', label: 'Shell' },
    bash: { ext: 'sh', mime: 'text/plain', icon: '💻', label: 'Bash' },
    python: { ext: 'py', mime: 'text/plain', icon: '🐍', label: 'Python' },
    py: { ext: 'py', mime: 'text/plain', icon: '🐍', label: 'Python' },
    javascript: { ext: 'js', mime: 'text/javascript', icon: '📜', label: 'JavaScript' },
    js: { ext: 'js', mime: 'text/javascript', icon: '📜', label: 'JavaScript' },
    typescript: { ext: 'ts', mime: 'text/plain', icon: '📜', label: 'TypeScript' },
    ts: { ext: 'ts', mime: 'text/plain', icon: '📜', label: 'TypeScript' },
    dockerfile: { ext: 'dockerfile', mime: 'text/plain', icon: '🐳', label: 'Dockerfile' },
    nginx: { ext: 'conf', mime: 'text/plain', icon: '⚙️', label: 'Nginx Config' },
  };
  const l = (lang || '').toLowerCase();
  // Large code blocks (>50 lines) or known file types get download button
  const lineCount = code.split('\n').length;
  if (fileTypes[l]) return fileTypes[l];
  if (lineCount > 50) return { ext: 'txt', mime: 'text/plain', icon: '📄', label: 'Text' };
  return null;
}

function renderMarkdown(text) {
  if (typeof marked === 'undefined') return escapeHtml(text).replace(/\n/g, '<br>');
  try {
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: function(code, lang) {
        const artifact = getArtifactInfo(lang, code);
        const downloadBtn = artifact
          ? `<button class="code-action-btn artifact-download" onclick="downloadCodeBlock(this,'${artifact.ext}','${artifact.mime}')" title="Скачать файл">${artifact.icon} Скачать .${artifact.ext}</button>`
          : '';
        return `<div class="code-block-header"><span class="code-lang">${lang || 'code'}</span><div class="code-actions">${downloadBtn}<button class="code-action-btn" onclick="copyCode(this)">Копировать</button></div></div><code>${escapeHtml(code)}</code>`;
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

function downloadCodeBlock(btn, ext, mime) {
  const pre = btn.closest('.code-block-header')?.nextElementSibling || btn.closest('pre')?.querySelector('code');
  const codeEl = btn.closest('pre')?.querySelector('code');
  if (!codeEl) return;
  const content = codeEl.textContent || codeEl.innerText;
  const filename = `artifact_${Date.now()}.${ext}`;
  downloadFile(filename, content, mime);
  showToast(`Файл ${filename} скачан`, 'success');
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
  msgEl.setAttribute('id', msgId);

  // Thinking block (Manus-style)
  const thinkId = 'think_' + msgId;
  const thinkStartTime = Date.now();
  msgEl.innerHTML = `
    <div class="message-avatar" style="background:linear-gradient(135deg,#818cf8,#a855f7);">
      <svg width="14" height="14" viewBox="0 0 40 40" fill="none"><path d="M12 20L18 14L24 20L30 14" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="message-body">
      <div class="thinking-block" id="${thinkId}">
        <div class="thinking-header" onclick="toggleThinkingBlock('${thinkId}')">
          <div class="thinking-dots"><span></span><span></span><span></span></div>
          <span class="thinking-label">Мышление</span>
          <span class="thinking-count" id="${thinkId}_count">1/1</span>
          <span class="thinking-time" id="${thinkId}_time">0с</span>
          <svg class="thinking-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
        </div>
        <div class="thinking-steps" id="${thinkId}_steps"></div>
      </div>
      <div class="message-content" id="content_${msgId}"></div>
      <div class="message-meta" id="meta_${msgId}"></div>
    </div>
  `;

  messagesEl.appendChild(msgEl);
  // Store reference for inject
  document.getElementById('currentStreamMsg')?.removeAttribute('id');
  msgEl.setAttribute('id', msgId);
  const fakeRef = document.createElement('span');
  fakeRef.id = 'currentStreamMsg';
  fakeRef.style.display = 'none';
  fakeRef.dataset.msgId = msgId;
  messagesEl.appendChild(fakeRef);

  // Start thinking timer
  const timerEl = document.getElementById(thinkId + '_time');
  const startTime = Date.now();
  const timerInterval = setInterval(() => {
    if (!STATE.isGenerating) { clearInterval(timerInterval); return; }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (timerEl) timerEl.textContent = elapsed + 'с';
  }, 1000);
  msgEl._thinkTimer = timerInterval;
  msgEl._thinkId = thinkId;

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
    const costRub = cost > 0 ? (cost * CONFIG.USD_TO_RUB).toFixed(2) : null;
    metaEl.innerHTML = `
      <span>${time}</span>
      ${cost > 0 ? `<span style="color:var(--accent-green);">$${cost.toFixed(6)} (₽${costRub})</span>` : ''}
      ${tokens > 0 ? `<span>${tokens} токенов</span>` : ''}
    `;
  }
  // Update message count in header
  const chat = STATE.chats[STATE.currentChatId];
  if (chat) {
    const msgCountEl = document.getElementById('chatMsgCount');
    if (msgCountEl) {
      const cnt = chat.messages?.length || 0;
      msgCountEl.textContent = cnt + ' ' + (cnt === 1 ? 'сообщение' : cnt >= 2 && cnt <= 4 ? 'сообщения' : 'сообщений');
    }
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
  // Upload pending files to backend
  const filesToUpload = _pendingFiles.filter(f => f !== null);
  _pendingFiles = [];
  const attachedFilesEl = document.getElementById('attachedFile');
  if (attachedFilesEl) { attachedFilesEl.innerHTML = ''; attachedFilesEl.classList.add('hidden'); }
  if (filesToUpload.length > 0) {
    const token = STATE.currentUser?.token || localStorage.getItem('sa_token');
    if (token) {
      try {
        const formData = new FormData();
        filesToUpload.forEach(f => formData.append('file', f));
        const uploadResp = await fetch(`${CONFIG.BACKEND_URL}/api/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });
        if (uploadResp.ok) {
          const uploadData = await uploadResp.json();
          if (uploadData.content) {
            chat.pendingFile = uploadData.content;
          }
        }
      } catch(e) { console.error('File upload error:', e); }
    }
  }
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
  addThinkingStep(streamMsgId, '🤔', 'Анализирую запрос...');

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
      addThinkingStep(streamMsgId, '⚡', 'Генерирую ответ...');

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

    if (!response.ok) {
      // Handle spending limit exceeded (402)
      if (response.status === 402) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData.message || 'Лимит трат исчерпан. Обратитесь к администратору.';
        finalizeThinkingBlock(msgId);
        finalizeStreamingMessage(msgId, `⚠️ **${msg}**`, 0, 0);
        showToast(msg, 'error');
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

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
              const mode = parsed.intent_mode || '';
              const modelName = parsed.model || '';
              if (mode) {
                addTaskStep('🔍', `Режим: ${mode} • ${modelName}`);
                addThinkingStep(streamMsgId, '🔍', `Режим: ${mode} • ${modelName}`);
              }
            } else if (type === 'agent_mode') {
              const txt = parsed.text || 'Агент работает...';
              addTaskStep('🤖', txt);
              addThinkingStep(streamMsgId, '🤖', txt);
            } else if (type === 'content') {
              fullText += parsed.text || '';
              updateStreamingMessage(streamMsgId, fullText);
            } else if (type === 'tool_call') {
              const tool = parsed.tool || '';
              addTaskStep('🔧', `Инструмент: ${tool}`);
              addThinkingStep(streamMsgId, '🔧', `Инструмент: ${tool}`);
            } else if (type === 'tool_result') {
              const out = (parsed.output || '').substring(0, 80);
              addTaskStep('✅', `Результат: ${out}`);
              addThinkingStep(streamMsgId, '✅', `Результат: ${out}`);
            } else if (type === 'file') {
              addTaskStep('📄', `Файл: ${parsed.filename || ''}`);
              addThinkingStep(streamMsgId, '📄', `Файл: ${parsed.filename || ''}`);
              if (parsed.url) {
                fullText += `\n\n[📎 ${parsed.filename}](${backendUrl}${parsed.url})`;
                updateStreamingMessage(streamMsgId, fullText);
              }
            } else if (type === 'error') {
              const errMsg = parsed.message || 'Ошибка';
              addTaskStep('❌', errMsg);
              addThinkingStep(streamMsgId, '❌', errMsg);
            } else if (type === 'done') {
              inputTokens = parsed.tokens_in || 0;
              outputTokens = parsed.tokens_out || 0;
            } else if (type === 'step') {
              addTaskStep('📈', parsed.text || '');
              addThinkingStep(streamMsgId, '📈', parsed.text || '');
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
  const cost = (inputTokens * (modelConfig.inputCost || 0)) + (outputTokens * (modelConfig.outputCost || 0));  // cost in USD
  const totalTokens = inputTokens + outputTokens;

  // Finalize thinking block
  finalizeThinkingBlock(streamMsgId);

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
function addThinkingStep(msgId, icon, text) {
  const thinkId = 'think_' + msgId;
  const stepsEl = document.getElementById(thinkId + '_steps');
  const countEl = document.getElementById(thinkId + '_count');
  if (!stepsEl) return;

  const step = document.createElement('div');
  step.className = 'thinking-step';
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  step.innerHTML = `
    <span class="thinking-step-icon">${icon}</span>
    <span class="thinking-step-text">${escapeHtml(text)}</span>
    <span class="thinking-step-time">${time}</span>
  `;
  stepsEl.appendChild(step);
  stepsEl.scrollTop = stepsEl.scrollHeight;

  // Update count
  const count = stepsEl.querySelectorAll('.thinking-step').length;
  if (countEl) countEl.textContent = count + '/' + count;
}

function toggleThinkingBlock(thinkId) {
  const block = document.getElementById(thinkId);
  if (block) block.classList.toggle('collapsed');
}

function finalizeThinkingBlock(msgId) {
  const thinkId = 'think_' + msgId;
  const block = document.getElementById(thinkId);
  const msgEl = document.getElementById(msgId);
  if (msgEl?._thinkTimer) clearInterval(msgEl._thinkTimer);
  if (block) {
    block.classList.add('done');
    // Auto-collapse after 1s
    setTimeout(() => block.classList.add('collapsed'), 1000);
  }
}

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

  const footerHint = document.getElementById('inputFooterHint');
  const chatInput = document.getElementById('chatInput');
  if (show) {
    if (progress) progress.classList.remove('hidden');
    if (statusBadge) statusBadge.classList.remove('hidden');
    if (sendBtn) { sendBtn.style.display = 'flex'; sendBtn.title = 'Перебить агента (Enter)'; }
    if (stopBtn) { stopBtn.style.display = 'flex'; }
    if (footerHint) { footerHint.textContent = '⚡ Агент работает — напиши задачу и нажми Enter чтобы перебить · ■ — остановить'; footerHint.className = 'input-footer-inject'; }
    if (chatInput) { chatInput.placeholder = 'Перебить агента: напиши задачу и нажми Enter...'; }
    animateProgress();
  } else {
    if (progress) progress.classList.add('hidden');
    if (statusBadge) statusBadge.classList.add('hidden');
    if (sendBtn) { sendBtn.style.display = 'flex'; sendBtn.title = 'Отправить (Enter)'; }
    if (stopBtn) { stopBtn.style.display = 'none'; }
    if (footerHint) { footerHint.textContent = 'Enter — отправить · Shift+Enter — новая строка · Ctrl+/ — поиск'; footerHint.className = ''; }
    if (chatInput) { chatInput.placeholder = 'Напишите задачу или вопрос...'; }
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
  const wrap = document.querySelector('.model-sel-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('modelMenu').classList.add('hidden');
    document.getElementById('modelSelBtn').setAttribute('aria-expanded', 'false');
  }
}

function selectModel(modelId, modelName, dotColor) {
  STATE.selectedModel = modelId;
  const model = CONFIG.MODELS[modelId];
  // Update button label with chevron
  const labelEl = document.getElementById('modelSelLabel');
  if (labelEl) labelEl.textContent = model?.name || modelName;
  const dotEl = document.getElementById('modelDot');
  if (dotEl) dotEl.className = `model-dropdown-dot ${dotColor}`;
  document.getElementById('modelMenu')?.classList.add('hidden');
  document.getElementById('modelSelBtn')?.setAttribute('aria-expanded', 'false');

  // Update active state in dropdown
  document.querySelectorAll('.model-dropdown-item').forEach(el => el.classList.remove('active'));
  // Mark the clicked item active
  const items = document.querySelectorAll('.model-dropdown-item');
  items.forEach(el => { if (el.dataset.modelId === modelId) el.classList.add('active'); });

  // Save to settings
  STATE.settings.defaultModel = modelId;
  saveSettings();

  showToast(`Модель: ${model?.name || modelName}`, 'info');
}

function renderModelDropdown() {
  const menu = document.getElementById('modelMenu');
  if (!menu) return;
  menu.innerHTML = Object.entries(CONFIG.MODELS).map(([id, m]) => {
    const dotColors = { original: 'red', premium: 'green', budget: 'blue' };
    const dot = dotColors[id] || 'gray';
    // Estimate cost per 1000 tokens in RUB
    const costPer1k = ((m.inputCost + m.outputCost) / 2 * 1000 * CONFIG.USD_TO_RUB).toFixed(2);
    return `
      <div class="model-dropdown-item ${STATE.selectedModel === id ? 'active' : ''}" 
           data-model-id="${id}"
           onclick="selectModel('${id}', '${m.name}', '${dot}')">
        <span class="model-dropdown-dot ${dot}"></span>
        <div class="model-dropdown-info">
          <div class="model-dropdown-name">${m.name}</div>
          <div class="model-dropdown-desc">${m.desc}</div>
        </div>
        <div class="model-dropdown-price">₽${costPer1k}/1K</div>
      </div>
    `;
  }).join('');
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
    if (STATE.isGenerating) {
      injectMessage();
    } else {
      sendMessage();
    }
  }
}

// Inject a new message while agent is running
function injectMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  autoResizeInput(input);

  // Save partial response if any
  const streamEl = document.getElementById('currentStreamMsg');
  const chat = STATE.chats[STATE.currentChatId];
  if (streamEl && chat) {
    const partialContent = streamEl.querySelector('[id^="content_"]')?.innerText || '';
    if (partialContent) {
      chat.messages.push({ role: 'assistant', content: '[Прервано] ' + partialContent, cost: 0, tokens: 0 });
    }
  }

  // Abort current generation
  if (STATE.currentAbortController) STATE.currentAbortController.abort();
  STATE.isGenerating = false;
  STATE.isPaused = false;
  showGenerationUI(false);

  // Add inject marker
  addTaskStep('⚡', 'Пользователь перебил: ' + text.substring(0, 60));
  showToast('Запрос перехвачен', 'info');

  // Add user message and restart
  if (chat) {
    chat.messages.push({ role: 'user', content: text });
    renderMessage('user', text);
    saveChats();
    if (chat.messages.length === 1) {
      chat.title = text.length > 40 ? text.substring(0, 40) + '...' : text;
      document.getElementById('chatTitle').textContent = chat.title;
      renderChatList();
    }
  }

  // Restart generation
  STATE.isGenerating = true;
  STATE.taskCost = 0;
  STATE.taskStepCount = 0;
  STATE.taskSteps = [];
  showGenerationUI(true);
  addAuditEntry('chat', 'Прервано и перезапущено: ' + text.substring(0, 60));

  callAPI(text, chat).then(() => {
    STATE.isGenerating = false;
    STATE.isPaused = false;
    showGenerationUI(false);
    saveChats();
    renderChatList();
  }).catch(e => {
    if (e.name !== 'AbortError') showToast('Ошибка: ' + (e.message || ''), 'error');
    STATE.isGenerating = false;
    showGenerationUI(false);
  });
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
  _pendingFiles.push(file);
  const attachedFiles = document.getElementById('attachedFile');
  attachedFiles.classList.remove('hidden');
  const fileIdx = _pendingFiles.length - 1;
  const chip = document.createElement('div');
  chip.className = 'attached-file-chip';
  chip.dataset.fileIdx = fileIdx;
  chip.innerHTML = `
    <span>${getFileIcon(file.name)} ${file.name}</span>
    <span style="color:var(--text-tertiary);font-size:11px;">${formatFileSize(file.size)}</span>
    <button onclick="removeFileChip(this, ${fileIdx})">×</button>
  `;
  attachedFiles.appendChild(chip);
}
function removeFileChip(btn, idx) {
  _pendingFiles[idx] = null;  // mark as removed
  btn.parentElement.remove();
  checkAttachedFiles();
}
function checkAttachedFiles() {
  const attachedFiles = document.getElementById('attachedFile');
  if (attachedFiles.children.length === 0) {
    attachedFiles.classList.add('hidden');
    _pendingFiles = [];
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
  const clearTokEl = document.getElementById('totalTokensVal');
  if (clearTokEl) clearTokEl.textContent = '0';
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
async function downloadChat() {
  const chat = STATE.chats[STATE.currentChatId];
  if (!chat) return;
  const token = STATE.currentUser?.token || localStorage.getItem('sa_token');
  // Try backend export (ZIP with all files)
  if (chat.backendId && token) {
    try {
      const resp = await fetch(`${CONFIG.BACKEND_URL}/api/chats/${chat.backendId}/export`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat_${chat.title.replace(/[^a-zA-Z0-9Ѐ-ӿ]/g, '_').substring(0, 30)}.zip`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast('Чат скачан', 'success');
        return;
      }
    } catch(e) {}
  }
  // Fallback: download as text
  const text = `# ${chat.title}\n\n` + chat.messages.map(m => `## ${m.role === 'user' ? 'Вы' : 'Агент'}\n${m.content}`).join('\n\n---\n\n');
  downloadFile(`chat_${chat.title.substring(0, 30)}.md`, text, 'text/markdown');
  showToast('Чат скачан как Markdown', 'success');
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
  switchSettingsPanel('general', document.querySelector('#settingsModal .modal-nav-item'));
}

function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
}

// Alias used by index.html
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function closeModalOutside(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}

function closeSettingsOnOverlay(e) {
  if (e.target === document.getElementById('settingsModal')) closeSettings();
}

// Alias for old name
function switchSettingsTab(tab, btn) { switchSettingsPanel(tab, btn); }

function switchSettingsPanel(panel, btn) {
  // Update active nav item
  document.querySelectorAll('#settingsModal .modal-nav-item').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else {
    const target = document.querySelector(`#settingsModal .modal-nav-item[data-panel="${panel}"]`);
    if (target) target.classList.add('active');
  }
  // Update title
  const titles = { general: 'Настройки', account: 'Аккаунт', models: 'Модели', personalization: 'Персонализация', api: 'API ключи', security: 'Безопасность', usage: 'Использование' };
  const titleEl = document.getElementById('settingsPanelTitle');
  if (titleEl) titleEl.textContent = titles[panel] || 'Настройки';
  // Render panel content
  const body = document.getElementById('settingsPanelBody');
  if (body) body.innerHTML = renderSettingsPanel(panel);
}

function renderSettingsPanel(panel) {
  const s = STATE.settings;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (panel === 'general') {
    return `
      <div class="settings-section">
        <div class="settings-section-title">Внешний вид</div>
        <div class="settings-row">
          <span class="settings-label">Тема</span>
          <div class="theme-options">
            <button class="appearance-option ${s.theme==='dark'?'active':''}" onclick="setTheme('dark',this)">🌙 Тёмная</button>
            <button class="appearance-option ${s.theme==='light'?'active':''}" onclick="setTheme('light',this)">☀️ Светлая</button>
            <button class="appearance-option ${s.theme==='system'?'active':''}" onclick="setTheme('system',this)">💻 Система</button>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">Размер шрифта</span>
          <input type="range" min="12" max="18" value="${s.fontSize||14}" oninput="setFontSize(this.value)" style="width:120px">
          <span style="font-size:12px;color:var(--text3);margin-left:8px">${s.fontSize||14}px</span>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Поведение</div>
        <div class="settings-row">
          <span class="settings-label">Автопрокрутка</span>
          <button class="toggle-btn ${s.autoScroll!==false?'active':''}" onclick="toggleSetting('autoScroll',this)"><span class="toggle-thumb"></span></button>
        </div>
        <div class="settings-row">
          <span class="settings-label">Звуковые уведомления</span>
          <button class="toggle-btn ${s.soundNotifications?'active':''}" onclick="toggleSetting('soundNotifications',this)"><span class="toggle-thumb"></span></button>
        </div>
        <div class="settings-row">
          <span class="settings-label">Сохранять историю</span>
          <button class="toggle-btn ${s.saveHistory!==false?'active':''}" onclick="toggleSetting('saveHistory',this)"><span class="toggle-thumb"></span></button>
        </div>
      </div>`;
  }
  if (panel === 'account') {
    const u = STATE.currentUser || {};
    return `
      <div class="settings-section">
        <div class="settings-section-title">Профиль</div>
        <div class="settings-row"><span class="settings-label">Имя</span><span style="color:var(--text1)">${u.name || '—'}</span></div>
        <div class="settings-row"><span class="settings-label">Email</span><span style="color:var(--text1)">${u.email || '—'}</span></div>
        <div class="settings-row"><span class="settings-label">Роль</span><span style="color:var(--text1)">${u.role || 'user'}</span></div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Баланс</div>
        <div class="settings-row"><span class="settings-label">Потрачено</span><span id="balanceSpent" style="color:var(--accent-green)">загрузка...</span></div>
        <div class="settings-row"><span class="settings-label">Лимит</span><span id="balanceLimit" style="color:var(--text2)">загрузка...</span></div>
        <div class="settings-row"><span class="settings-label">Остаток</span><span id="balanceLeft" style="color:var(--accent-blue)">загрузка...</span></div>
      </div>`;
  }
  if (panel === 'models') {
    return Object.entries(CONFIG.MODELS).map(([id, m]) => {
      const costPer1k = (((m.inputCost||0) + (m.outputCost||0)) / 2 * 1000 * CONFIG.USD_TO_RUB).toFixed(2);
      return `
      <div class="settings-card" onclick="selectModel('${id}','${m.name}','')" style="cursor:pointer;padding:12px;border:1px solid ${STATE.selectedModel===id?'var(--accent)':'var(--border)'};border-radius:8px;margin-bottom:8px;background:${STATE.selectedModel===id?'var(--bg-active)':'transparent'}">
        <div style="font-weight:600;color:var(--text)">${m.name}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">${m.desc}</div>
        <div style="font-size:11px;color:var(--accent-green);margin-top:4px">≈₽${costPer1k}/1K токенов</div>
      </div>`;
    }).join('');
  }
  if (panel === 'personalization') {
    return `
      <div class="settings-section">
        <div class="settings-section-title">Персонализация</div>
        <div class="form-group">
          <label class="form-label">Ваше имя</label>
          <input type="text" class="form-input" id="profileName" value="${s.profileName||''}" placeholder="Как вас называть?">
        </div>
        <div class="form-group">
          <label class="form-label">Контекст для агента</label>
          <textarea class="form-input" id="agentContext" rows="4" placeholder="Расскажите агенту о вашей работе, предпочтениях...">${s.agentContext||''}</textarea>
        </div>
        <button class="btn-primary" onclick="savePersonalization()">Сохранить</button>
      </div>`;
  }
  if (panel === 'api') {
    return `
      <div class="settings-section">
        <div class="settings-section-title">API ключи</div>
        <div class="form-group">
          <label class="form-label">OpenRouter API Key</label>
          <input type="password" class="form-input" id="openrouterKey" value="${s.openrouterKey||''}" placeholder="sk-or-...">
          <button class="btn-secondary" style="margin-top:8px" onclick="saveApiKey()">Сохранить</button>
        </div>
        <div class="form-group">
          <label class="form-label">Backend URL</label>
          <input type="text" class="form-input" id="backendUrl" value="${CONFIG.BACKEND_URL||''}" placeholder="https://minimax.mksitdev.ru">
          <button class="btn-secondary" style="margin-top:8px" onclick="saveBackendUrl()">Сохранить</button>
        </div>
      </div>`;
  }
  if (panel === 'security') {
    return `
      <div class="settings-section">
        <div class="settings-section-title">Безопасность</div>
        <div class="settings-row">
          <span class="settings-label">Двухфакторная аутентификация</span>
          <button class="toggle-btn ${s.twoFactor?'active':''}" onclick="toggleSetting('twoFactor',this)"><span class="toggle-thumb"></span></button>
        </div>
        <div class="settings-row" style="margin-top:16px">
          <span class="settings-label" style="color:var(--accent-red)">Удалить все данные</span>
          <button class="btn-danger" onclick="clearAllData()">Удалить</button>
        </div>
      </div>`;
  }
  if (panel === 'usage') {
    const totalCost = STATE.analytics.reduce((s,a) => s+(a.cost||0), 0);
    const totalTokens = STATE.analytics.reduce((s,a) => s+(a.inputTokens||0)+(a.outputTokens||0), 0);
    const totalRub = (totalCost * 105).toFixed(2);
    return `
      <div class="settings-section">
        <div class="settings-section-title">Статистика использования</div>
        <div class="settings-row"><span class="settings-label">Всего запросов</span><span style="color:var(--text1)">${STATE.analytics.length}</span></div>
        <div class="settings-row"><span class="settings-label">Всего токенов</span><span style="color:var(--text1)">${totalTokens.toLocaleString()}</span></div>
        <div class="settings-row"><span class="settings-label">Потрачено</span><span style="color:var(--accent-green)">$${totalCost.toFixed(4)} (₽${totalRub})</span></div>
        <div class="settings-row" style="margin-top:16px">
          <button class="btn-secondary" onclick="exportAnalytics()">Экспорт CSV</button>
        </div>
      </div>`;
  }
  return '<div style="padding:24px;color:var(--text3)">Раздел в разработке</div>';
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

async function updateUsageStats() {
  const totalCost = STATE.analytics.reduce((sum, a) => sum + (a.cost || 0), 0);
  const totalTokens = STATE.analytics.reduce((sum, a) => sum + (a.inputTokens || 0) + (a.outputTokens || 0), 0);
  const container = document.getElementById('usageStats');
  if (!container) return;
  // Fetch real-time balance from backend
  let balanceHtml = '';
  try {
    const token = STATE.currentUser?.token || localStorage.getItem('sa_token');
    const meResp = await fetch(`${CONFIG.BACKEND_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (meResp.ok) {
      const me = await meResp.json();
      const spentRub = me.total_spent_rub || (me.total_spent * 105).toFixed(2);
      const limitRub = me.monthly_limit_rub;
      const remaining = me.balance_remaining;
      const pct = me.limit_used_percent || 0;
      const barColor = pct > 80 ? '#ef4444' : pct > 60 ? 'var(--accent-orange)' : 'var(--accent-green)';
      if (limitRub) {
        balanceHtml = `
          <div class="stat-card" style="grid-column:1/-1;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <span style="font-size:12px;color:var(--text2);">Баланс (реальное время)</span>
              <span style="font-size:11px;color:var(--text3);">${pct}% использовано</span>
            </div>
            <div style="height:6px;background:var(--bg4);border-radius:3px;margin-bottom:8px;">
              <div style="height:100%;width:${Math.min(pct,100)}%;background:${barColor};border-radius:3px;transition:width 0.5s;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="font-size:13px;color:var(--text2);">Потрачено: <b style="color:${barColor};">₽${spentRub}</b></span>
              <span style="font-size:13px;color:var(--text2);">Остаток: <b style="color:var(--accent-green);">₽${remaining}</b></span>
              <span style="font-size:13px;color:var(--text2);">Лимит: <b>₽${limitRub}</b></span>
            </div>
          </div>
        `;
      } else {
        balanceHtml = `<div class="stat-card"><div class="stat-value" style="color:var(--accent-green);">₽${spentRub}</div><div class="stat-label">Потрачено (реальное время)</div></div>`;
      }
    }
  } catch(e) { /* ignore */ }
  container.innerHTML = `
    ${balanceHtml}
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
async function renderAdminPanel() {
  if (STATE.currentUser?.role !== 'admin') return;

  const token = STATE.currentUser?.token || localStorage.getItem('sa_token');

  // Load stats from backend
  try {
    const resp = await fetch(`${CONFIG.BACKEND_URL}/api/admin/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const users = data.users || [];

    // Stats cards
    const stats = document.getElementById('adminStats');
    if (stats) {
      const totalSpent = users.reduce((s, u) => s + (u.total_spent || 0), 0);
      const activeUsers = users.filter(u => u.is_active).length;
      stats.innerHTML = `
        <div class="stat-card"><div class="stat-value" style="color:var(--accent-green);">$${totalSpent.toFixed(4)}</div><div class="stat-label">Общие расходы</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--accent-green);"><b>₽${(totalSpent * CONFIG.USD_TO_RUB).toFixed(2)}</b></div><div class="stat-label">Рублей потрачено</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--accent-blue);">${users.length}</div><div class="stat-label">Пользователей</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--accent-green);">${activeUsers}</div><div class="stat-label">Активных</div></div>
      `;
    }

    // Users table
    const usersTable = document.getElementById('adminUsersTable');
    if (usersTable) {
      usersTable.innerHTML = users.map(u => {
        const spentRub = (u.total_spent * CONFIG.USD_TO_RUB).toFixed(2);
        const limitRub = u.monthly_limit ? (u.monthly_limit * CONFIG.USD_TO_RUB).toFixed(0) : '∞';
        const limitPct = u.monthly_limit ? Math.min(100, (u.total_spent / u.monthly_limit * 100)).toFixed(0) : 0;
        return `
          <tr class="${!u.is_active ? 'user-disabled' : ''}">
            <td>
              <div style="font-weight:500;">${escapeHtml(u.name || u.email)}</div>
              <div style="font-size:11px;color:var(--text3);">${escapeHtml(u.email)}</div>
            </td>
            <td><span class="role-badge ${u.role}">${u.role === 'admin' ? 'Админ' : 'Пользователь'}</span></td>
            <td>
              <div style="color:var(--accent-green);">₽${spentRub}</div>
              <div style="font-size:11px;color:var(--text3);">$${u.total_spent.toFixed(4)}</div>
            </td>
            <td>
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="flex:1;height:4px;background:var(--bg4);border-radius:2px;min-width:60px;">
                  <div style="height:100%;width:${limitPct}%;background:${limitPct > 80 ? 'var(--accent-red,#ef4444)' : 'var(--accent)'};border-radius:2px;"></div>
                </div>
                <span style="font-size:11px;color:var(--text3);white-space:nowrap;">₽${limitRub}</span>
              </div>
            </td>
            <td>
              <span class="status-badge ${u.is_active ? 'active' : 'disabled'}">${u.is_active ? 'Активен' : 'Заблокирован'}</span>
            </td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="admin-btn" onclick="adminEditUser('${u.id}', '${escapeHtml(u.name)}', '${escapeHtml(u.email)}', ${u.monthly_limit || 0})">Изменить</button>
                <button class="admin-btn" onclick="adminToggleUser('${u.id}', ${u.is_active})" style="${u.is_active ? 'color:var(--accent-red,#ef4444);' : 'color:var(--accent-green);'}">${u.is_active ? 'Блок' : 'Разблок'}</button>
                <button class="admin-btn" onclick="adminChangePassword('${u.id}')">Пароль</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch(e) {
    console.error('Admin panel error:', e);
  }
}

async function adminCreateUser() {
  const email = prompt('Емайл нового пользователя:');
  if (!email) return;
  const password = prompt('Пароль:');
  if (!password) return;
  const name = prompt('Имя (необязательно):', email.split('@')[0]) || email.split('@')[0];
  const limitStr = prompt('Лимит трат в долларах (0 = без лимита):', '10');
  const monthly_limit = parseFloat(limitStr) || 10;
  const token = STATE.currentUser?.token || localStorage.getItem('sa_token');
  try {
    const resp = await fetch(`${CONFIG.BACKEND_URL}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ email, password, name, monthly_limit })
    });
    const data = await resp.json();
    if (resp.ok) {
      showToast('Пользователь создан', 'success');
      renderAdminPanel();
    } else {
      showToast('Ошибка: ' + (data.error || ''), 'error');
    }
  } catch(e) { showToast('Ошибка сети', 'error'); }
}

async function adminEditUser(userId, name, email, currentLimit) {
  const newName = prompt('Имя:', name);
  if (newName === null) return;
  const limitStr = prompt('Лимит трат ($, 0 = без лимита):', currentLimit);
  if (limitStr === null) return;
  const monthly_limit = parseFloat(limitStr) || 0;
  const token = STATE.currentUser?.token || localStorage.getItem('sa_token');
  try {
    const resp = await fetch(`${CONFIG.BACKEND_URL}/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: newName, monthly_limit })
    });
    if (resp.ok) {
      showToast('Пользователь обновлён', 'success');
      renderAdminPanel();
    }
  } catch(e) { showToast('Ошибка сети', 'error'); }
}

async function adminToggleUser(userId, isActive) {
  const token = STATE.currentUser?.token || localStorage.getItem('sa_token');
  try {
    const resp = await fetch(`${CONFIG.BACKEND_URL}/api/admin/users/${userId}/toggle`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (resp.ok) {
      showToast(isActive ? 'Пользователь заблокирован' : 'Пользователь разблокирован', 'success');
      renderAdminPanel();
    }
  } catch(e) { showToast('Ошибка сети', 'error'); }
}

async function adminChangePassword(userId) {
  const newPass = prompt('Новый пароль:');
  if (!newPass || newPass.length < 4) { showToast('Пароль должен быть не менее 4 символов', 'warning'); return; }
  const token = STATE.currentUser?.token || localStorage.getItem('sa_token');
  try {
    const resp = await fetch(`${CONFIG.BACKEND_URL}/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ password: newPass })
    });
    if (resp.ok) showToast('Пароль изменён', 'success');
  } catch(e) { showToast('Ошибка сети', 'error'); }
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

// ── Function Aliases (HTML onclick compatibility) ──────────────
function toggleModelMenu() { toggleModelDropdown(); }
function stopGeneration() { cancelTask(); }
function addScheduledTask() { saveScheduledTask(); }
function openCmdPalette() { openCommandPalette(); }
function closeCmdPalette(e) { closeCommandPalette(e); }
function removeAttachment() {
  const attachedFile = document.getElementById('attachedFile');
  if (attachedFile) { attachedFile.innerHTML = ''; attachedFile.classList.add('hidden'); }
  _pendingFiles = [];
}
function switchACPane(pane, btn) {
  document.querySelectorAll('.ac-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ac-tab').forEach(b => b.classList.remove('active'));
  const paneEl = document.getElementById('ac-' + pane);
  if (paneEl) paneEl.classList.add('active');
  if (btn) btn.classList.add('active');
}
function toggleACFullscreen() {
  const panel = document.getElementById('agentComputer');
  if (panel) panel.classList.toggle('ac-fullscreen');
}
function renameChat(chatId) {
  renameChatInline(chatId, { stopPropagation: () => {} });
}
function showChatContextMenu(chatId, event) {
  event.stopPropagation();
  document.getElementById('chatCtxMenu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'chatCtxMenu';
  menu.className = 'chat-ctx-menu';
  menu.innerHTML = `
    <button onclick="renameChatInline('${chatId}',{stopPropagation:()=>{}}); document.getElementById('chatCtxMenu')?.remove()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Переименовать
    </button>
    <button class="danger" onclick="deleteChat('${chatId}'); document.getElementById('chatCtxMenu')?.remove()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      Удалить
    </button>
  `;
  const rect = event.target.getBoundingClientRect();
  menu.style.cssText = `position:fixed;top:${rect.bottom+4}px;left:${Math.min(rect.left,window.innerWidth-180)}px;z-index:9999;`;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 10);
}
