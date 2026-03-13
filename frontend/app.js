/**
 * Super Agent v6.0 — Frontend Application
 * LangGraph StateGraph + Self-Healing 2.0 + Vector Memory + File Versioning + Universal File Reader
 */

// ═══ State ═══════════════════════════════════════════════════
const state = {
    token: localStorage.getItem('sa_token') || '',
    user: JSON.parse(localStorage.getItem('sa_user') || 'null'),
    currentChat: null,
    chats: [],
    settings: {
        variant: 'premium',
        chat_model: 'qwen3',
        enhanced_mode: false,
        design_pro: false
    },
    isStreaming: false,
    abortController: null,
    previewVisible: false,
    sidebarOpen: true,
    currentTab: 'chat'
};

const API = '/api';

// ═══ API Helper ══════════════════════════════════════════════
async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

    const resp = await fetch(`${API}${path}`, { ...options, headers: { ...headers, ...options.headers } });

    if (resp.status === 401) {
        state.token = '';
        localStorage.removeItem('sa_token');
        showLogin();
        throw new Error('Unauthorized');
    }

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Request failed');
    }

    return resp.json();
}

// ═══ Agent Actions Helper ═════════════════════════════════════════
function addAgentAction(assistantId, html) {
    let actionsEl = document.getElementById(`${assistantId}-actions`);
    if (!actionsEl) {
        const contentEl = document.getElementById(`${assistantId}-content`);
        if (contentEl) {
            contentEl.insertAdjacentHTML('beforebegin', `<div id="${assistantId}-actions" class="agent-actions-log"></div>`);
            actionsEl = document.getElementById(`${assistantId}-actions`);
        }
    }
    if (actionsEl) {
        actionsEl.insertAdjacentHTML('beforeend', html);
        const container = document.getElementById('chatMessages');
        if (container) container.scrollTop = container.scrollHeight;
    }
}

function getToolIcon(tool) {
    const icons = {
        'ssh_execute': '💻',
        'file_write': '📁',
        'file_read': '📄',
        'browser_navigate': '🌐',
        'browser_check_site': '🔍',
        'browser_get_text': '📝',
        'browser_check_api': '🔌',
        'task_complete': '🎉'
    };
    return icons[tool] || '🔧';
}

function getToolLabel(tool) {
    const labels = {
        'ssh_execute': 'SSH Команда',
        'file_write': 'Создание файла',
        'file_read': 'Чтение файла',
        'browser_navigate': 'Открытие страницы',
        'browser_check_site': 'Проверка сайта',
        'browser_get_text': 'Получение текста',
        'browser_check_api': 'API Запрос',
        'task_complete': 'Завершение'
    };
    return labels[tool] || tool;
}

function formatToolArgs(tool, args) {
    if (!args) return '';
    if (tool === 'ssh_execute') {
        return `<code>${escapeHtml(args.command || '')}</code>`;
    }
    if (tool === 'file_write') {
        return `<code>${escapeHtml(args.path || '')}</code>`;
    }
    if (tool === 'file_read') {
        return `<code>${escapeHtml(args.path || '')}</code>`;
    }
    if (tool.startsWith('browser_')) {
        return `<code>${escapeHtml(args.url || '')}</code>`;
    }
    return '';
}

// ═══ SSH Settings ═════════════════════════════════════════════
async function testSSHConnection() {
    const host = document.getElementById('sshHost').value.trim();
    const username = document.getElementById('sshUser').value.trim() || 'root';
    const password = document.getElementById('sshPassword').value;
    const port = parseInt(document.getElementById('sshPort').value) || 22;
    const resultEl = document.getElementById('sshTestResult');

    if (!host || !password) {
        resultEl.style.display = 'block';
        resultEl.className = 'ssh-test-result error';
        resultEl.textContent = '❗ Укажите хост и пароль';
        return;
    }

    resultEl.style.display = 'block';
    resultEl.className = 'ssh-test-result loading';
    resultEl.textContent = '🔄 Подключение...';

    try {
        const data = await api('/ssh/test', {
            method: 'POST',
            body: JSON.stringify({ host, username, password, port })
        });

        if (data.success) {
            resultEl.className = 'ssh-test-result success';
            resultEl.textContent = `✅ Подключено! ${data.server_info || ''}`;
        } else {
            resultEl.className = 'ssh-test-result error';
            resultEl.textContent = `❌ ${data.error || 'Ошибка подключения'}`;
        }
    } catch (e) {
        resultEl.className = 'ssh-test-result error';
        resultEl.textContent = `❌ ${e.message}`;
    }
}

async function saveSSHSettings() {
    const host = document.getElementById('sshHost').value.trim();
    const username = document.getElementById('sshUser').value.trim() || 'root';
    const password = document.getElementById('sshPassword').value;

    state.settings.ssh_host = host;
    state.settings.ssh_user = username;
    state.settings.ssh_password = password;

    try {
        await api('/settings', {
            method: 'PUT',
            body: JSON.stringify(state.settings)
        });
        toast('✅ SSH настройки сохранены', 'success');
    } catch (e) {
        toast('Ошибка: ' + e.message, 'error');
    }
}

function loadSSHSettings() {
    const hostEl = document.getElementById('sshHost');
    const userEl = document.getElementById('sshUser');
    const passEl = document.getElementById('sshPassword');
    if (hostEl && state.settings.ssh_host) hostEl.value = state.settings.ssh_host;
    if (userEl && state.settings.ssh_user) userEl.value = state.settings.ssh_user;
    if (passEl && state.settings.ssh_password) passEl.value = state.settings.ssh_password;
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sa_theme', theme);
    updateThemeButton();
    // Update theme cards
    document.getElementById('themeDarkCard')?.classList.toggle('selected', theme === 'dark');
    document.getElementById('themeLightCard')?.classList.toggle('selected', theme === 'light');
}

// ═══ Init ════════════════════════════════════════════════════════
async function doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    const btnText = btn.querySelector('.login-btn-text');
    const btnLoader = btn.querySelector('.login-btn-loader');

    errorEl.style.display = 'none';

    if (!email || !password) {
        errorEl.textContent = 'Введите email и пароль';
        errorEl.style.display = 'block';
        // Shake animation
        errorEl.style.animation = 'none';
        errorEl.offsetHeight;
        errorEl.style.animation = 'fadeInUp 0.3s ease';
        return;
    }

    // Show loading state
    btn.disabled = true;
    if (btnText) btnText.textContent = 'Вход...';
    if (btnLoader) btnLoader.classList.remove('hidden');

    try {
        const data = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        state.token = data.token;
        state.user = data.user;
        state.settings = data.user.settings || state.settings;
        localStorage.setItem('sa_token', data.token);
        localStorage.setItem('sa_user', JSON.stringify(data.user));

        showApp();
        loadChats();
        toast('Добро пожаловать, ' + (data.user.name || 'User') + '!', 'success');
    } catch (e) {
        errorEl.textContent = e.message || 'Неверный email или пароль';
        errorEl.style.display = 'block';
        errorEl.style.animation = 'none';
        errorEl.offsetHeight;
        errorEl.style.animation = 'fadeInUp 0.3s ease';
        // Clear invalid token
        localStorage.removeItem('sa_token');
        localStorage.removeItem('sa_user');
    } finally {
        btn.disabled = false;
        if (btnText) btnText.textContent = 'Войти в систему';
        if (btnLoader) btnLoader.classList.add('hidden');
    }
}

function togglePassword() {
    const inp = document.getElementById('loginPassword');
    const icon = document.getElementById('eyeIcon');
    if (inp.type === 'password') {
        inp.type = 'text';
        icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
    } else {
        inp.type = 'password';
        icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    }
}

// Particle canvas for login background
function initLoginCanvas() {
    const canvas = document.getElementById('loginCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;
    const particles = [];
    const count = 60;
    
    for (let i = 0; i < count; i++) {
        particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: Math.random() * 2 + 0.5,
            dx: (Math.random() - 0.5) * 0.5,
            dy: (Math.random() - 0.5) * 0.5,
            opacity: Math.random() * 0.5 + 0.2
        });
    }
    
    function draw() {
        ctx.clearRect(0, 0, w, h);
        particles.forEach((p, i) => {
            p.x += p.dx;
            p.y += p.dy;
            if (p.x < 0) p.x = w;
            if (p.x > w) p.x = 0;
            if (p.y < 0) p.y = h;
            if (p.y > h) p.y = 0;
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(129, 140, 248, ${p.opacity})`;
            ctx.fill();
            
            // Draw connections
            for (let j = i + 1; j < particles.length; j++) {
                const p2 = particles[j];
                const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = `rgba(99, 102, 241, ${0.1 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        });
        requestAnimationFrame(draw);
    }
    draw();
    
    window.addEventListener('resize', () => {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    });
}
function doLogout() {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.token = '';
    state.user = null;
    localStorage.removeItem('sa_token');
    localStorage.removeItem('sa_user');
    showLogin();
}

function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
}

function showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    updateUI();
    // Load SSH settings into form
    setTimeout(loadSSHSettings, 100);
}

// ═══ Chat Management ════════════════════════════════════════
async function loadChats() {
    try {
        const data = await api('/chats');
        state.chats = data.chats || [];
        renderChatList();
    } catch (e) {
        console.error('Failed to load chats:', e);
    }
}

function renderChatList() {
    const list = document.getElementById('chatList');
    const search = document.getElementById('chatSearch').value.toLowerCase();

    const filtered = state.chats.filter(c =>
        !search || c.title.toLowerCase().includes(search)
    );

    if (filtered.length === 0) {
        list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Нет чатов</div>';
        return;
    }

    list.innerHTML = filtered.map(c => {
        const isActive = state.currentChat && state.currentChat.id === c.id;
        const time = formatTime(c.updated_at);
        const variantEmoji = c.variant === 'original' ? '🔴' : c.variant === 'budget' ? '🔵' : '🟢';

        return `<div class="chat-item ${isActive ? 'active' : ''}" onclick="openChat('${c.id}')" data-chat-id="${c.id}">
            <div class="chat-item-header">
                <div class="chat-item-title" id="chatTitle_${c.id}">${escapeHtml(c.title)}</div>
                <button class="chat-item-menu-btn" onclick="event.stopPropagation(); toggleChatMenu('${c.id}')" title="Действия">⋮</button>
            </div>
            <div class="chat-item-meta">
                <span>${time}</span>
                <span class="chat-item-cost">$${c.total_cost.toFixed(2)} (${(c.total_cost * 105).toFixed(0)}₽)</span>
                <span class="chat-item-model">${variantEmoji}</span>
            </div>
            <div class="chat-context-menu" id="chatMenu_${c.id}">
                <button class="chat-menu-action" onclick="event.stopPropagation(); startRenameChat('${c.id}')">
                    ✏️ Переименовать
                </button>
                <button class="chat-menu-action chat-menu-delete" onclick="event.stopPropagation(); confirmDeleteChat('${c.id}', '${escapeHtml(c.title).replace(/'/g, "\\'")}')"> 
                    🗑️ Удалить
                </button>
            </div>
        </div>`;
    }).join('');
}

