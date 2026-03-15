#!/usr/bin/env python3
"""
Рекурсивный обход дерева директорий.
Поиск всех файлов с расширением .py с обработкой PermissionError.
"""

import os
from pathlib import Path
from typing import List


def find_py_files_recursive(root_dir: str) -> List[str]:
    """
    Рекурсивно находит все .py файлы в директории и поддиректориях.
    
    Args:
        root_dir: Корневая директория для поиска
        
    Returns:
        Список путей к найденным .py файлам
    """
    py_files = []
    
    try:
        root_path = Path(root_dir)
        
        if not root_path.exists():
            print(f"❌ Директория не существует: {root_dir}")
            return py_files
            
        if not root_path.is_dir():
            print(f"❌ Это не директория: {root_dir}")
            return py_files
        
        print(f"🔍 Сканирование: {root_path.absolute()}")
        print("=" * 60)
        
        # Рекурсивный обход с использованием os.walk
        for dirpath, dirnames, filenames in os.walk(root_dir):
            try:
                for filename in filenames:
                    if filename.endswith('.py'):
                        full_path = os.path.join(dirpath, filename)
                        py_files.append(full_path)
                        print(f"✓ {full_path}")
                        
            except PermissionError as e:
                print(f"⚠️  Нет доступа к файлам в: {dirpath}")
                continue
                
    except PermissionError as e:
        print(f"❌ Нет доступа к директории: {root_dir}")
        print(f"   Ошибка: {e}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    
    return py_files


def find_py_files_pathlib(root_dir: str) -> List[str]:
    """
    Альтернативный вариант с использованием pathlib.rglob().
    Более компактный, но менее гибкий для обработки ошибок.
    
    Args:
        root_dir: Корневая директория для поиска
        
    Returns:
        Список путей к найденным .py файлам
    """
    py_files = []
    root_path = Path(root_dir)
    
    try:
        print(f"\n🔍 Поиск через pathlib.rglob(): {root_path.absolute()}")
        print("=" * 60)
        
        for py_file in root_path.rglob("*.py"):
            try:
                py_files.append(str(py_file))
                print(f"✓ {py_file}")
            except PermissionError:
                continue
                
    except PermissionError as e:
        print(f"❌ Нет доступа: {e}")
        
    return py_files


def main():
    """Главная функция."""
    import sys
    
    # Директория для поиска (по умолчанию - текущая)
    if len(sys.argv) > 1:
        search_dir = sys.argv[1]
    else:
        search_dir = "."
    
    print("🐍 Поиск Python файлов (.py)")
    print("=" * 60)
    
    # Метод 1: os.walk
    py_files = find_py_files_recursive(search_dir)
    
    # Метод 2: pathlib (альтернатива)
    # py_files = find_py_files_pathlib(search_dir)
    
    print("=" * 60)
    print(f"📊 Всего найдено файлов: {len(py_files)}")
    
    # Статистика
    if py_files:
        total_size = sum(os.path.getsize(f) for f in py_files if os.path.exists(f))
        print(f"📦 Общий размер: {total_size:,} байт ({total_size / 1024:.2f} KB)")


if __name__ == "__main__":
    main()
