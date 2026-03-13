/**
 * Super Agent v4.0 — Frontend Application
 * Автономный AI-инженер с мультиагентной системой
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

// ═══ Auth ════════════════════════════════════════════════════
async function doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    if (!email || !password) {
        errorEl.textContent = 'Введите email и пароль';
        errorEl.style.display = 'block';
        return;
    }

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
        toast('Добро пожаловать!', 'success');
    } catch (e) {
        errorEl.textContent = e.message || 'Ошибка входа';
        errorEl.style.display = 'block';
    }
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

        return `<div class="chat-item ${isActive ? 'active' : ''}" onclick="openChat('${c.id}')">
            <div class="chat-item-title">${escapeHtml(c.title)}</div>
            <div class="chat-item-meta">
                <span>${time}</span>
                <span class="chat-item-cost">$${c.total_cost.toFixed(2)}</span>
                <span class="chat-item-model">${variantEmoji}</span>
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

async function deleteChat(chatId, event) {
    event.stopPropagation();
    if (!confirm('Удалить этот чат?')) return;

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
    }
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
            return `<div class="message assistant">
                <div class="message-avatar">SA</div>
                <div class="message-body">
                    ${msg.enhanced ? renderAgentSteps(true) : ''}
                    <div class="message-content">${rendered}</div>
                    <div class="message-meta">
                        <span>${variantEmoji} ${msg.model || 'AI'}</span>
                        <span>•</span>
                        <span>${formatTime(msg.timestamp)}</span>
                        ${msg.cost ? `<span>•</span><span class="message-cost">$${msg.cost.toFixed(4)}</span>` : ''}
                    </div>
                </div>
            </div>`;
        }
    }).join('');

    container.scrollTop = container.scrollHeight;
}

// ═══ Send Message ═══════════════════════════════════════════
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message || state.isStreaming) return;

    // Create chat if needed
    if (!state.currentChat) {
        await createNewChat();
    }

    const chatId = state.currentChat.id;
    state.isStreaming = true;
    updateSendButton();

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

    // Stream response
    let fullContent = '';
    let currentAgent = '';

    try {
        const resp = await fetch(`${API}/chats/${chatId}/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ message, file_content: state._pendingFileContent || '' })
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

                    if (event.type === 'agent_start') {
                        currentAgent = event.role;
                        const stepEl = document.querySelector(`#${assistantId}-steps [data-role="${event.role}"]`);
                        if (stepEl) stepEl.classList.add('active');
                    }

                    if (event.type === 'agent_complete') {
                        const stepEl = document.querySelector(`#${assistantId}-steps [data-role="${event.role}"]`);
                        if (stepEl) {
                            stepEl.classList.remove('active');
                            stepEl.classList.add('done');
                        }
                    }

                    if (event.type === 'content') {
                        fullContent += event.text;
                        const contentEl = document.getElementById(`${assistantId}-content`);
                        contentEl.innerHTML = renderMarkdown(fullContent);
                        container.scrollTop = container.scrollHeight;
                    }

                    if (event.type === 'done') {
                        const metaEl = document.getElementById(`${assistantId}-meta`);
                        const variantEmoji = state.settings.variant === 'original' ? '🔴' : state.settings.variant === 'budget' ? '🔵' : '🟢';
                        metaEl.innerHTML = `
                            <span>${variantEmoji} ${event.model || 'AI'}</span>
                            <span>•</span>
                            <span>сейчас</span>
                            <span>•</span>
                            <span class="message-cost">$${(event.cost || 0).toFixed(4)}</span>
                        `;

                        // Update preview if HTML found
                        const htmlMatch = fullContent.match(/```html[\s\S]*?\n([\s\S]*?)```/);
                        if (htmlMatch) {
                            updatePreview(htmlMatch[1]);
                        }
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
    }

    state.isStreaming = false;
    updateSendButton();
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

async function handleFileUpload(input) {
    const files = input.files;
    if (!files.length) return;

    const formData = new FormData();
    for (const f of files) {
        formData.append('file', f);
    }

    toast('Загрузка файлов...', 'info');

    try {
        const resp = await fetch(`${API}/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` },
            body: formData
        });

        const data = await resp.json();
        if (data.content) {
            state._pendingFileContent = data.content;
            toast(`Загружено ${data.file_count} файл(ов). Напишите задачу.`, 'success');
        }
    } catch (e) {
        toast('Ошибка загрузки: ' + e.message, 'error');
    }

    input.value = '';
}

// ═══ Settings ═══════════════════════════════════════════════
function setVariant(variant) {
    state.settings.variant = variant;
    updateModelChips();
    updateSettingsCards();
    saveSettingsQuiet();
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
    try {
        await api('/settings', {
            method: 'PUT',
            body: JSON.stringify(state.settings)
        });
        toast('Настройки сохранены', 'success');
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

function updateModelChips() {
    document.querySelectorAll('.model-chip').forEach(el => {
        el.classList.toggle('active', el.dataset.variant === state.settings.variant);
    });
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
            <div class="stat-card-value">$${u.total_cost.toFixed(2)}</div>
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
                        <td class="message-cost">$${c.cost.toFixed(4)}</td>
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
        const [statsData, usersData] = await Promise.all([
            api('/admin/stats'),
            api('/admin/users')
        ]);
        renderAdminStats(statsData);
        renderUsersTable(usersData.users);
    } catch (e) {
        document.getElementById('usersTable').innerHTML =
            '<div style="padding:20px;text-align:center;color:var(--text-muted)">Нет доступа к админ-панели</div>';
    }
}

function renderAdminStats(data) {
    const grid = document.getElementById('adminStatsGrid');
    grid.innerHTML = `
        <div class="stat-card">
            <div class="stat-card-value">$${(data.total_cost || 0).toFixed(2)}</div>
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

    container.innerHTML = `
        <table class="admin-table">
            <thead><tr>
                <th>Email</th><th>Имя</th><th>Роль</th><th>Расход</th><th>Лимит</th><th>Статус</th><th>Действия</th>
            </tr></thead>
            <tbody>
                ${users.map(u => `<tr>
                    <td>${escapeHtml(u.email)}</td>
                    <td>${escapeHtml(u.name)}</td>
                    <td>${u.role}</td>
                    <td>$${u.total_spent.toFixed(2)}</td>
                    <td>$${u.monthly_limit}</td>
                    <td><span class="status-badge ${u.is_active ? 'status-active' : 'status-blocked'}">${u.is_active ? '✅ Активен' : '🚫 Заблокирован'}</span></td>
                    <td>
                        <button class="admin-btn ${u.is_active ? 'danger' : ''}" onclick="toggleUser('${u.id}')">
                            ${u.is_active ? '🔒 Блок' : '🔓 Разблок'}
                        </button>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>
    `;
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

    if (!email || !password) {
        toast('Заполните email и пароль', 'error');
        return;
    }

    try {
        await api('/admin/users', {
            method: 'POST',
            body: JSON.stringify({ email, name, password, monthly_limit: limit })
        });
        closeModal('createUserModal');
        loadAdmin();
        toast('Пользователь создан', 'success');
    } catch (e) {
        toast('Ошибка: ' + e.message, 'error');
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
            <div class="console-line info"><span class="prefix">✓</span> Super Agent v4.0 активен</div>
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
    document.getElementById('tabAnalytics').classList.toggle('hidden', tab !== 'analytics');
    document.getElementById('tabAdmin').classList.toggle('hidden', tab !== 'admin');
    document.getElementById('modelChipsBar').classList.toggle('hidden', tab !== 'chat');

    // Load data for tabs
    if (tab === 'analytics') loadAnalytics();
    if (tab === 'admin') loadAdmin();
    if (tab === 'settings') updateSettingsCards();
}

function toggleSidebar() {
    state.sidebarOpen = !state.sidebarOpen;
    const sidebar = document.getElementById('sidebar');

    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('open', state.sidebarOpen);
    } else {
        sidebar.classList.toggle('collapsed', !state.sidebarOpen);
    }
}

function filterChats() {
    renderChatList();
}

function handleInputKey(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        sendMessage();
    }
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function updateSendButton() {
    const btn = document.getElementById('sendBtn');
    btn.disabled = state.isStreaming;
    btn.innerHTML = state.isStreaming ? '⏳ Генерация...' : '▶ Отправить';
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

    // Lists
    html = html.replace(/^[•\-] (.+)$/gm, '<div style="padding-left:16px;">• $1</div>');
    html = html.replace(/^\d+\. (.+)$/gm, '<div style="padding-left:16px;">$&</div>');

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
}

// ═══ Init ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    if (state.token && state.user) {
        showApp();
        loadChats();
    } else {
        showLogin();
    }

    // Enter key on login
    document.getElementById('loginPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
    });
});