async function createNewChat() {
    try {
        const data = await api('/chats', {
            method: 'POST',
            body: JSON.stringify({ title: 'Новый чат' })
        });

        state.currentChat = data.chat;
        state.chats.unshift(data.chat);
        renderChatList();
        renderChatMessages();
        switchTab('chat');
    } catch (e) {
        toast('Ошибка создания чата: ' + e.message, 'error');
    }
}

async function openChat(chatId) {
    try {
        const data = await api(`/chats/${chatId}`);
        state.currentChat = data.chat;
        renderChatList();
        renderChatMessages();
        switchTab('chat');
    } catch (e) {
        toast('Ошибка загрузки чата: ' + e.message, 'error');
    }
}

// ── Chat Context Menu ─────────────────────────────────────────
let openMenuId = null;

function toggleChatMenu(chatId) {
    // Close any open menu first
    if (openMenuId && openMenuId !== chatId) {
        const prevMenu = document.getElementById(`chatMenu_${openMenuId}`);
        if (prevMenu) prevMenu.classList.remove('visible');
    }
    const menu = document.getElementById(`chatMenu_${chatId}`);
    if (!menu) return;
    menu.classList.toggle('visible');
    openMenuId = menu.classList.contains('visible') ? chatId : null;
}

// Close menu on click outside
document.addEventListener('click', () => {
    if (openMenuId) {
        const menu = document.getElementById(`chatMenu_${openMenuId}`);
        if (menu) menu.classList.remove('visible');
        openMenuId = null;
    }
});

// ── Rename Chat ──────────────────────────────────────────────
function startRenameChat(chatId) {
    // Close context menu
    const menu = document.getElementById(`chatMenu_${chatId}`);
    if (menu) menu.classList.remove('visible');
    openMenuId = null;

    const titleEl = document.getElementById(`chatTitle_${chatId}`);
    if (!titleEl) return;

    const currentTitle = state.chats.find(c => c.id === chatId)?.title || '';
    
    // Replace title with input
    titleEl.outerHTML = `<input type="text" class="chat-rename-input" id="chatRenameInput_${chatId}" 
        value="${escapeHtml(currentTitle)}" 
        onclick="event.stopPropagation()" 
        onkeydown="handleRenameKey(event, '${chatId}')" 
        onblur="finishRenameChat('${chatId}')">`;
    
    const input = document.getElementById(`chatRenameInput_${chatId}`);
    if (input) {
        input.focus();
        input.select();
    }
}

function handleRenameKey(event, chatId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        finishRenameChat(chatId);
    } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelRenameChat(chatId);
    }
}

async function finishRenameChat(chatId) {
    const input = document.getElementById(`chatRenameInput_${chatId}`);
    if (!input) return;
    
    const newTitle = input.value.trim();
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;

    if (!newTitle || newTitle === chat.title) {
        renderChatList();
        return;
    }

    try {
        await api(`/chats/${chatId}/rename`, {
            method: 'PUT',
            body: JSON.stringify({ title: newTitle })
        });
        chat.title = newTitle;
        if (state.currentChat && state.currentChat.id === chatId) {
            state.currentChat.title = newTitle;
        }
        renderChatList();
        toast('Чат переименован', 'success');
    } catch (e) {
        toast('Ошибка: ' + e.message, 'error');
        renderChatList();
    }
}

function cancelRenameChat(chatId) {
    renderChatList();
}

// ── Delete Chat with Confirmation Modal ──────────────────────
let pendingDeleteChatId = null;

function confirmDeleteChat(chatId, chatTitle) {
    // Close context menu
    const menu = document.getElementById(`chatMenu_${chatId}`);
    if (menu) menu.classList.remove('visible');
    openMenuId = null;

    pendingDeleteChatId = chatId;
    document.getElementById('deleteChatTitle').textContent = chatTitle || 'Без названия';
    document.getElementById('deleteChatModal').classList.add('active');
}

function cancelDeleteChat() {
    pendingDeleteChatId = null;
    document.getElementById('deleteChatModal').classList.remove('active');
}

async function executeDeleteChat() {
    if (!pendingDeleteChatId) return;
    const chatId = pendingDeleteChatId;
    
    try {
        await api(`/chats/${chatId}`, { method: 'DELETE' });
        state.chats = state.chats.filter(c => c.id !== chatId);
        if (state.currentChat && state.currentChat.id === chatId) {
            state.currentChat = null;
        }
        renderChatList();
        renderChatMessages();
        toast('Чат удалён', 'info');
    } catch (e) {
        toast('Ошибка: ' + e.message, 'error');
    } finally {
        cancelDeleteChat();
    }
}

async function deleteChat(chatId, event) {
    if (event) event.stopPropagation();
    confirmDeleteChat(chatId, state.chats.find(c => c.id === chatId)?.title);
}

function renderChatMessages() {
    const container = document.getElementById('chatMessages');

    if (!state.currentChat || !state.currentChat.messages || state.currentChat.messages.length === 0) {
        container.innerHTML = `
            <div class="message assistant">
                <div class="message-avatar">SA</div>
                <div class="message-body">
                    <div class="message-content">
                        👋 <strong>Привет! Я Super Agent</strong> — ваш автономный AI-инженер.<br><br>
                        Я могу:<br>
                        • Писать код на любом языке<br>
                        • Создавать лендинги и UI/UX дизайн<br>
                        • Настраивать API, серверы, workflows<br>
                        • Работать по SSH и автоматизировать задачи<br><br>
                        Выберите шаблон ниже или опишите задачу.
                    </div>
                    <div class="message-meta">
                        <span>🟢 MiniMax M2.5</span>
                        <span>•</span>
                        <span>только что</span>
                    </div>
                </div>
            </div>`;
        return;
    }

    container.innerHTML = state.currentChat.messages.map(msg => {
        if (msg.role === 'user') {
            return `<div class="message user">
                <div class="message-avatar">${(state.user?.name || 'U')[0]}</div>
                <div class="message-body">
                    <div class="message-content">${escapeHtml(msg.content)}</div>
                    <div class="message-meta">
                        <span>${formatTime(msg.timestamp)}</span>
                    </div>
                </div>
            </div>`;
        } else {
            const rendered = renderMarkdown(msg.content);
            const variantEmoji = msg.variant === 'original' ? '🔴' : msg.variant === 'budget' ? '🔵' : '🟢';
            const msgId = 'hist-' + Math.random().toString(36).substr(2, 8);
            return `<div class="message assistant" id="${msgId}">
                <div class="message-avatar">SA</div>
                <div class="message-body">
                    ${msg.enhanced ? renderAgentSteps(true) : ''}
                    <div class="message-content" id="${msgId}-content">${rendered}</div>
                    <div class="message-actions">
                        <button class="msg-action-btn" onclick="copyMessageContent('${msgId}')" title="Копировать">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            <span>Копировать</span>
                        </button>
                        <button class="msg-action-btn" onclick="regenerateMessage()" title="Перегенерировать">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                            <span>Перегенерировать</span>
                        </button>
                    </div>
                    <div class="message-meta">
                        <span>${variantEmoji} ${msg.model || 'AI'}</span>
                        <span>•</span>
                        <span>${formatTime(msg.timestamp)}</span>
                        ${msg.cost ? `<span>•</span><span class="message-cost">$${msg.cost.toFixed(4)} (${(msg.cost * 105).toFixed(2)}₽)</span>` : ''}
                    </div>
                </div>
            </div>`;
        }
    }).join('');

    container.scrollTop = container.scrollHeight;
}

// ═══ Stop Generation ════════════════════════════════════════
function stopGeneration() {
    if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
    }
    // Also stop agent on backend
    if (state.currentChat) {
        api(`/chats/${state.currentChat.id}/stop`, { method: 'POST' }).catch(() => {});
    }
    state.isStreaming = false;
    updateSendButton();
    showGenerationProgress(false);
    toast('Генерация остановлена', 'info');
}

