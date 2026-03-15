"""
Кастомные контекстные менеджеры на Python
1. Timer - измерение времени выполнения блока кода
2. ChangeDir - временное изменение рабочей директории
"""

import os
import time
from contextlib import contextmanager
from typing import Optional, Callable


# ==================== 1. Timer - измерение времени ====================

class Timer:
    """
    Контекстный менеджер для измерения времени выполнения блока кода.
    
    Примеры:
        with Timer("Операция"):
            time.sleep(1)
        # Вывод: Операция выполнена за 1.00 сек
        
        with Timer() as t:
            time.sleep(0.5)
        print(f"Время: {t.elapsed:.2f} сек")
    """
    
    def __init__(self, name: Optional[str] = None, 
                 verbose: bool = True, 
                 callback: Optional[Callable[[float], None]] = None):
        """
        Args:
            name: Имя операции для вывода
            verbose: Выводить ли сообщение автоматически
            callback: Функция для обработки времени (получает elapsed)
        """
        self.name = name
        self.verbose = verbose
        self.callback = callback
        self.start_time = None
        self.elapsed = 0.0
    
    def __enter__(self):
        self.start_time = time.perf_counter()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.elapsed = time.perf_counter() - self.start_time
        
        if self.callback:
            self.callback(self.elapsed)
        
        if self.verbose:
            if self.name:
                print(f"✓ {self.name} выполнена за {self.elapsed:.4f} сек")
            else:
                print(f"⏱ Время выполнения: {self.elapsed:.4f} сек")
        
        return False  # Не подавлять исключения


# ==================== 2. ChangeDir - временное изменение директории ====================

class ChangeDir:
    """
    Контекстный менеджер для временного изменения рабочей директории.
    Автоматически возвращает исходную директорию при выходе.
    
    Примеры:
        with ChangeDir("/tmp"):
            print(os.getcwd())  # /tmp
        print(os.getcwd())  # исходная директория
    """
    
    def __init__(self, path: str, create: bool = False):
        """
        Args:
            path: Путь к новой директории
            create: Создать директорию, если не существует
        """
        self.path = os.path.abspath(path)
        self.create = create
        self.original_path = None
    
    def __enter__(self):
        self.original_path = os.getcwd()
        
        if self.create and not os.path.exists(self.path):
            os.makedirs(self.path, exist_ok=True)
        
        if not os.path.exists(self.path):
            raise FileNotFoundError(f"Директория не существует: {self.path}")
        
        os.chdir(self.path)
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        os.chdir(self.original_path)
        return False


# ==================== 3. Комбинированный менеджер ====================

class TimedChangeDir:
    """
    Комбинированный контекстный менеджер: изменение директории + замер времени.
    
    Пример:
        with TimedChangeDir("/tmp", "Работа в /tmp"):
            # код в директории /tmp
            pass
    """
    
    def __init__(self, path: str, name: Optional[str] = None, create: bool = False):
        self.path = path
        self.name = name
        self.create = create
        self.timer = Timer(name, verbose=False)
        self.chdir = ChangeDir(path, create)
    
    def __enter__(self):
        self.timer.__enter__()
        self.chdir.__enter__()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.chdir.__exit__(exc_type, exc_val, exc_tb)
        self.timer.__exit__(exc_type, exc_val, exc_tb)
        return False


# ==================== Декоратор-версия Timer ====================

def timer_decorator(name: Optional[str] = None):
    """
    Декоратор для измерения времени выполнения функции.
    
    Пример:
        @timer_decorator("Функция")
        def my_func():
            time.sleep(1)
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            with Timer(name or func.__name__):
                return func(*args, **kwargs)
        return wrapper
    return decorator


# ==================== Примеры использования ====================

if __name__ == "__main__":
    print("=" * 60)
    print("ПРИМЕР 1: Timer - базовое использование")
    print("=" * 60)
    
    with Timer("Тестовая операция"):
        time.sleep(0.5)
        sum(range(1000000))
    
    print()
    
    print("=" * 60)
    print("ПРИМЕР 2: Timer - доступ к elapsed времени")
    print("=" * 60)
    
    with Timer(verbose=False) as t:
        time.sleep(0.3)
    
    print(f"Сохранённое время: {t.elapsed:.4f} сек")
    print()
    
    print("=" * 60)
    print("ПРИМЕР 3: Timer с callback")
    print("=" * 60)
    
    def log_time(elapsed):
        print(f"📊 Логируем время: {elapsed:.4f} сек")
    
    with Timer(callback=log_time):
        time.sleep(0.2)
    
    print()
    
    print("=" * 60)
    print("ПРИМЕР 4: ChangeDir - смена директории")
    print("=" * 60)
    
    original_dir = os.getcwd()
    print(f"Исходная директория: {original_dir}")
    
    # Создаём временную директорию для теста
    test_dir = os.path.join(original_dir, "temp_test_dir")
    
    with ChangeDir(test_dir, create=True):
        print(f"Внутри контекста: {os.getcwd()}")
        with open("test_file.txt", "w") as f:
            f.write("Тестовый файл")
        print("✓ Создан файл test_file.txt")
    
    print(f"После выхода: {os.getcwd()}")
    
    # Удаляем тестовую директорию
    import shutil
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)
        print("✓ Тестовая директория удалена")
    
    print()
    
    print("=" * 60)
    print("ПРИМЕР 5: TimedChangeDir - комбинированный")
    print("=" * 60)
    
    test_dir2 = os.path.join(original_dir, "temp_test_dir2")
    
    with TimedChangeDir(test_dir2, "Работа с файлами", create=True):
        print(f"Текущая директория: {os.getcwd()}")
        time.sleep(0.2)
        with open("data.txt", "w") as f:
            f.write("Данные")
    
    if os.path.exists(test_dir2):
        shutil.rmtree(test_dir2)
    
    print()
    
    print("=" * 60)
    print("ПРИМЕР 6: Декоратор @timer_decorator")
    print("=" * 60)
    
    @timer_decorator("Вычисление факториала")
    def factorial(n):
        result = 1
        for i in range(1, n + 1):
            result *= i
        return result
    
    factorial(10000)
    
    print()
    print("=" * 60)
    print("✓ Все примеры выполнены!")
    print("=" * 60)
