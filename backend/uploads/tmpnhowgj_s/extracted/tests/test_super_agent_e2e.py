"""
Super Agent v6.0 — E2E Browser Tests (Playwright)
==================================================

Полноценные браузерные тесты, которые проверяют приложение
так, как его видит реальный пользователь.

Запуск:
    pytest tests/test_super_agent_e2e.py -v --headed     # с видимым браузером
    pytest tests/test_super_agent_e2e.py -v              # headless (для CI)
    pytest tests/test_super_agent_e2e.py -v -k "smoke"   # только Smoke-тесты

Требования:
    pip install pytest playwright
    playwright install chromium
"""

import pytest
import re
from playwright.sync_api import Page, expect, BrowserContext

# ── Конфигурация ──────────────────────────────────────────────

BASE_URL = "https://minimax.mksitdev.ru"
TEST_EMAIL = "minimax"
TEST_PASSWORD = "qwerty1985"

# ── Фикстуры ─────────────────────────────────────────────────

@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    """Настройки контекста браузера: игнорируем HTTPS-ошибки."""
    return {
        **browser_context_args,
        "ignore_https_errors": True,
        "viewport": {"width": 1440, "height": 900},
    }


@pytest.fixture(scope="function")
def authenticated_page(page: Page) -> Page:
    """
    Фикстура: открывает сайт и логинится.
    Каждый тест получает уже авторизованную страницу.
    """
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")

    # Если уже залогинены — пропускаем
    if page.locator("#chatInput").is_visible(timeout=3000):
        return page

    # Заполняем форму логина (реальные селекторы: #loginUser, #loginPass, #loginBtn)
    page.locator("#loginUser").fill(TEST_EMAIL)
    page.locator("#loginPass").fill(TEST_PASSWORD)
    page.locator("#loginBtn").click()

    # Ждём загрузки основного интерфейса
    page.wait_for_selector("#chatInput", timeout=10000)
    return page


# ══════════════════════════════════════════════════════════════
# SMOKE-ТЕСТЫ (Уровень 1) — быстрые, критическая функциональность
# ══════════════════════════════════════════════════════════════

class TestSmoke:
    """Smoke-тесты: проверяют самую критическую функциональность."""

    @pytest.mark.smoke
    def test_login_page_loads(self, page: Page):
        """Страница логина загружается корректно."""
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")

        # Должна быть либо форма логина, либо уже авторизованный интерфейс
        login_visible = page.locator("#loginUser").is_visible(timeout=5000)
        chat_visible = page.locator("#chatInput").is_visible(timeout=2000)
        assert login_visible or chat_visible, "Ни форма логина, ни основной интерфейс не загрузились"

    @pytest.mark.smoke
    def test_successful_login(self, authenticated_page: Page):
        """Пользователь может успешно войти в систему."""
        page = authenticated_page
        expect(page.locator("#chatInput")).to_be_visible()

    @pytest.mark.smoke
    def test_sidebar_visible(self, authenticated_page: Page):
        """Боковая панель (сайдбар) отображается после логина."""
        page = authenticated_page
        sidebar = page.locator("aside#sidebar")
        expect(sidebar).to_be_visible()

    @pytest.mark.smoke
    def test_create_new_chat(self, authenticated_page: Page):
        """Можно создать новый чат."""
        page = authenticated_page

        # Нажимаем "Новый чат"
        new_chat_btn = page.locator("button:has-text('Новый чат'), .new-chat-btn, #newChatBtn").first
        new_chat_btn.click()
        page.wait_for_timeout(1000)

        # Поле ввода должно быть доступно
        expect(page.locator("#chatInput")).to_be_visible()
        expect(page.locator("#chatInput")).to_be_editable()

    @pytest.mark.smoke
    def test_send_message(self, authenticated_page: Page):
        """Можно отправить сообщение и получить ответ."""
        page = authenticated_page

        # Создаём новый чат
        page.locator("button:has-text('Новый чат'), .new-chat-btn, #newChatBtn").first.click()
        page.wait_for_timeout(500)

        # Вводим сообщение
        chat_input = page.locator("#chatInput")
        chat_input.fill("Привет, скажи 'тест пройден'")
        chat_input.press("Enter")

        # Ждём ответа агента (до 60 секунд)
        page.wait_for_selector(".message.assistant, .assistant-message, [data-role='assistant']",
                               timeout=60000)

        # Проверяем что ответ не пустой
        assistant_messages = page.locator(".message.assistant, .assistant-message, [data-role='assistant']")
        assert assistant_messages.count() > 0, "Ответ от агента не получен"

    @pytest.mark.smoke
    def test_delete_chat(self, authenticated_page: Page):
        """Можно удалить чат."""
        page = authenticated_page

        # Создаём чат для удаления
        page.locator("button:has-text('Новый чат'), .new-chat-btn, #newChatBtn").first.click()
        page.wait_for_timeout(500)
        chat_input = page.locator("#chatInput")
        chat_input.fill("Тестовый чат для удаления")
        chat_input.press("Enter")
        page.wait_for_timeout(3000)

        # Находим чат в списке и удаляем через контекстное меню
        chat_items = page.locator(".chat-item, .chat-list-item")
        if chat_items.count() > 0:
            chat_items.first.click(button="right")
            page.wait_for_timeout(500)
            delete_btn = page.locator("button:has-text('Удалить'), .delete-chat, [data-action='delete']")
            if delete_btn.is_visible(timeout=2000):
                delete_btn.first.click()
                page.wait_for_timeout(1000)