// ═══ Send Message ═══════════════════════════════════════════
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    // If streaming, stop current generation first
    if (state.isStreaming) {
        stopGeneration();
        // Small delay then send new message
        setTimeout(() => {
            input.value = message;
            sendMessage();
        }, 200);
        return;
    }

    // Create chat if needed
    if (!state.currentChat) {
        await createNewChat();
    }

    const chatId = state.currentChat.id;
    state.abortController = new AbortController();
    state.isStreaming = true;
    updateSendButton();
    showGenerationProgress(true);

    // Add user message to UI
    const container = document.getElementById('chatMessages');
    const userMsgHtml = `<div class="message user">
        <div class="message-avatar">${(state.user?.name || 'U')[0]}</div>
        <div class="message-body">
            <div class="message-content">${escapeHtml(message)}</div>
            <div class="message-meta"><span>сейчас</span></div>
        </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', userMsgHtml);

    // Add assistant placeholder
    const assistantId = 'msg-' + Date.now();
    const agentStepsHtml = state.settings.enhanced_mode ? `<div id="${assistantId}-steps" class="agent-status">
        <div class="agent-step" data-role="architect"><div class="dot"></div> 🏗️ Architect — планирование</div>
        <div class="agent-step" data-role="coder"><div class="dot"></div> 💻 Coder — написание кода</div>
        <div class="agent-step" data-role="reviewer"><div class="dot"></div> 🔍 Reviewer — проверка</div>
        <div class="agent-step" data-role="qa"><div class="dot"></div> ✅ QA — финальная проверка</div>
    </div>` : '';

    container.insertAdjacentHTML('beforeend', `<div class="message assistant" id="${assistantId}">
        <div class="message-avatar">SA</div>
        <div class="message-body">
            ${agentStepsHtml}
            <div class="message-content" id="${assistantId}-content">
                <div class="typing-indicator"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
            </div>
            <div class="message-meta" id="${assistantId}-meta"></div>
        </div>
    </div>`);

    container.scrollTop = container.scrollHeight;
    input.value = '';
    autoResize(input);

    // Stream response with typing effect
    let fullContent = '';
    let displayedContent = '';
    let currentAgent = '';
    let typingQueue = [];
    let isTyping = false;
    const TYPING_SPEED = 8; // ms per character — fast but smooth

    function processTypingQueue() {
        if (isTyping || typingQueue.length === 0) return;
        isTyping = true;

        const chunk = typingQueue.shift();
        let charIdx = 0;

        function typeNextChar() {
            // Type multiple chars per frame for speed
            const charsPerFrame = Math.max(1, Math.ceil(chunk.length / 60));
            for (let i = 0; i < charsPerFrame && charIdx < chunk.length; i++) {
                displayedContent += chunk[charIdx];
                charIdx++;
            }

            const contentEl = document.getElementById(`${assistantId}-content`);
            if (contentEl) {
                contentEl.innerHTML = renderMarkdown(displayedContent) + '<span class="typing-cursor"></span>';
                container.scrollTop = container.scrollHeight;
            }

            if (charIdx < chunk.length) {
                requestAnimationFrame(typeNextChar);
            } else {
                isTyping = false;
                // Remove cursor if no more in queue
                if (typingQueue.length === 0) {
                    const el = document.getElementById(`${assistantId}-content`);
                    if (el) {
                        el.innerHTML = renderMarkdown(displayedContent);
                        container.scrollTop = container.scrollHeight;
                    }
                }
                processTypingQueue();
            }
        }

        requestAnimationFrame(typeNextChar);
    }

    try {
        const resp = await fetch(`${API}/chats/${chatId}/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ message, file_content: state._pendingFileContent || '' }),
            signal: state.abortController?.signal
        });

        state._pendingFileContent = '';

        const reader = resp.body.getReader();
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
                const payload = line.slice(6).trim();
                if (!payload || payload === '[DONE]') continue;

                try {
                    const event = JSON.parse(payload);

                    // ═══ Agent Mode Events ═══
                    if (event.type === 'agent_mode') {
                        // Agent mode activated
                        const actionsEl = document.getElementById(`${assistantId}-actions`);
                        if (!actionsEl) {
                            const contentEl = document.getElementById(`${assistantId}-content`);
                            if (contentEl) {
                                contentEl.insertAdjacentHTML('beforebegin', `<div id="${assistantId}-actions" class="agent-actions-log"></div>`);
                            }
                        }
                    }

                    if (event.type === 'agent_start') {
                        currentAgent = event.role;
                        const stepEl = document.querySelector(`#${assistantId}-steps [data-role="${event.role}"]`);
                        if (stepEl) stepEl.classList.add('active');
                        // Add agent header to actions log
                        addAgentAction(assistantId, `<div class="agent-action-header">${event.emoji || '🤖'} <strong>${event.agent || event.role}</strong> запущен</div>`);
                    }

                    if (event.type === 'agent_complete') {
                        const stepEl = document.querySelector(`#${assistantId}-steps [data-role="${event.role}"]`);
                        if (stepEl) {
                            stepEl.classList.remove('active');
                            stepEl.classList.add('done');
                        }
                        addAgentAction(assistantId, `<div class="agent-action-done">✅ ${event.agent || event.role} завершил работу</div>`);
                    }

                    if (event.type === 'agent_iteration') {
                        addAgentAction(assistantId, `<div class="agent-action-iter">🔄 Итерация ${event.iteration}/${event.max}</div>`);
                    }

                    // ═══ Tool Events (SSH, Files, Browser) ═══
                    if (event.type === 'tool_start') {
                        const toolIcon = getToolIcon(event.tool);
                        const toolLabel = getToolLabel(event.tool);
                        const argsPreview = formatToolArgs(event.tool, event.args);
                        addAgentAction(assistantId, `<div class="agent-tool-start">
                            <span class="tool-icon">${toolIcon}</span>
                            <span class="tool-label">${toolLabel}</span>
                            <span class="tool-args">${argsPreview}</span>
                            <span class="tool-spinner"></span>
                        </div>`);
                    }

                    if (event.type === 'tool_result') {
                        const statusIcon = event.success ? '✅' : '❌';
                        const preview = escapeHtml(event.preview || event.summary || '');
                        const elapsed = event.elapsed ? ` (${event.elapsed}s)` : '';
                        addAgentAction(assistantId, `<div class="agent-tool-result ${event.success ? 'success' : 'error'}">
                            <span>${statusIcon}</span>
                            <span class="tool-result-text">${preview}</span>
                            <span class="tool-elapsed">${elapsed}</span>
                        </div>`);
                        // Remove spinner from last tool_start
                        const actionsEl = document.getElementById(`${assistantId}-actions`);
                        if (actionsEl) {
                            const spinners = actionsEl.querySelectorAll('.tool-spinner');
                            spinners.forEach(s => s.remove());
                        }
                    }

                    // ═══ Self-Healing Events ═══
                    if (event.type === 'self_heal') {
                        addAgentAction(assistantId, `<div class="agent-self-heal">
                            <span class="heal-icon">🛡️</span>
                            <span class="heal-text"><strong>Self-Healing</strong> (попытка ${event.attempt}/${event.max_attempts}): ${escapeHtml(event.fix_description || '')}</span>
                            <span class="heal-badge">${event.fixes_count} вариантов</span>
                        </div>`);
                    }

                    if (event.type === 'task_complete') {
                        addAgentAction(assistantId, `<div class="agent-task-complete">
                            🎉 <strong>Задача выполнена!</strong> ${escapeHtml(event.summary || '')}
                        </div>`);
                    }

                    // ═══ Content Streaming ═══
                    if (event.type === 'content') {
                        fullContent += event.text;
                        typingQueue.push(event.text);
                        processTypingQueue();
                    }

                    if (event.type === 'meta') {
                        // Store metadata
                        if (event.agent_mode) {
                            const contentEl = document.getElementById(`${assistantId}-content`);
                            if (contentEl) {
                                contentEl.insertAdjacentHTML('beforebegin', `<div id="${assistantId}-actions" class="agent-actions-log"></div>`);
                            }
                        }
                    }

                    if (event.type === 'done') {
                        // Flush remaining typing
                        displayedContent = fullContent;
                        typingQueue = [];
                        isTyping = false;
                        const contentEl = document.getElementById(`${assistantId}-content`);
                        if (contentEl) {
                            contentEl.innerHTML = renderMarkdown(fullContent);
                            container.scrollTop = container.scrollHeight;
                        }

                        // Add action buttons
                        const msgBody = document.getElementById(assistantId)?.querySelector('.message-body');
                        if (msgBody && !msgBody.querySelector('.message-actions')) {
                            const actionsHtml = `<div class="message-actions">
                                <button class="msg-action-btn" onclick="copyMessageContent('${assistantId}')" title="Копировать">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    <span>Копировать</span>
                                </button>
                                <button class="msg-action-btn" onclick="regenerateMessage()" title="Перегенерировать">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                    <span>Перегенерировать</span>
                                </button>
                            </div>`;
                            const metaEl2 = document.getElementById(`${assistantId}-meta`);
                            if (metaEl2) metaEl2.insertAdjacentHTML('beforebegin', actionsHtml);
                        }

                        const metaEl = document.getElementById(`${assistantId}-meta`);
                        const variantEmoji = state.settings.variant === 'original' ? '🔴' : state.settings.variant === 'budget' ? '🔵' : '🟢';
                        metaEl.innerHTML = `
                            <span>${variantEmoji} ${event.model || 'AI'}</span>
                            <span>•</span>
                            <span>сейчас</span>
                            <span>•</span>
                            <span class="message-cost">$${(event.cost || 0).toFixed(4)} (${((event.cost || 0) * 105).toFixed(2)}₽)</span>
                        `;

                        // Update preview if HTML found
                        const htmlMatch = fullContent.match(/```html[\s\S]*?\n([\s\S]*?)```/);
                        if (htmlMatch) {
                            updatePreview(htmlMatch[1]);
                        }
                    }

                    if (event.type === 'stopped') {
                        addAgentAction(assistantId, `<div class="agent-action-stopped">⏹ ${event.text}</div>`);
                    }

                    if (event.type === 'error') {
                        const contentEl = document.getElementById(`${assistantId}-content`);
                        contentEl.innerHTML = `<span style="color:var(--accent-red)">${event.text}</span>`;
                    }
                } catch (e) {
                    // Skip invalid JSON
                }
            }
        }
    } catch (e) {
        const contentEl = document.getElementById(`${assistantId}-content`);
        contentEl.innerHTML = `<span style="color:var(--accent-red)">❌ Ошибка: ${e.message}</span>`;
        showGenerationProgress(false);
    }

    state.isStreaming = false;
    updateSendButton();
    showGenerationProgress(false);
    // Clear attached files after send
    state._attachedFiles = [];
    renderAttachedFiles();
    loadChats(); // Refresh chat list
}

function sendTemplate(text) {
    document.getElementById('chatInput').value = text;
    sendMessage();
}

// ═══ File Upload ════════════════════════════════════════════
function triggerFileUpload() {
    document.getElementById('fileInput').click();
}

// Attached files state
state._attachedFiles = [];

async function handleFileUpload(input) {
    const files = input.files;
    if (!files.length) return;

    const formData = new FormData();
    for (const f of files) {
        formData.append('file', f);
        // Add to attached files for preview
        state._attachedFiles.push({
            name: f.name,
            size: f.size,
            type: f.type
        });
    }

    renderAttachedFiles();

    try {
        const resp = await fetch(`${API}/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` },
            body: formData
        });

        const data = await resp.json();
        if (data.content) {
            state._pendingFileContent = data.content;
            toast(`Загружено ${data.file_count} файл(ов)`, 'success');
        }
    } catch (e) {
        toast('Ошибка загрузки: ' + e.message, 'error');
        // Remove failed files from preview
        state._attachedFiles = [];
        renderAttachedFiles();
    }

    input.value = '';
}

function renderAttachedFiles() {
    const container = document.getElementById('attachedFiles');
    if (!container) return;

    if (state._attachedFiles.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = state._attachedFiles.map((f, i) => {
        const icon = getFileIcon(f.name);
        const size = formatFileSize(f.size);
        return `<div class="attached-file">
            <span class="file-icon">${icon}</span>
            <span class="file-name" title="${f.name}">${f.name}</span>
            <span class="file-size">${size}</span>
            <button class="file-remove" onclick="removeAttachedFile(${i})" title="Удалить">×</button>
        </div>`;
    }).join('');
}

function removeAttachedFile(index) {
    state._attachedFiles.splice(index, 1);
    if (state._attachedFiles.length === 0) {
        state._pendingFileContent = '';
    }
    renderAttachedFiles();
}

function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
        'py': '🐍', 'js': '🟨', 'ts': '🟦', 'html': '🌐', 'css': '🎨',
        'json': '📋', 'md': '📝', 'txt': '📄', 'zip': '📦', 'tar': '📦',
        'gz': '📦', 'pdf': '📕', 'doc': '📘', 'docx': '📘',
        'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'webp': '🖼️',
        'sql': '🗃️', 'yaml': '⚙️', 'yml': '⚙️', 'toml': '⚙️'
    };
    return icons[ext] || '📄';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ═══ Settings ═══════════════════════════════════════════════
function setVariant(variant) {
    selectModelVariant(variant);
}

function selectVariantCard(variant) {
    state.settings.variant = variant;
    updateSettingsCards();
    updateModelChips();
}

function selectChatModel(model) {
    state.settings.chat_model = model;
    updateSettingsCards();
}

function toggleEnhanced() {
    state.settings.enhanced_mode = !state.settings.enhanced_mode;
    updateEnhancedToggle();
    saveSettingsQuiet();
}

function toggleEnhancedSetting() {
    state.settings.enhanced_mode = !state.settings.enhanced_mode;
    updateEnhancedToggle();
    updateSettingsCards();
}

function toggleDesignPro() {
    state.settings.design_pro = !state.settings.design_pro;
    updateSettingsCards();
}

