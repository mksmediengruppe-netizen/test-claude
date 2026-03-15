#!/usr/bin/env python3
"""
Рекурсивный обход дерева директорий.
Выводит все файлы с расширением .py с обработкой PermissionError.
"""

import os
from pathlib import Path


def find_python_files_recursive(root_dir):
    """
    Рекурсивно находит все .py файлы в директории и поддиректориях.
    
    Args:
        root_dir (str): Корневая директория для поиска
    
    Returns:
        list: Список путей к .py файлам
    """
    python_files = []
    
    try:
        # Используем os.walk для рекурсивного обхода
        for dirpath, dirnames, filenames in os.walk(root_dir):
            for filename in filenames:
                if filename.endswith('.py'):
                    full_path = os.path.join(dirpath, filename)
                    python_files.append(full_path)
                    print(f"📄 {full_path}")
    
    except PermissionError as e:
        print(f"⚠️  Ошибка доступа: {e}")
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    
    return python_files


def find_python_files_recursive_v2(root_dir):
    """
    Альтернативная реализация с использованием pathlib и явной рекурсии.
    """
    python_files = []
    root_path = Path(root_dir)
    
    def _scan_directory(path):
        try:
            # Проверяем, что это директория
            if not path.is_dir():
                return
            
            # Обходим содержимое директории
            for item in path.iterdir():
                try:
                    if item.is_file() and item.suffix == '.py':
                        python_files.append(str(item))
                        print(f"📄 {item}")
                    elif item.is_dir():
                        # Рекурсивный вызов для поддиректории
                        _scan_directory(item)
                
                except PermissionError:
                    print(f"⚠️  Нет доступа к: {item}")
                except Exception as e:
                    print(f"❌ Ошибка при обработке {item}: {e}")
        
        except PermissionError:
            print(f"⚠️  Нет доступа к директории: {path}")
        except Exception as e:
            print(f"❌ Ошибка при сканировании {path}: {e}")
    
    _scan_directory(root_path)
    return python_files


def find_python_files_with_stats(root_dir):
    """
    Находит .py файлы с дополнительной статистикой.
    """
    python_files = []
    total_size = 0
    
    print(f"\n🔍 Сканирование директории: {root_dir}")
    print("=" * 60)
    
    for dirpath, dirnames, filenames in os.walk(root_dir):
        try:
            for filename in filenames:
                if filename.endswith('.py'):
                    full_path = os.path.join(dirpath, filename)
                    try:
                        file_size = os.path.getsize(full_path)
                        total_size += file_size
                        python_files.append(full_path)
                        print(f"📄 {full_path} ({file_size:,} bytes)")
                    except PermissionError:
                        print(f"⚠️  Нет доступа к размеру файла: {full_path}")
        
        except PermissionError as e:
            print(f"⚠️  Нет доступа к директории: {dirpath}")
    
    print("=" * 60)
    print(f"📊 Найдено файлов: {len(python_files)}")
    print(f"💾 Общий размер: {total_size:,} bytes ({total_size / 1024:.2f} KB)")
    
    return python_files


if __name__ == "__main__":
    import sys
    
    # Директория для сканирования (по умолчанию - текущая)
    scan_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    
    print("🐍 Поиск Python файлов...")
    print(f"📁 Директория: {os.path.abspath(scan_dir)}\n")
    
    # Вариант 1: Используем os.walk
    print("=== Вариант 1: os.walk ===")
    files_v1 = find_python_files_recursive(scan_dir)
    
    print(f"\n✅ Найдено файлов: {len(files_v1)}")
    
    # Вариант 2: Используем pathlib с рекурсией
    print("\n=== Вариант 2: pathlib + рекурсия ===")
    files_v2 = find_python_files_recursive_v2(scan_dir)
    
    print(f"\n✅ Найдено файлов: {len(files_v2)}")
    
    # Вариант 3: Со статистикой
    print("\n=== Вариант 3: со статистикой ===")
    files_v3 = find_python_files_with_stats(scan_dir)