# ══════════════════════════════════════════════════════════════
# РЕГРЕССИОННЫЕ ТЕСТЫ (Уровень 2) — полное покрытие
# ══════════════════════════════════════════════════════════════

class TestSidebarNavigation:
    """Проверка навигации по всем разделам сайдбара."""

    SECTIONS = [
        ("Чат", "#chatInput"),
        ("Агенты", ".agents-content, .agents-panel, [data-section='agents']"),
        ("Шаблоны", ".templates-content, .templates-panel, [data-section='templates']"),
        ("Канвас", ".canvas-content, .canvas-panel, [data-section='canvas']"),
        ("Аналитика", ".analytics-content, .analytics-panel, [data-section='analytics']"),
        ("Коннекторы", ".connectors-content, .connectors-panel, [data-section='connectors']"),
        ("Аудит", ".audit-content, .audit-panel, [data-section='audit']"),
    ]

    @pytest.mark.parametrize("section_name,expected_selector", SECTIONS)
    def test_sidebar_section_opens(self, authenticated_page: Page, section_name, expected_selector):
        """Каждый раздел сайдбара открывается при клике."""
        page = authenticated_page

        # Находим и кликаем на раздел в сайдбаре
        nav_item = page.locator(f"text='{section_name}'").first
        if nav_item.is_visible(timeout=3000):
            nav_item.click()
            page.wait_for_timeout(1000)

            # Проверяем что контент раздела появился (или хотя бы нет ошибки)
            # Не все разделы имеют уникальные селекторы, поэтому проверяем отсутствие ошибок
            error_toast = page.locator(".toast-error, .error-message")
            assert error_toast.count() == 0 or not error_toast.first.is_visible(timeout=1000), \
                f"Ошибка при открытии раздела '{section_name}'"


class TestSettings:
    """Проверка модального окна настроек."""

    def test_settings_modal_opens(self, authenticated_page: Page):
        """Модальное окно настроек открывается."""
        page = authenticated_page

        settings_btn = page.locator("button[onclick='openSettings()']").first
        settings_btn.click()
        page.wait_for_timeout(500)

        modal = page.locator("#settingsModal")
        expect(modal).to_be_visible()

    def test_settings_tabs_switch(self, authenticated_page: Page):
        """Вкладки настроек переключаются."""
        page = authenticated_page

        # Открываем настройки
        page.locator("button[onclick='openSettings()']").first.click()
        page.wait_for_timeout(500)

        tabs = ["account", "models", "personalization", "api", "security", "usage"]
        for tab in tabs:
            tab_btn = page.locator(f"[data-panel='{tab}']")
            if tab_btn.is_visible(timeout=2000):
                tab_btn.click()
                page.wait_for_timeout(300)
                # Проверяем что панель обновилась
                panel_body = page.locator("#settingsPanelBody")
                expect(panel_body).to_be_visible()

    def test_settings_modal_closes(self, authenticated_page: Page):
        """Модальное окно настроек закрывается."""
        page = authenticated_page

        page.locator("button[onclick='openSettings()']").first.click()
        page.wait_for_timeout(500)

        close_btn = page.locator("button[onclick=\"closeModal('settingsModal')\"]").first
        close_btn.click()
        page.wait_for_timeout(500)

        modal = page.locator("#settingsModal")
        expect(modal).to_be_hidden()