async function saveSettings() {
    // Also grab SSH and GitHub settings from form
    const sshHost = document.getElementById('sshHost');
    const sshUser = document.getElementById('sshUser');
    const sshPassword = document.getElementById('sshPassword');
    const githubToken = document.getElementById('githubToken');

    if (sshHost) state.settings.ssh_host = sshHost.value.trim();
    if (sshUser) state.settings.ssh_user = sshUser.value.trim() || 'root';
    if (sshPassword && sshPassword.value) state.settings.ssh_password = sshPassword.value;
    if (githubToken && githubToken.value) state.settings.github_token = githubToken.value.trim();

    try {
        await api('/settings', {
            method: 'PUT',
            body: JSON.stringify(state.settings)
        });
        toast('✅ Все настройки сохранены', 'success');
    } catch (e) {
        toast('Ошибка: ' + e.message, 'error');
    }
}

async function saveSettingsQuiet() {
    try {
        await api('/settings', {
            method: 'PUT',
            body: JSON.stringify(state.settings)
        });
    } catch (e) {
        // Silent
    }
}

// ═══ Model Dropdown (Manus-style) ═══════════════════════════
const VARIANTS = {
    original: { name: 'Оригинал (Grok)', color: 'red', desc: 'xAI Grok — максимальная креативность', badge: '' },
    premium: { name: 'Премиум (MiniMax M2.5)', color: 'green', desc: 'MiniMax M2.5 — лучший баланс цена/качество', badge: 'Рекомендуем' },
    budget: { name: 'Бюджет (DeepSeek)', color: 'blue', desc: 'DeepSeek V3.2 — минимальная стоимость', badge: '' }
};

let _dropdownOpen = false;

function updateModelChips() {
    // Update dropdown button text
    const btn = document.getElementById('modelDropdownBtn');
    if (!btn) return;
    const v = VARIANTS[state.settings.variant] || VARIANTS.premium;
    btn.innerHTML = `
        <span class="model-dropdown-dot ${v.color}"></span>
        <span>${v.name}</span>
        <svg class="model-dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    `;
    btn.classList.toggle('open', _dropdownOpen);

    // Update dropdown menu active state
    document.querySelectorAll('.model-dropdown-item').forEach(el => {
        el.classList.toggle('active', el.dataset.variant === state.settings.variant);
    });
}

function toggleModelDropdown(e) {
    e?.stopPropagation();
    _dropdownOpen = !_dropdownOpen;
    const menu = document.getElementById('modelDropdownMenu');
    if (_dropdownOpen) {
        menu.classList.remove('hidden');
    } else {
        menu.classList.add('hidden');
    }
    updateModelChips();
}

function selectVariantDropdown(variant) { selectModelVariant(variant); }
function selectModelVariant(variant) {
    state.settings.variant = variant;
    _dropdownOpen = false;
    document.getElementById('modelDropdownMenu').classList.add('hidden');
    updateModelChips();
    updateSettingsCards();
    saveSettingsQuiet();
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (_dropdownOpen && !e.target.closest('.model-dropdown-wrap')) {
        _dropdownOpen = false;
        document.getElementById('modelDropdownMenu')?.classList.add('hidden');
        updateModelChips();
    }
});

// ═══ Theme Toggle ═══════════════════════════════════════════
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('sa_theme', next);
    updateThemeButton();
}

function updateThemeButton() {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    btn.innerHTML = theme === 'dark' 
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    btn.title = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
}

// ═══ Scroll Down Button ════════════════════════════════════
function initScrollWatcher() {
    const container = document.getElementById('chatMessages');
    const scrollBtn = document.getElementById('scrollDownBtn');
    if (!container || !scrollBtn) return;

    container.addEventListener('scroll', () => {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        scrollBtn.classList.toggle('hidden', isNearBottom);
    });
}

function scrollToBottom() {
    const container = document.getElementById('chatMessages');
    if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
}

function updateEnhancedToggle() {
    const toggle = document.getElementById('enhancedToggle');
    toggle.classList.toggle('active', state.settings.enhanced_mode);
}

function updateSettingsCards() {
    // Variant cards
    document.querySelectorAll('.settings-card[data-variant]').forEach(el => {
        el.classList.toggle('selected', el.dataset.variant === state.settings.variant);
    });

    // Chat model cards
    document.querySelectorAll('.settings-card[data-chatmodel]').forEach(el => {
        el.classList.toggle('selected', el.dataset.chatmodel === state.settings.chat_model);
    });

    // Enhanced checkbox
    const enhancedCb = document.getElementById('enhancedCheckbox');
    if (enhancedCb) {
        enhancedCb.innerHTML = state.settings.enhanced_mode ? '✓' : '';
        enhancedCb.style.borderColor = state.settings.enhanced_mode ? 'var(--accent-primary)' : 'var(--border-color)';
        enhancedCb.style.background = state.settings.enhanced_mode ? 'var(--accent-primary)' : 'transparent';
        enhancedCb.style.color = 'white';
    }

    // Design Pro checkbox
    const dpCb = document.getElementById('designProCheckbox');
    if (dpCb) {
        dpCb.innerHTML = state.settings.design_pro ? '✓' : '';
        dpCb.style.borderColor = state.settings.design_pro ? 'var(--accent-primary)' : 'var(--border-color)';
        dpCb.style.background = state.settings.design_pro ? 'var(--accent-primary)' : 'transparent';
        dpCb.style.color = 'white';
    }
}

// ═══ Analytics ═══════════════════════════════════════════════
async function loadAnalytics() {
    try {
        const data = await api('/analytics');
        renderAnalytics(data);
    } catch (e) {
        console.error('Analytics error:', e);
    }
}

function renderAnalytics(data) {
    const grid = document.getElementById('statsGrid');
    const u = data.user;

    grid.innerHTML = `
        <div class="stat-card">
            <div class="stat-card-value">$${u.total_cost.toFixed(2)} <small style="font-size:14px;color:var(--text-muted)">(${(u.total_cost_rub || u.total_cost * 105).toFixed(0)}₽)</small></div>
            <div class="stat-card-label">Потрачено всего</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-value">${u.total_chats}</div>
            <div class="stat-card-label">Чатов</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-value">${u.total_messages}</div>
            <div class="stat-card-label">Сообщений</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-value">${formatTokens(u.tokens_in + u.tokens_out)}</div>
            <div class="stat-card-label">Токенов</div>
        </div>
    `;

    // Comparison
    const comp = data.comparison;
    const section = document.getElementById('comparisonSection');
    const agentWidth = Math.max(5, Math.min(100, (comp.agent_avg_cost / comp.programmer_avg_cost) * 100));

    section.innerHTML = `
        <div class="comparison-card">
            <div class="comparison-title">💰 Программист vs Super Agent</div>
            <div class="comparison-bar">
                <div class="comparison-label">Super Agent</div>
                <div class="comparison-track">
                    <div class="comparison-fill agent" style="width:${agentWidth}%">$${comp.agent_avg_cost.toFixed(2)}</div>
                </div>
            </div>
            <div class="comparison-bar">
                <div class="comparison-label">Программист</div>
                <div class="comparison-track">
                    <div class="comparison-fill programmer" style="width:100%">$${comp.programmer_avg_cost}</div>
                </div>
            </div>
            <div style="text-align:center;margin-top:12px;font-size:16px;font-weight:700;color:var(--accent-green)">
                ${comp.savings_text}
            </div>
        </div>
    `;

    // Chat stats table
    const chatSection = document.getElementById('chatStatsSection');
    if (data.chats && data.chats.length > 0) {
        chatSection.innerHTML = `
            <h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">Статистика по чатам</h3>
            <table class="admin-table">
                <thead><tr>
                    <th>Чат</th><th>Сообщений</th><th>Стоимость</th><th>Модель</th>
                </tr></thead>
                <tbody>
                    ${data.chats.map(c => `<tr>
                        <td>${escapeHtml(c.title)}</td>
                        <td>${c.messages}</td>
                        <td class="message-cost">$${c.cost.toFixed(4)} (${(c.cost * 105).toFixed(2)}₽)</td>
                        <td><span class="chat-item-model">${c.variant || ''}</span></td>
                    </tr>`).join('')}
                </tbody>
            </table>
        `;
    }
}

// ═══ Admin Panel ════════════════════════════════════════════
async function loadAdmin() {
    try {
        const [statsData, usersData, chatsData] = await Promise.all([
            api('/admin/stats'),
            api('/admin/users'),
            api('/admin/chats')
        ]);
        renderAdminStats(statsData);
        renderUsersTable(usersData.users);
        renderAdminChats(chatsData.chats);
    } catch (e) {
        document.getElementById('usersTable').innerHTML =
            '<div style="padding:20px;text-align:center;color:var(--text-muted)">Нет доступа к админ-панели</div>';
    }
}

function renderAdminStats(data) {
    const grid = document.getElementById('adminStatsGrid');
    grid.innerHTML = `
        <div class="stat-card">
            <div class="stat-card-value">$${(data.total_cost || 0).toFixed(2)} <small style="font-size:14px;color:var(--text-muted)">(${(data.total_cost_rub || (data.total_cost || 0) * 105).toFixed(0)}₽)</small></div>
            <div class="stat-card-label">Общий расход</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-value">${data.total_users || 0}</div>
            <div class="stat-card-label">Пользователей</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-value">${data.total_chats || 0}</div>
            <div class="stat-card-label">Чатов</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-value">${formatTokens(data.total_tokens_in + data.total_tokens_out)}</div>
            <div class="stat-card-label">Токенов</div>
        </div>
    `;
}

