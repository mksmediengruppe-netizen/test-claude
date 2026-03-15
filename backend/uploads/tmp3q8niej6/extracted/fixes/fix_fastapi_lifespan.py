#!/usr/bin/env python3
"""
Скрипт для миграции @app.on_event('startup') -> lifespan context manager
Автор: MiniMax Agent

ПРИМЕЧАНИЕ: Это сложная миграция, требующая ручной проверки.
Скрипт создаёт diff-файлы с предложенными изменениями.
"""

import re
from pathlib import Path
from textwrap import dedent

# Шаблон для lifespan
LIFESPAN_TEMPLATE = '''
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
{startup_code}
    yield
    # Shutdown (если нужно)
    pass

# При создании app:
# app = FastAPI(lifespan=lifespan)
'''

def analyze_startup_events(file_path: str) -> dict:
    """Анализирует файл и находит startup events"""
    path = Path(file_path)
    if not path.exists():
        return {'error': f'File not found: {file_path}'}

    content = path.read_text(encoding='utf-8')

    # Ищем все @app.on_event('startup') или @app.on_event("startup")
    pattern = r'@app\.on_event\([\'"]startup[\'"]\)\s*\nasync def (\w+)\([^)]*\):\s*\n((?:[ \t]+.+\n)*)'

    matches = re.findall(pattern, content, re.MULTILINE)

    return {
        'file': file_path,
        'startup_functions': [(name, code.rstrip()) for name, code in matches],
        'count': len(matches)
    }


def generate_migration_guide(analyses: list) -> str:
    """Генерирует руководство по миграции"""
    guide = "# FastAPI Lifespan Migration Guide\n\n"
    guide += "## Файлы требующие миграции:\n\n"

    for analysis in analyses:
        if 'error' in analysis:
            guide += f"- ❌ {analysis['error']}\n"
            continue

        guide += f"### {analysis['file']}\n"
        guide += f"Найдено startup events: {analysis['count']}\n\n"

        for func_name, func_code in analysis['startup_functions']:
            guide += f"#### Функция: `{func_name}`\n"
            guide += "```python\n"
            guide += f"# БЫЛО:\n"
            guide += f"@app.on_event('startup')\n"
            guide += f"async def {func_name}():\n"
            guide += func_code + "\n"
            guide += "```\n\n"

        # Генерируем предложенное решение
        if analysis['startup_functions']:
            startup_code = ""
            for func_name, func_code in analysis['startup_functions']:
                startup_code += f"    # {func_name}\n"
                for line in func_code.split('\n'):
                    startup_code += f"    {line}\n" if line.strip() else "\n"

            guide += "**Предложенная миграция:**\n"
            guide += "```python\n"
            guide += "from contextlib import asynccontextmanager\n\n"
            guide += "@asynccontextmanager\n"
            guide += "async def lifespan(app: FastAPI):\n"
            guide += "    # Startup\n"
            guide += startup_code
            guide += "    yield\n"
            guide += "    # Shutdown (опционально)\n\n"
            guide += "app = FastAPI(lifespan=lifespan)\n"
            guide += "```\n\n"

    return guide


if __name__ == '__main__':
    files = [
        '/root/ai-dev-team-platform/apps/memory-service/app/main.py',
        '/root/ai-dev-team-platform/apps/chat-api/app/main.py',
        '/root/ai-dev-team-platform/apps/approval-service/app/main.py',
        '/root/ai-dev-team-platform/apps/task-runner/app/main.py',
        '/root/ai-dev-team-platform/apps/orchestrator-api/app/main.py',
        '/root/ai-dev-team-platform/apps/planner-worker/app/main.py',
    ]

    analyses = [analyze_startup_events(f) for f in files]
    guide = generate_migration_guide(analyses)

    output_path = Path('/root/ai-dev-team-platform/MIGRATION_GUIDE.md')
    output_path.write_text(guide, encoding='utf-8')
    print(f"Migration guide saved to: {output_path}")