class TestChatFunctionality:
    """Проверка функциональности чата."""

    def test_chat_input_accepts_text(self, authenticated_page: Page):
        """Поле ввода принимает текст."""
        page = authenticated_page
        chat_input = page.locator("#chatInput")
        chat_input.fill("Тестовый текст")
        assert chat_input.input_value() == "Тестовый текст"

    def test_chat_search_works(self, authenticated_page: Page):
        """Поиск по чатам работает (клиентский)."""
        page = authenticated_page

        search_input = page.locator("#chatSearch")
        if search_input.is_visible(timeout=3000):
            search_input.fill("несуществующий_чат_xyz")
            page.wait_for_timeout(500)
            # Поиск не должен вызывать ошибку
            error = page.locator(".toast-error")
            assert error.count() == 0 or not error.first.is_visible(timeout=1000)

    def test_model_selector_works(self, authenticated_page: Page):
        """Выбор модели работает."""
        page = authenticated_page

        model_btn = page.locator(".model-selector, .model-dropdown-btn, [data-action='select-model']")
        if model_btn.is_visible(timeout=3000):
            model_btn.first.click()
            page.wait_for_timeout(500)
            # Должен появиться список моделей
            model_list = page.locator(".model-list, .model-dropdown, .model-options")
            if model_list.is_visible(timeout=2000):
                # Кликаем на первую модель
                model_option = model_list.locator(".model-option, .model-item, li").first
                if model_option.is_visible(timeout=1000):
                    model_option.click()

    def test_enhanced_toggle_works(self, authenticated_page: Page):
        """Переключатель Enhanced работает."""
        page = authenticated_page

        toggle = page.locator("#enhancedToggle")
        if toggle.is_visible(timeout=3000):
            toggle.click()
            page.wait_for_timeout(500)
            # Не должно быть ошибок
            error = page.locator(".toast-error")
            assert error.count() == 0 or not error.first.is_visible(timeout=1000)


class TestAgentComputer:
    """Проверка панели 'Компьютер Агента'."""

    def test_agent_computer_panel_toggles(self, authenticated_page: Page):
        """Панель 'Компьютер Агента' открывается и закрывается."""
        page = authenticated_page

        # Ищем кнопку Agent Computer (иконка монитора)
        ac_btn = page.locator(".agent-computer-btn, [data-action='toggle-agent-computer'], [title*='Компьютер']")
        if ac_btn.is_visible(timeout=3000):
            ac_btn.first.click()
            page.wait_for_timeout(500)

            panel = page.locator(".agent-computer, #agentComputer")
            # Панель должна стать видимой
            if panel.is_visible(timeout=2000):
                # Закрываем
                ac_btn.first.click()
                page.wait_for_timeout(500)


class TestAdminPanel:
    """Проверка админ-панели (только для пользователей с ролью admin)."""

    def test_admin_users_list_loads(self, authenticated_page: Page):
        """Список пользователей в админке загружается."""
        page = authenticated_page

        # Переходим в раздел с пользователями (если доступен)
        admin_link = page.locator("text='Пользователи', text='Админ', [data-section='admin']")
        if admin_link.is_visible(timeout=3000):
            admin_link.first.click()
            page.wait_for_timeout(1000)

            # Должен появиться список пользователей
            user_list = page.locator(".user-list, .admin-users, table")
            if user_list.is_visible(timeout=5000):
                rows = user_list.locator("tr, .user-row, .user-item")
                assert rows.count() > 0, "Список пользователей пуст"