function renderUsersTable(users) {
    const container = document.getElementById('usersTable');
    if (!users || users.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Нет пользователей</div>';
        return;
    }

    const roleLabels = { admin: '👑 Админ', user: '👤 Пользователь', viewer: '👁 Наблюдатель' };
    const roleColors = { admin: '#f59e0b', user: '#10b981', viewer: '#6b7280' };

    container.innerHTML = `
        <table class="admin-table">
            <thead><tr>
                <th>Email</th><th>Имя</th><th>Роль</th><th>Расход / Бюджет</th><th>Чатов</th><th>Сообщ.</th><th>Права</th><th>Статус</th><th>Действия</th>
            </tr></thead>
            <tbody>
                ${users.map(u => {
                    const budgetPct = Math.min(100, u.budget_used_percent || 0);
                    const budgetColor = budgetPct > 90 ? '#ef4444' : budgetPct > 70 ? '#f59e0b' : '#10b981';
                    const perms = u.permissions || {};
                    const permBadges = [
                        perms.can_use_ssh ? '<span class="perm-badge ssh">SSH</span>' : '',
                        perms.can_use_browser ? '<span class="perm-badge browser">Browser</span>' : '',
                        perms.can_use_enhanced ? '<span class="perm-badge enhanced">4-Agent</span>' : '',
                    ].filter(Boolean).join(' ');

                    return `<tr>
                        <td style="font-size:12px">${escapeHtml(u.email)}</td>
                        <td>${escapeHtml(u.name)}</td>
                        <td><span style="color:${roleColors[u.role] || '#6b7280'};font-weight:600;font-size:12px">${roleLabels[u.role] || u.role}</span></td>
                        <td style="min-width:180px">
                            <div style="font-size:12px;margin-bottom:4px">
                                $${u.total_spent.toFixed(2)} <small>(${(u.total_spent * 105).toFixed(0)}₽)</small>
                                / $${u.monthly_limit} <small>(${(u.monthly_limit * 105).toFixed(0)}₽)</small>
                            </div>
                            <div style="background:var(--bg-secondary);border-radius:4px;height:6px;overflow:hidden">
                                <div style="width:${budgetPct}%;height:100%;background:${budgetColor};border-radius:4px;transition:width 0.3s"></div>
                            </div>
                            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${budgetPct.toFixed(1)}% использовано</div>
                        </td>
                        <td style="text-align:center">${u.total_chats || 0}</td>
                        <td style="text-align:center">${u.total_messages || 0}</td>
                        <td style="font-size:11px">${permBadges || '<span style="color:var(--text-muted)">—</span>'}</td>
                        <td><span class="status-badge ${u.is_active ? 'status-active' : 'status-blocked'}">${u.is_active ? '✅' : '🚫'}</span></td>
                        <td style="white-space:nowrap">
                            <button class="admin-btn" onclick="editUser('${u.id}')" title="Редактировать">✏️</button>
                            <button class="admin-btn ${u.is_active ? 'danger' : ''}" onclick="toggleUser('${u.id}')" title="${u.is_active ? 'Заблокировать' : 'Разблокировать'}">
                                ${u.is_active ? '🔒' : '🔓'}
                            </button>
                            <button class="admin-btn danger" onclick="deleteUser('${u.id}', '${escapeHtml(u.email)}')" title="Удалить">🗑</button>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    `;
}

function renderAdminChats(chats) {
    const container = document.getElementById('adminChatsTable');
    if (!container) return;
    if (!chats || chats.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Нет чатов</div>';
        return;
    }

    container.innerHTML = `
        <table class="admin-table">
            <thead><tr>
                <th>Пользователь</th><th>Чат</th><th>Вариант</th><th>Сообщений</th><th>Стоимость</th><th>Дата</th><th>Действия</th>
            </tr></thead>
            <tbody>
                ${chats.map(c => {
                    const variantBadge = c.variant === 'original' ? '🔴' : c.variant === 'budget' ? '🔵' : '🟢';
                    const date = c.updated_at ? new Date(c.updated_at).toLocaleString('ru') : '';
                    return `<tr>
                        <td><span style="font-size:12px">${escapeHtml(c.user_email)}</span></td>
                        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</td>
                        <td>${variantBadge} ${c.variant || ''}</td>
                        <td>${c.message_count}</td>
                        <td>$${(c.total_cost || 0).toFixed(4)} <small>(${((c.total_cost || 0) * 105).toFixed(2)}₽)</small></td>
                        <td style="font-size:11px">${date}</td>
                        <td>
                            <button class="admin-btn" onclick="viewAdminChat('${c.id}')">👁 Смотреть</button>
                            <button class="admin-btn danger" onclick="deleteAdminChat('${c.id}')">🗑 Удалить</button>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    `;
}

async function viewAdminChat(chatId) {
    try {
        const data = await api(`/admin/chats/${chatId}`);
        const chat = data.chat;
        const messages = chat.messages || [];

        let html = `<div class="admin-chat-viewer">
            <div class="admin-chat-header">
                <h3>💬 ${escapeHtml(chat.title || 'Chat')}</h3>
                <div style="font-size:12px;color:var(--text-muted)">
                    👤 ${escapeHtml(chat.user_email || '')} &bull; ${chat.variant || ''} &bull; $${(chat.total_cost || 0).toFixed(4)} (${((chat.total_cost || 0) * 105).toFixed(2)}₽)
                </div>
                <button class="admin-btn" onclick="closeAdminChatViewer()" style="margin-top:8px">← Назад</button>
            </div>
            <div class="admin-chat-messages">`;

        for (const msg of messages) {
            const isUser = msg.role === 'user';
            const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString('ru') : '';
            html += `<div class="admin-msg ${isUser ? 'admin-msg-user' : 'admin-msg-assistant'}">
                <div class="admin-msg-role">${isUser ? '👤 Пользователь' : '🤖 AI'} <span style="color:var(--text-muted);font-size:11px">${time}</span></div>
                <div class="admin-msg-content">${isUser ? escapeHtml(msg.content || '') : renderMarkdown(msg.content || '')}</div>
                ${msg.cost ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">💰 $${msg.cost.toFixed(4)} (${(msg.cost * 105).toFixed(2)}₽) &bull; ${msg.model || ''}</div>` : ''}
            </div>`;
        }

        html += '</div></div>';

        // Show in admin panel
        const container = document.getElementById('adminChatsTable');
        container.innerHTML = html;
    } catch (e) {
        toast('Ошибка загрузки чата: ' + e.message, 'error');
    }
}

function closeAdminChatViewer() {
    loadAdmin();
}

async function deleteAdminChat(chatId) {
    if (!confirm('Удалить этот чат?')) return;
    try {
        await api(`/admin/chats/${chatId}`, { method: 'DELETE' });
        loadAdmin();
        toast('Чат удалён', 'success');
    } catch (e) {
        toast('Ошибка: ' + e.message, 'error');
    }
}

async function toggleUser(userId) {
    try {
        await api(`/admin/users/${userId}/toggle`, { method: 'POST' });
        loadAdmin();
        toast('Статус обновлён', 'success');
    } catch (e) {
        toast('Ошибка: ' + e.message, 'error');
    }
}

function showCreateUserModal() {
    document.getElementById('createUserModal').classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

async function createUser() {
    const email = document.getElementById('newUserEmail').value.trim();
    const name = document.getElementById('newUserName').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const limit = parseInt(document.getElementById('newUserLimit').value) || 100;
    const role = document.getElementById('newUserRole')?.value || 'user';

    if (!email || !password) {
        toast('Заполните email и пароль', 'error');
        return;
    }

    const permissions = {
        can_use_ssh: document.getElementById('newUserPermSSH')?.checked ?? (role !== 'viewer'),
        can_use_browser: document.getElementById('newUserPermBrowser')?.checked ?? (role !== 'viewer'),
        can_use_enhanced: document.getElementById('newUserPermEnhanced')?.checked ?? (role === 'admin'),
        can_export: true,
        can_upload_files: true,
        max_chats: 100,
        max_messages_per_day: 500
    };

    try {
        await api('/admin/users', {
            method: 'POST',
            body: JSON.stringify({ email, name, password, role, monthly_limit: limit, permissions })
        });
        closeModal('createUserModal');
        loadAdmin();
        toast('Пользователь создан', 'success');
    } catch (e) {
        toast('Ошибка: ' + e.message, 'error');
    }
}

async function editUser(userId) {
    // Fetch current user data from cached admin data
    try {
        const data = await api('/admin/users');
        const user = data.users.find(u => u.id === userId);
        if (!user) { toast('Пользователь не найден', 'error'); return; }

        const perms = user.permissions || {};
        const modal = document.getElementById('editUserModal');
        if (!modal) return;

        document.getElementById('editUserId').value = userId;
        document.getElementById('editUserName').value = user.name || '';
        document.getElementById('editUserRole').value = user.role || 'user';
        document.getElementById('editUserLimit').value = user.monthly_limit || 100;
        document.getElementById('editUserPassword').value = '';
        document.getElementById('editUserPermSSH').checked = perms.can_use_ssh !== false;
        document.getElementById('editUserPermBrowser').checked = perms.can_use_browser !== false;
        document.getElementById('editUserPermEnhanced').checked = perms.can_use_enhanced === true;

        modal.classList.add('active');
    } catch (e) {
        toast('Ошибка: ' + e.message, 'error');
    }
}

async function saveEditUser() {
    const userId = document.getElementById('editUserId').value;
    const name = document.getElementById('editUserName').value.trim();
    const role = document.getElementById('editUserRole').value;
    const limit = parseInt(document.getElementById('editUserLimit').value) || 100;
    const password = document.getElementById('editUserPassword').value;

    const body = {
        name,
        role,
        monthly_limit: limit,
        permissions: {
            can_use_ssh: document.getElementById('editUserPermSSH').checked,
            can_use_browser: document.getElementById('editUserPermBrowser').checked,
            can_use_enhanced: document.getElementById('editUserPermEnhanced').checked,
        }
    };
    if (password) body.password = password;

    try {
        await api(`/admin/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        closeModal('editUserModal');
        loadAdmin();
        toast('Пользователь обновлён', 'success');
    } catch (e) {
        toast('Ошибка: ' + e.message, 'error');
    }
}

async function deleteUser(userId, email) {
    // Show confirmation modal
    const modal = document.getElementById('confirmDeleteModal');
    if (modal) {
        document.getElementById('confirmDeleteText').textContent = `Удалить пользователя ${email}? Все его чаты будут удалены.`;
        document.getElementById('confirmDeleteBtn').onclick = async () => {
            try {
                await api(`/admin/users/${userId}`, { method: 'DELETE' });
                closeModal('confirmDeleteModal');
                loadAdmin();
                toast('Пользователь удалён', 'success');
            } catch (e) {
                toast('Ошибка: ' + e.message, 'error');
            }
        };
        modal.classList.add('active');
    }
}

// ═══ Preview Panel ══════════════════════════════════════════
function togglePreview() {
    state.previewVisible = !state.previewVisible;
    const panel = document.getElementById('previewPanel');
    panel.classList.toggle('hidden', !state.previewVisible);
}

function updatePreview(htmlContent) {
    if (!state.previewVisible) {
        state.previewVisible = true;
        document.getElementById('previewPanel').classList.remove('hidden');
    }

    const iframe = document.getElementById('previewIframe');
    const placeholder = document.getElementById('previewPlaceholder');

    placeholder.classList.add('hidden');
    iframe.classList.remove('hidden');

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();
}

function refreshPreview() {
    const iframe = document.getElementById('previewIframe');
    if (iframe.contentDocument) {
        iframe.contentDocument.location.reload();
    }
}

function openPreviewNewTab() {
    const iframe = document.getElementById('previewIframe');
    if (iframe.contentDocument) {
        const html = iframe.contentDocument.documentElement.outerHTML;
        const blob = new Blob([html], { type: 'text/html' });
        window.open(URL.createObjectURL(blob));
    }
}

function switchPreviewTab(tab) {
    document.querySelectorAll('.preview-tab').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');

    const iframe = document.getElementById('previewIframe');
    const placeholder = document.getElementById('previewPlaceholder');

    if (tab === 'render') {
        iframe.classList.remove('hidden');
        placeholder.classList.add('hidden');
    } else if (tab === 'console') {
        iframe.classList.add('hidden');
        placeholder.classList.remove('hidden');
        placeholder.innerHTML = `<div class="preview-console">
            <div class="console-line success"><span class="prefix">></span> Консоль готова</div>
            <div class="console-line info"><span class="prefix">✓</span> Super Agent v5.0 активен</div>
        </div>`;
    }
}

function setPreviewDevice(device) {
    document.querySelectorAll('.preview-toolbar-btn[data-device]').forEach(el => {
        el.classList.toggle('active', el.dataset.device === device);
    });

    const iframe = document.getElementById('previewIframe');
    const widths = { desktop: '100%', tablet: '768px', mobile: '375px' };
    iframe.style.maxWidth = widths[device] || '100%';
    iframe.style.margin = device === 'desktop' ? '0' : '0 auto';
}

// ═══ Export ══════════════════════════════════════════════════
async function exportCurrentChat() {
    if (!state.currentChat) {
        toast('Откройте чат для экспорта', 'info');
        return;
    }

    try {
        const resp = await fetch(`${API}/chats/${state.currentChat.id}/export`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (!resp.ok) {
            const err = await resp.json();
            toast(err.error || 'Нет файлов для экспорта', 'info');
            return;
        }

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `super-agent-${state.currentChat.id}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        toast('Экспорт завершён', 'success');
    } catch (e) {
        toast('Ошибка экспорта: ' + e.message, 'error');
    }
}

// ═══ UI Controls ════════════════════════════════════════════
function switchTab(tab) {
    state.currentTab = tab;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
    });
    document.querySelectorAll('.topbar-tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
    });

    // Show/hide panels
    document.getElementById('tabChat').classList.toggle('hidden', tab !== 'chat');
    document.getElementById('tabSettings').classList.toggle('hidden', tab !== 'settings');
    document.getElementById('tabMemory')?.classList.toggle('hidden', tab !== 'memory');
    document.getElementById('tabVersions')?.classList.toggle('hidden', tab !== 'versions');
    document.getElementById('tabAnalytics').classList.toggle('hidden', tab !== 'analytics');
    document.getElementById('tabAdmin').classList.toggle('hidden', tab !== 'admin');
    document.getElementById('tabCanvas')?.classList.toggle('hidden', tab !== 'canvas');
    document.getElementById('tabTemplates')?.classList.toggle('hidden', tab !== 'templates');
    const modelBar = document.getElementById('modelSelectorBar') || document.getElementById('modelChipsBar');
    if (modelBar) modelBar.classList.toggle('hidden', tab !== 'chat');

    // Load data for tabs
    if (tab === 'analytics') loadAnalytics();
    if (tab === 'admin') loadAdmin();
    if (tab === 'settings') updateSettingsCards();
    if (tab === 'memory') loadMemoryTab();
    if (tab === 'versions') loadVersionsTab();
    if (tab === 'canvas') loadCanvasTab();
    if (tab === 'templates') loadTemplatesTab();
}

function toggleSidebar() {
    state.sidebarOpen = !state.sidebarOpen;
    const sidebar = document.getElementById('sidebar');

    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('open', state.sidebarOpen);
    } else {
        sidebar.classList.toggle('collapsed', !state.sidebarOpen);
    }

    // Update collapse button icon
    const collapseBtn = sidebar.querySelector('.sidebar-collapse-btn');
    if (collapseBtn) {
        collapseBtn.innerHTML = state.sidebarOpen ? '\u25C0' : '\u25B6';
        collapseBtn.title = state.sidebarOpen ? '\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u043c\u0435\u043d\u044e' : '\u0420\u0430\u0437\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u043c\u0435\u043d\u044e';
    }

    // Update topbar toggle icon
    const topbarToggle = document.querySelector('.topbar-toggle');
    if (topbarToggle) {
        topbarToggle.innerHTML = state.sidebarOpen ? '\u2630' : '\u2630';
    }
}

function filterChats() {
    renderChatList();
}

function handleInputKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (state.isStreaming) {
            // Stop current and send new
            stopGeneration();
            setTimeout(() => sendMessage(), 200);
        } else {
            sendMessage();
        }
    }
    // Shift+Enter — новая строка (поведение по умолчанию textarea)
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// ═══ Generation Progress ════════════════════════════════════════════
let _progressInterval = null;
let _progressPercent = 0;

const PROGRESS_STAGES = [
    { pct: 5, text: 'Подключение к AI...' },
    { pct: 15, text: 'Анализ запроса...' },
    { pct: 30, text: 'Генерация ответа...' },
    { pct: 50, text: 'Написание кода...' },
    { pct: 70, text: 'Проверка качества...' },
    { pct: 85, text: 'Форматирование...' },
    { pct: 95, text: 'Завершение...' }
];

const PROGRESS_STAGES_ENHANCED = [
    { pct: 5, text: '🏗️ Architect — планирование архитектуры...' },
    { pct: 20, text: '🏗️ Architect — анализ задачи...' },
    { pct: 35, text: '💻 Coder — написание кода...' },
    { pct: 55, text: '💻 Coder — генерация решения...' },
    { pct: 70, text: '🔍 Reviewer — проверка кода...' },
    { pct: 85, text: '✅ QA — финальная проверка...' },
    { pct: 95, text: '✅ QA — завершение...' }
];

function showGenerationProgress(show) {
    const el = document.getElementById('generationProgress');
    const fill = document.getElementById('progressBarFill');
    const text = document.getElementById('progressText');
    if (!el) return;

    if (show) {
        el.classList.remove('hidden');
        _progressPercent = 0;
        fill.style.width = '0%';
        text.textContent = 'Инициализация...';

        const stages = state.settings.enhanced_mode ? PROGRESS_STAGES_ENHANCED : PROGRESS_STAGES;
        let stageIdx = 0;

        _progressInterval = setInterval(() => {
            if (stageIdx < stages.length) {
                _progressPercent = stages[stageIdx].pct;
                fill.style.width = _progressPercent + '%';
                text.textContent = stages[stageIdx].text;
                stageIdx++;
            }
        }, state.settings.enhanced_mode ? 3000 : 2000);
    } else {
        if (_progressInterval) {
            clearInterval(_progressInterval);
            _progressInterval = null;
        }
        fill.style.width = '100%';
        text.textContent = 'Готово!';
        setTimeout(() => {
            el.classList.add('hidden');
            fill.style.width = '0%';
        }, 800);
    }
}

function updateSendButton() {
    const btn = document.getElementById('sendBtn');
    btn.disabled = false; // Never disable — allow stop or new send
    if (state.isStreaming) {
        btn.classList.add('generating');
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
        btn.title = 'Остановить';
        btn.onclick = stopGeneration;
    } else {
        btn.classList.remove('generating');
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
        btn.title = 'Отправить';
        btn.onclick = sendMessage;
    }
}

function updateUI() {
    updateModelChips();
    updateEnhancedToggle();
    updateSettingsCards();
}

// ═══ Markdown Rendering ═════════════════════════════════════
function renderMarkdown(text) {
    if (!text) return '';

    // Escape HTML first
    let html = escapeHtml(text);

    // Code blocks with filename: ```lang filename.ext
    html = html.replace(/```(\w+)\s+([\w\-./]+\.\w+)\n([\s\S]*?)```/g, (match, lang, filename, code) => {
        const id = 'code-' + Math.random().toString(36).substr(2, 6);
        return `<div class="code-block">
            <div class="code-header">
                <span class="code-filename">📄 ${filename}</span>
                <div class="code-actions">
                    <button class="code-btn" onclick="copyCode('${id}')">📋 Copy</button>
                    <button class="code-btn" onclick="downloadCode('${id}', '${filename}')">⬇ ${filename.split('.').pop()}</button>
                    ${lang === 'html' ? `<button class="code-btn" onclick="previewCode('${id}')">👁 Preview</button>` : ''}
                </div>
            </div>
            <div class="code-content" id="${id}">${code}</div>
        </div>`;
    });

    // Generic code blocks: ```lang
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const id = 'code-' + Math.random().toString(36).substr(2, 6);
        return `<div class="code-block">
            <div class="code-header">
                <span class="code-filename">${lang || 'code'}</span>
                <div class="code-actions">
                    <button class="code-btn" onclick="copyCode('${id}')">📋 Copy</button>
                </div>
            </div>
            <div class="code-content" id="${id}">${code}</div>
        </div>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-code);padding:2px 6px;border-radius:4px;font-family:var(--font-mono);font-size:12px;">$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4 style="margin:12px 0 6px;font-size:14px;">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 style="margin:14px 0 8px;font-size:16px;">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 style="margin:16px 0 10px;font-size:18px;">$1</h2>');

    // Download links: [Скачать filename](/api/files/xxx/download)
    html = html.replace(/\[([^\]]*Скачать[^\]]*)\]\((\/api\/files\/[^)]+)\)/g,
        '<a href="$2" class="download-link" target="_blank" download>\u2B07 $1</a>');

    // File download links: [filename](/api/files/xxx/download)
    html = html.replace(/\[([^\]]+)\]\((\/api\/files\/[^)]+\/download)\)/g,
        '<a href="$2" class="download-link" target="_blank" download>\u{1F4E5} $1</a>');

    // File preview links: [Preview](/api/files/xxx/preview)
    html = html.replace(/\[([^\]]+)\]\((\/api\/files\/[^)]+\/preview)\)/g,
        '<a href="$2" class="preview-link" target="_blank">\u{1F441} $1</a>');

    // Markdown links: [text](url)
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" class="chat-link" target="_blank" rel="noopener">$1 \u2197</a>');

    // Auto-detect bare URLs and make them clickable
    html = html.replace(/(^|[^"=\/])(https?:\/\/[^\s<]+)/g,
        '$1<a href="$2" class="chat-link" target="_blank" rel="noopener">$2</a>');

    // Inline images from generated files: ![alt](/api/files/xxx/preview)
    html = html.replace(/!\[([^\]]*)\]\((\/api\/files\/[^)]+)\)/g,
        '<div class="generated-image"><img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:8px 0;"><br><a href="$2" download class="download-link">\u2B07 Скачать $1</a></div>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/^\*\*\*$/gm, '<hr>');

    // Markdown tables
    html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock) => {
        const rows = tableBlock.trim().split('\n').filter(r => r.trim());
        if (rows.length < 2) return tableBlock;
        
        // Check if second row is separator
        const isSeparator = /^\|[\s\-:|]+\|$/.test(rows[1]);
        if (!isSeparator) return tableBlock;
        
        let tableHtml = '<table>';
        // Header
        const headerCells = rows[0].split('|').filter((c, i, arr) => i > 0 && i < arr.length - 1);
        tableHtml += '<thead><tr>' + headerCells.map(c => `<th>${c.trim()}</th>`).join('') + '</tr></thead>';
        // Body
        tableHtml += '<tbody>';
        for (let i = 2; i < rows.length; i++) {
            const cells = rows[i].split('|').filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
            tableHtml += '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
        }
        tableHtml += '</tbody></table>';
        return tableHtml;
    });

    // Lists
    html = html.replace(/^[•\-] (.+)$/gm, '<div style="padding-left:16px;">• $1</div>');
    html = html.replace(/^\d+\. (.+)$/gm, '<div style="padding-left:16px;">$&</div>');

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

function renderAgentSteps(completed) {
    if (completed) {
        return `<div class="agent-status">
            <div class="agent-step done"><div class="dot"></div> 🏗️ Architect — планирование</div>
            <div class="agent-step done"><div class="dot"></div> 💻 Coder — написание кода</div>
            <div class="agent-step done"><div class="dot"></div> 🔍 Reviewer — проверка</div>
            <div class="agent-step done"><div class="dot"></div> ✅ QA — финальная проверка</div>
        </div>`;
    }
    return '';
}

// ═══ Code Actions ═══════════════════════════════════════════
function copyCode(id) {
    const el = document.getElementById(id);
    if (el) {
        navigator.clipboard.writeText(el.textContent).then(() => {
            toast('Код скопирован', 'success');
        });
    }
}

function downloadCode(id, filename) {
    const el = document.getElementById(id);
    if (el) {
        const blob = new Blob([el.textContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}

function previewCode(id) {
    const el = document.getElementById(id);
    if (el) {
        updatePreview(el.textContent);
    }
}

// ═══ Utilities ══════════════════════════════════════════════
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'только что';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
        if (diff < 172800000) return 'Вчера';

        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch {
        return '';
    }
}

function formatTokens(n) {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);

    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(100%)';
        setTimeout(() => el.remove(), 300);
    }, 3000);
}// ═══ Memory Tab ═══════════════════════════════════════════════════
async function loadMemoryTab() {
    try {
        const [statsData, searchData] = await Promise.all([
            api('/memory/stats').catch(() => ({})),
            api('/memory/search', { method: 'POST', body: JSON.stringify({ query: '', limit: 10 }) }).catch(() => ({ results: [] }))
        ]);

        // Render stats
        const statsEl = document.getElementById('memoryStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-card">
                    <div class="stat-card-value">${statsData.total_entries || 0}</div>
                    <div class="stat-card-label">Всего записей</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${statsData.total_tasks || 0}</div>
                    <div class="stat-card-label">Задач</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${statsData.total_solutions || 0}</div>
                    <div class="stat-card-label">Решений</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${statsData.total_errors || 0}</div>
                    <div class="stat-card-label">Ошибок</div>
                </div>
            `;
        }

        // Render recent episodes
        const episodesEl = document.getElementById('memoryEpisodes');
        if (episodesEl && searchData.results) {
            if (searchData.results.length === 0) {
                episodesEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted)">Память пуста. Начните работу с агентом!</div>';
            } else {
                episodesEl.innerHTML = searchData.results.map(ep => `
                    <div class="settings-card" style="cursor:default;margin-bottom:8px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                            <strong style="font-size:13px;">${escapeHtml(ep.task || '')}</strong>
                            <span style="font-size:11px;color:var(--text-muted);">${ep.timestamp ? formatTime(ep.timestamp) : ''}</span>
                        </div>
                        <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml((ep.result_preview || '').substring(0, 100))}</div>
                        <div style="display:flex;gap:8px;margin-top:4px;font-size:11px;">
                            <span style="color:${ep.success ? 'var(--accent-green)' : 'var(--accent-red)'}">${ep.success ? '✅ Успешно' : '❌ Ошибка'}</span>
                            <span style="color:var(--text-muted)">$${(ep.cost || 0).toFixed(4)}</span>
                            <span style="color:var(--text-muted)">${ep.variant || ''}</span>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        console.error('Memory tab error:', e);
    }
}

async function searchMemory() {
    const query = document.getElementById('memorySearchQuery')?.value?.trim();
    if (!query) { toast('Введите запрос для поиска', 'info'); return; }

    const resultsEl = document.getElementById('memorySearchResults');
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-muted)">🔍 Поиск...</div>';

    try {
        const data = await api('/memory/search', {
            method: 'POST',
            body: JSON.stringify({ query, limit: 10 })
        });

        const allResults = [...(data.results || []), ...(data.vector_results || [])];
        if (allResults.length === 0) {
            resultsEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-muted)">Ничего не найдено</div>';
            return;
        }

        resultsEl.innerHTML = allResults.map(r => `
            <div style="padding:8px;border-bottom:1px solid var(--border-color);">
                <div style="font-size:13px;font-weight:600;">${escapeHtml(r.task || r.content || '')}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${escapeHtml((r.result_preview || '').substring(0, 150))}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                    Источник: ${r.source || 'episodic'} • Релевантность: ${r.relevance || r.score || '?'}
                </div>
            </div>
        `).join('');
    } catch (e) {
        resultsEl.innerHTML = `<div style="color:var(--accent-red);padding:8px;">Ошибка: ${e.message}</div>`;
    }
}

// ═══ Versions Tab ═════════════════════════════════════════════════
async function loadVersionsTab() {
    try {
        const [filesData, statsData] = await Promise.all([
            api('/versions/files').catch(() => ({ files: [] })),
            api('/versions/stats').catch(() => ({}))
        ]);

        // Render stats
        const statsEl = document.getElementById('versionStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-card">
                    <div class="stat-card-value">${statsData.total_files || 0}</div>
                    <div class="stat-card-label">Файлов</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${statsData.total_versions || 0}</div>
                    <div class="stat-card-label">Версий</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${statsData.total_rollbacks || 0}</div>
                    <div class="stat-card-label">Откатов</div>
                </div>
            `;
        }

        // Render files list
        const filesEl = document.getElementById('versionedFilesList');
        if (filesEl) {
            if (!filesData.files || filesData.files.length === 0) {
                filesEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted)">Нет версионированных файлов. Агент автоматически сохраняет версии при изменении файлов.</div>';
            } else {
                filesEl.innerHTML = `<table class="admin-table">
                    <thead><tr><th>Хост</th><th>Файл</th><th>Версий</th><th>Действия</th></tr></thead>
                    <tbody>${filesData.files.map(f => `<tr>
                        <td style="font-size:12px">${escapeHtml(f.host || '')}</td>
                        <td style="font-family:var(--font-mono);font-size:12px">${escapeHtml(f.path || '')}</td>
                        <td style="text-align:center">${f.versions || 0}</td>
                        <td><button class="admin-btn" onclick="loadFileHistory('${escapeHtml(f.host)}', '${escapeHtml(f.path)}')">History</button></td>
                    </tr>`).join('')}</tbody>
                </table>`;
            }
        }
    } catch (e) {
        console.error('Versions tab error:', e);
    }
}

async function loadFileHistory(host, path) {
    const section = document.getElementById('versionHistorySection');
    const historyEl = document.getElementById('versionHistory');
    section.style.display = 'block';
    historyEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-muted)">Загрузка...</div>';

    try {
        const data = await api(`/versions/history?host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}`);
        if (!data.history || data.history.length === 0) {
            historyEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-muted)">Нет истории</div>';
            return;
        }

        historyEl.innerHTML = `<table class="admin-table">
            <thead><tr><th>Версия</th><th>Дата</th><th>Размер</th><th>Действия</th></tr></thead>
            <tbody>${data.history.map(v => `<tr>
                <td>v${v.version}</td>
                <td style="font-size:12px">${v.timestamp ? formatTime(v.timestamp) : ''}</td>
                <td>${v.size || '?'} B</td>
                <td>
                    ${v.version > 1 ? `<button class="admin-btn" onclick="showVersionDiff('${encodeURIComponent(host)}', '${encodeURIComponent(path)}', ${v.version - 1}, ${v.version})">🔍 Diff</button>` : ''}
                    <button class="admin-btn" onclick="rollbackVersion('${encodeURIComponent(host)}', '${encodeURIComponent(path)}', ${v.version})">↩️ Rollback</button>
                </td>
            </tr>`).join('')}</tbody>
        </table>`;
    } catch (e) {
        historyEl.innerHTML = `<div style="color:var(--accent-red);padding:8px;">Ошибка: ${e.message}</div>`;
    }
}

async function showVersionDiff(host, path, fromV, toV) {
    const section = document.getElementById('versionDiffSection');
    const diffEl = document.getElementById('versionDiff');
    section.style.display = 'block';
    diffEl.textContent = 'Загрузка diff...';

    try {
        const data = await api(`/versions/diff?host=${host}&path=${path}&from=${fromV}&to=${toV}`);
        diffEl.innerHTML = escapeHtml(data.diff || 'Нет изменений')
            .replace(/^(\+.*)$/gm, '<span style="color:var(--accent-green)">$1</span>')
            .replace(/^(\-.*)$/gm, '<span style="color:var(--accent-red)">$1</span>')
            .replace(/^(@@.*)$/gm, '<span style="color:var(--accent-primary)">$1</span>');
    } catch (e) {
        diffEl.textContent = 'Ошибка: ' + e.message;
    }
}

async function rollbackVersion(host, path, version) {
    if (!confirm(`Откатить файл к версии v${version}?`)) return;

    try {
        await api('/versions/rollback', {
            method: 'POST',
            body: JSON.stringify({ host: decodeURIComponent(host), path: decodeURIComponent(path), version })
        });
        toast(`Файл откачен к v${version}`, 'success');
        loadVersionsTab();
    } catch (e) {
        toast('Ошибка отката: ' + e.message, 'error');
    }
}

// ═══ Message Actions ═════════════════════════════════════════════
function copyMessageContent(msgId) {
    const el = document.getElementById(`${msgId}-content`);
    if (!el) return;
    const text = el.innerText || el.textContent;
    navigator.clipboard.writeText(text).then(() => {
        // Visual feedback
        const btn = el.closest('.message-body')?.querySelector('.msg-action-btn');
        if (btn) {
            const origHtml = btn.innerHTML;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg><span>Скопировано!</span>';
            btn.classList.add('copied');
            setTimeout(() => { btn.innerHTML = origHtml; btn.classList.remove('copied'); }, 1500);
        }
        toast('Текст скопирован', 'success');
    });
}

function regenerateMessage() {
    if (!state.currentChat || !state.currentChat.messages) return;
    // Find last user message
    const messages = state.currentChat.messages;
    let lastUserMsg = '';
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            lastUserMsg = messages[i].content;
            break;
        }
    }
    if (lastUserMsg) {
        document.getElementById('chatInput').value = lastUserMsg;
        sendMessage();
    } else {
        toast('Нет сообщения для перегенерации', 'error');
    }
}

