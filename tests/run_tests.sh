#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Super Agent — E2E Test Runner
# ═══════════════════════════════════════════════════════════
# Использование:
#   ./run_tests.sh              # Все тесты
#   ./run_tests.sh smoke        # Только Smoke-тесты
#   ./run_tests.sh regression   # Только регрессионные тесты
#   ./run_tests.sh install      # Установить зависимости
# ═══════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

case "${1:-all}" in
    install)
        echo -e "${YELLOW}[INSTALL] Устанавливаю зависимости...${NC}"
        pip install pytest pytest-playwright playwright
        playwright install chromium
        echo -e "${GREEN}[OK] Зависимости установлены${NC}"
        ;;
    smoke)
        echo -e "${YELLOW}[SMOKE] Запускаю Smoke-тесты...${NC}"
        pytest test_super_agent_e2e.py -v -m smoke --tb=short 2>&1
        ;;
    regression)
        echo -e "${YELLOW}[REGRESSION] Запускаю регрессионные тесты...${NC}"
        pytest test_super_agent_e2e.py -v --tb=short 2>&1
        ;;
    all)
        echo -e "${YELLOW}[ALL] Запускаю все тесты...${NC}"
        pytest test_super_agent_e2e.py -v --tb=short 2>&1
        ;;
    *)
        echo "Использование: $0 {install|smoke|regression|all}"
        exit 1
        ;;
esac

EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "\n${GREEN}═══ ВСЕ ТЕСТЫ ПРОЙДЕНЫ ═══${NC}"
else
    echo -e "\n${RED}═══ ЕСТЬ ПРОВАЛИВШИЕСЯ ТЕСТЫ ═══${NC}"
fi
exit $EXIT_CODE