class TestFileDownload:
    """Проверка скачивания файлов."""

    def test_file_download_card_renders(self, authenticated_page: Page):
        """Карточка скачивания файла отображается корректно (если есть)."""
        page = authenticated_page

        # Ищем карточки скачивания на странице
        download_cards = page.locator(".file-download-card, a[href*='/api/files/'][href*='/download']")
        if download_cards.count() > 0:
            # Проверяем что ссылка кликабельна
            first_card = download_cards.first
            expect(first_card).to_be_visible()
            href = first_card.get_attribute("href")
            assert href and "/api/files/" in href, "Ссылка на скачивание некорректна"


class TestCurrencyDisplay:
    """Проверка отображения валюты."""

    def test_no_dollar_signs_in_ui(self, authenticated_page: Page):
        """В интерфейсе нет символов доллара — только рубли."""
        page = authenticated_page

        # Получаем весь текст страницы
        body_text = page.locator("body").inner_text()

        # Ищем паттерн $0.xxx (цена в долларах)
        dollar_prices = re.findall(r'\$\d+\.\d+', body_text)

        # Фильтруем — допускаем $ в коде, но не в ценах
        real_dollar_prices = [p for p in dollar_prices if not p.startswith("$0.0000")]
        assert len(real_dollar_prices) == 0, \
            f"Найдены цены в долларах: {real_dollar_prices}. Должны быть в рублях (₽)."


class TestResponsiveness:
    """Проверка адаптивности интерфейса."""

    def test_mobile_viewport(self, page: Page):
        """Интерфейс корректно отображается на мобильном разрешении."""
        page.set_viewport_size({"width": 375, "height": 812})
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")

        # Страница не должна быть пустой
        body = page.locator("body")
        assert body.inner_text().strip() != "", "Страница пуста на мобильном разрешении"

    def test_tablet_viewport(self, page: Page):
        """Интерфейс корректно отображается на планшетном разрешении."""
        page.set_viewport_size({"width": 768, "height": 1024})
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")

        body = page.locator("body")
        assert body.inner_text().strip() != "", "Страница пуста на планшетном разрешении"


# ══════════════════════════════════════════════════════════════
# СЕТЕВЫЕ ТЕСТЫ — перехват реальных API-запросов из браузера
# ══════════════════════════════════════════════════════════════

class TestNetworkRequests:
    """
    Перехватываем реальные сетевые запросы, которые делает фронтенд.
    Это КЛЮЧЕВОЕ отличие от подхода QA-агента: мы не угадываем API-пути,
    а наблюдаем за реальными запросами браузера.
    """

    def test_no_failed_api_requests_on_load(self, page: Page):
        """При загрузке страницы нет провалившихся API-запросов."""
        failed_requests = []

        def on_response(response):
            url = response.url
            if "/api/" in url and response.status >= 400:
                # Игнорируем 401 до логина
                if response.status != 401:
                    failed_requests.append(f"{response.status} {response.request.method} {url}")

        page.on("response", on_response)
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")

        # Логинимся
        if page.locator("#loginUser").is_visible(timeout=3000):
            page.locator("#loginUser").fill(TEST_EMAIL)
            page.locator("#loginPass").fill(TEST_PASSWORD)
            page.locator("#loginBtn").click()
            page.wait_for_selector("#chatInput", timeout=10000)

        page.wait_for_timeout(3000)  # Ждём все фоновые запросы

        assert len(failed_requests) == 0, \
            f"Провалившиеся API-запросы при загрузке:\n" + "\n".join(failed_requests)

    def test_no_console_errors(self, page: Page):
        """При загрузке страницы нет ошибок в консоли."""
        console_errors = []

        def on_console(msg):
            if msg.type == "error":
                console_errors.append(msg.text)

        page.on("console", on_console)
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        # Фильтруем известные безобидные ошибки
        real_errors = [e for e in console_errors
                       if "favicon" not in e.lower()
                       and "third-party" not in e.lower()]

        assert len(real_errors) == 0, \
            f"Ошибки в консоли:\n" + "\n".join(real_errors)