// ═══ Drag & Drop File Upload ═════════════════════════════════════
function initDragDrop() {
    const chatArea = document.getElementById('chatMessages');
    const inputWrapper = document.querySelector('.input-wrapper');
    if (!chatArea) return;

    let dragCounter = 0;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'dragDropOverlay';
    overlay.className = 'drag-drop-overlay hidden';
    overlay.innerHTML = `
        <div class="drag-drop-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p>Перетащите файлы сюда</p>
            <span>PDF, DOCX, XLSX, изображения, код и другие файлы</span>
        </div>
    `;
    document.querySelector('.chat-container')?.appendChild(overlay) || document.body.appendChild(overlay);

    // Prevent default drag behaviors on document
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        document.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    // Show overlay on drag enter
    document.addEventListener('dragenter', (e) => {
        dragCounter++;
        if (e.dataTransfer?.types?.includes('Files')) {
            overlay.classList.remove('hidden');
        }
    });

    document.addEventListener('dragleave', (e) => {
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            overlay.classList.add('hidden');
        }
    });

    // Handle drop
    document.addEventListener('drop', (e) => {
        dragCounter = 0;
        overlay.classList.add('hidden');

        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        // Use existing file input to trigger upload
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            // Create a new DataTransfer to set files
            const dt = new DataTransfer();
            for (const f of files) {
                dt.items.add(f);
            }
            fileInput.files = dt.files;
            handleFileUpload(fileInput);
        }
    });

    // Also allow paste files
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const files = [];
        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }

        if (files.length > 0) {
            e.preventDefault();
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                const dt = new DataTransfer();
                files.forEach(f => dt.items.add(f));
                fileInput.files = dt.files;
                handleFileUpload(fileInput);
            }
        }
    });
}

