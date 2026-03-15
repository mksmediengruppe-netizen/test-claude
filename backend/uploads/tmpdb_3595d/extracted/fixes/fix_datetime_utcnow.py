#!/usr/bin/env python3
"""
Скрипт для исправления deprecated datetime.utcnow() -> datetime.now(timezone.utc)
Автор: MiniMax Agent
"""

import re
import sys
from pathlib import Path

def fix_datetime_utcnow(file_path: str) -> tuple[bool, str]:
    """Исправляет datetime.utcnow на datetime.now(timezone.utc)"""
    path = Path(file_path)
    if not path.exists():
        return False, f"File not found: {file_path}"

    content = path.read_text(encoding='utf-8')
    original = content

    # Проверяем и добавляем импорт timezone если нужно
    if 'datetime.utcnow' in content:
        # Заменяем datetime.utcnow на lambda для default_factory
        # Для Field(default_factory=datetime.utcnow) -> Field(default_factory=lambda: datetime.now(timezone.utc))
        content = re.sub(
            r'default_factory=datetime\.utcnow',
            r'default_factory=lambda: datetime.now(timezone.utc)',
            content
        )

        # Для SQLAlchemy mapped_column default=datetime.utcnow
        # -> default=lambda: datetime.now(timezone.utc)
        content = re.sub(
            r'default=datetime\.utcnow',
            r'default=lambda: datetime.now(timezone.utc)',
            content
        )

        # Для onupdate=datetime.utcnow
        content = re.sub(
            r'onupdate=datetime\.utcnow',
            r'onupdate=lambda: datetime.now(timezone.utc)',
            content
        )

        # Добавляем импорт timezone если его нет
        if 'from datetime import' in content and 'timezone' not in content:
            content = re.sub(
                r'from datetime import ([^)]+)',
                lambda m: f'from datetime import {m.group(1)}, timezone' if 'timezone' not in m.group(1) else m.group(0),
                content
            )
        elif 'import datetime' in content and 'timezone' not in content:
            # Если используется import datetime, меняем на datetime.timezone.utc
            content = content.replace(
                'datetime.now(timezone.utc)',
                'datetime.datetime.now(datetime.timezone.utc)'
            )

    if content != original:
        path.write_text(content, encoding='utf-8')
        return True, f"Fixed: {file_path}"
    return False, f"No changes needed: {file_path}"


if __name__ == '__main__':
    files = [
        '/root/ai-dev-team-platform/libs/shared/dto.py',
        '/root/ai-dev-team-platform/libs/shared/models.py',
    ]

    for f in files:
        success, msg = fix_datetime_utcnow(f)
        print(msg)