// ═══ Canvas Functions ═════════════════════════════════════════════════════════
let _currentCanvasId = null;

async function loadCanvasTab() {
    try {
        const data = await api('/canvas?user_id=default');
        const list = document.getElementById('canvasList');
        const editor = document.getElementById('canvasEditor');
        if (!list) return;
        editor?.classList.add('hidden');
        list.classList.remove('hidden');

        const canvases = data.canvases || [];
        if (canvases.length === 0) {
            list.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><h3>Нет Canvas документов</h3><p>Создайте первый документ для итеративной работы с AI</p></div>';
            return;
        }
        list.innerHTML = canvases.map(c => `
            <div class="canvas-card" onclick="openCanvas('${c.id}')">
                <div class="canvas-card-icon">${c.canvas_type === 'code' ? '💻' : c.canvas_type === 'markdown' ? '📝' : '📄'}</div>
                <div class="canvas-card-info">
                    <div class="canvas-card-title">${c.title || 'Без названия'}</div>
                    <div class="canvas-card-meta">${c.canvas_type} • ${new Date(c.updated_at || c.created_at).toLocaleDateString('ru')}</div>
                </div>
                <button class="canvas-card-delete" onclick="event.stopPropagation(); deleteCanvas('${c.id}')" title="Удалить">🗑️</button>
            </div>
        `).join('');
    } catch (e) {
        console.error('Canvas load error:', e);
    }
}

async function createNewCanvas() {
    _currentCanvasId = null;
    const editor = document.getElementById('canvasEditor');
    const list = document.getElementById('canvasList');
    if (editor && list) {
        list.classList.add('hidden');
        editor.classList.remove('hidden');
        document.getElementById('canvasTitle').value = '';
        document.getElementById('canvasContent').value = '';
        document.getElementById('canvasType').value = 'document';
    }
}

async function openCanvas(canvasId) {
    try {
        const data = await api(`/canvas/${canvasId}?user_id=default`);
        if (data.success && data.canvas) {
            _currentCanvasId = canvasId;
            const editor = document.getElementById('canvasEditor');
            const list = document.getElementById('canvasList');
            list.classList.add('hidden');
            editor.classList.remove('hidden');
            document.getElementById('canvasTitle').value = data.canvas.title || '';
            document.getElementById('canvasContent').value = data.canvas.content || '';
            document.getElementById('canvasType').value = data.canvas.canvas_type || 'document';
        }
    } catch (e) {
        toast('Ошибка загрузки Canvas: ' + e.message, 'error');
    }
}

async function saveCanvas() {
    const title = document.getElementById('canvasTitle').value || 'Без названия';
    const content = document.getElementById('canvasContent').value;
    const canvasType = document.getElementById('canvasType').value;
    try {
        if (_currentCanvasId) {
            await api(`/canvas/${_currentCanvasId}`, 'PUT', { title, content, canvas_type: canvasType, user_id: 'default' });
        } else {
            const data = await api('/memory', 'POST', { key: `canvas_${Date.now()}`, value: JSON.stringify({ title, content, canvas_type: canvasType }), category: 'canvas', user_id: 'default' });
            // Use canvas_create via the agent or direct API
            const result = await api(`/canvas/new`, 'PUT', { title, content, canvas_type: canvasType, user_id: 'default' });
            if (result.canvas_id) _currentCanvasId = result.canvas_id;
        }
        toast('✅ Canvas сохранён', 'success');
    } catch (e) {
        toast('Ошибка сохранения: ' + e.message, 'error');
    }
}

function backToCanvasList() {
    _currentCanvasId = null;
    document.getElementById('canvasEditor')?.classList.add('hidden');
    document.getElementById('canvasList')?.classList.remove('hidden');
    loadCanvasTab();
}

async function deleteCanvas(canvasId) {
    if (!confirm('Удалить Canvas?')) return;
    try {
        await api(`/canvas/${canvasId}?user_id=default`, 'DELETE');
        toast('✅ Canvas удалён', 'success');
        loadCanvasTab();
    } catch (e) {
        toast('Ошибка удаления: ' + e.message, 'error');
    }
}

async function canvasAiEdit() {
    const prompt = document.getElementById('canvasAiPrompt')?.value;
    const content = document.getElementById('canvasContent')?.value;
    if (!prompt) return;
    toast('🤖 AI редактирует...', 'info');
    // Send to chat as a message with canvas context
    const msg = `Отредактируй следующий документ по инструкции: ${prompt}\n\nДокумент:\n${content}`;
    switchTab('chat');
    document.getElementById('userInput').value = msg;
    sendMessage();
    document.getElementById('canvasAiPrompt').value = '';
}

// ═══ Templates Functions ═══════════════════════════════════════════════════════
let _allTemplates = [];

async function loadTemplatesTab() {
    try {
        const data = await api('/templates');
        _allTemplates = data.templates || [];
        renderTemplates(_allTemplates);
    } catch (e) {
        console.error('Templates load error:', e);
        // Fallback to hardcoded templates
        _allTemplates = [
            {id: 'code_review', name: '🔍 Code Review', prompt: 'Проанализируй код и найди проблемы:', category: 'dev'},
            {id: 'deploy', name: '🚀 Deploy', prompt: 'Задеплой проект на сервер:', category: 'dev'},
            {id: 'debug', name: '🐛 Debug', prompt: 'Найди и исправь ошибку:', category: 'dev'},
            {id: 'analyze_data', name: '📊 Анализ данных', prompt: 'Проанализируй данные и построй графики:', category: 'analytics'},
            {id: 'write_report', name: '📝 Отчёт', prompt: 'Создай профессиональный отчёт:', category: 'analytics'},
            {id: 'research', name: '🔍 Исследование', prompt: 'Проведи исследование:', category: 'analytics'},
            {id: 'create_landing', name: '🌐 Лендинг', prompt: 'Создай красивый лендинг:', category: 'creative'},
            {id: 'create_design', name: '🎨 Дизайн', prompt: 'Создай профессиональный дизайн:', category: 'creative'},
            {id: 'server_audit', name: '🛡️ Аудит сервера', prompt: 'Проведи аудит безопасности:', category: 'devops'},
            {id: 'setup_ci_cd', name: '⚙️ CI/CD', prompt: 'Настрой CI/CD пайплайн:', category: 'devops'},
            {id: 'monitoring', name: '📊 Мониторинг', prompt: 'Настрой мониторинг:', category: 'devops'}
        ];
        renderTemplates(_allTemplates);
    }
}

function renderTemplates(templates) {
    const grid = document.getElementById('templatesList');
    if (!grid) return;
    grid.innerHTML = templates.map(t => `
        <div class="template-card" onclick="useTemplate('${t.id}')">
            <div class="template-card-name">${t.name}</div>
            <div class="template-card-prompt">${t.prompt}</div>
            <div class="template-card-category">${t.category}</div>
        </div>
    `).join('');
}

function filterTemplates(category) {
    document.querySelectorAll('.template-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(category) || (category === 'all' && btn.textContent === 'Все'));
    });
    if (category === 'all') {
        renderTemplates(_allTemplates);
    } else {
        renderTemplates(_allTemplates.filter(t => t.category === category));
    }
}

function useTemplate(templateId) {
    const template = _allTemplates.find(t => t.id === templateId);
    if (!template) return;
    switchTab('chat');
    createNewChat();
    setTimeout(() => {
        const input = document.getElementById('userInput');
        if (input) {
            input.value = template.prompt + ' ';
            input.focus();
            autoResize(input);
        }
    }, 300);
}

// ═══ Enhanced Analytics with Charts ═══════════════════════════════════════════
async function loadUsageAnalytics() {
    try {
        const data = await api('/analytics/usage?user_id=default');
        if (data.success && data.analytics) {
            const a = data.analytics;
            const container = document.getElementById('usageAnalyticsContainer');
            if (container) {
                container.innerHTML = `
                    <div class="analytics-card">
                        <div class="analytics-card-value">${a.total_chats}</div>
                        <div class="analytics-card-label">Всего чатов</div>
                    </div>
                    <div class="analytics-card">
                        <div class="analytics-card-value">${a.total_messages}</div>
                        <div class="analytics-card-label">Всего сообщений</div>
                    </div>
                    <div class="analytics-card">
                        <div class="analytics-card-value">${Object.keys(a.tool_usage || {}).length}</div>
                        <div class="analytics-card-label">Использовано инструментов</div>
                    </div>
                `;
            }
        }
    } catch (e) {
        console.error('Usage analytics error:', e);
    }
}

// ═══ Keyboard Shortcuts (Command Palette) ═══════════════════════════════════
document.addEventListener('keydown', (e) => {
    // Ctrl+K or Cmd+K — focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const search = document.getElementById('chatSearch');
        if (search) { search.focus(); search.select(); }
    }
    // Ctrl+N or Cmd+N — new chat
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewChat();
    }
    // Escape — close modals, back from canvas
    if (e.key === 'Escape') {
        const modal = document.querySelector('.modal.active, .modal-overlay.active');
        if (modal) modal.click();
        // Close lightbox if open
        const lightbox = document.getElementById('imageLightbox');
        if (lightbox && !lightbox.classList.contains('hidden')) {
            lightbox.classList.add('hidden');
        }
    }
    // Ctrl+Shift+E — export chat
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        exportCurrentChat();
    }
});
// ═══ PWA Registration ═════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ═══ Init ═════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // Init theme from localStorage
    const savedTheme = localStorage.getItem('sa_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeButton();

    // Init login canvas particles (only if login visible)
    initLoginCanvas();

    // Init scroll watcher
    initScrollWatcher();

    // Init drag & drop file upload
    initDragDrop();

    if (state.token && state.user) {
        // Token exists — show app immediately (no flash)
        showApp();
        loadChats();

        // Verify token in background
        api('/auth/me').then(data => {
            state.user = data.user || state.user;
            localStorage.setItem('sa_user', JSON.stringify(state.user));
        }).catch(() => {
            // Token expired — redirect to login
            state.token = '';
            state.user = null;
            localStorage.removeItem('sa_token');
            localStorage.removeItem('sa_user');
            showLogin();
        });
    } else {
        showLogin();
    }
});
