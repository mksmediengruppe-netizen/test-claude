"""
Кастомные контекстные менеджеры на Python
1. Timer - измерение времени выполнения блока кода
2. ChangeDir - временное изменение рабочей директории
"""

import os
import time
from contextlib import contextmanager
from typing import Optional, Generator


# ==================== 1. TIMER - Измерение времени ====================

class Timer:
    """
    Контекстный менеджер для измерения времени выполнения блока кода.
    
    Пример использования:
        with Timer("Операция"):
            time.sleep(1)
    """
    
    def __init__(self, name: str = "Блок кода", verbose: bool = True):
        """
        Args:
            name: Название измеряемого блока
            verbose: Выводить ли результат автоматически
        """
        self.name = name
        self.verbose = verbose
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        self.elapsed: Optional[float] = None
    
    def __enter__(self) -> 'Timer':
        """Запуск таймера при входе в контекст"""
        self.start_time = time.perf_counter()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Остановка таймера и вывод результата при выходе из контекста"""
        self.end_time = time.perf_counter()
        self.elapsed = self.end_time - self.start_time
        
        if self.verbose:
            status = "с ошибкой" if exc_type else "успешно"
            print(f"[Timer] {self.name} завершён {status} за {self.elapsed:.4f} сек")
        
        return False  # Не подавлять исключения
    
    def __repr__(self) -> str:
        """Строковое представление с результатом"""
        if self.elapsed is None:
            return f"Timer({self.name}) - не запущен"
        return f"Timer({self.name}) - {self.elapsed:.4f} сек"


# ==================== 2. CHANGEDIR - Временное изменение директории ====================

class ChangeDir:
    """
    Контекстный менеджер для временного изменения рабочей директории.
    Автоматически возвращает исходную директорию при выходе из контекста.
    
    Пример использования:
        with ChangeDir("/tmp"):
            print(os.getcwd())  # /tmp
        print(os.getcwd())  # исходная директория
    """
    
    def __init__(self, new_path: str, create: bool = False):
        """
        Args:
            new_path: Путь к новой директории
            create: Создать директорию, если она не существует
        """
        self.new_path = os.path.abspath(new_path)
        self.create = create
        self.original_path: Optional[str] = None
    
    def __enter__(self) -> str:
        """Сохранение текущей директории и переход в новую"""
        self.original_path = os.getcwd()
        
        # Создаём директорию если нужно
        if self.create and not os.path.exists(self.new_path):
            os.makedirs(self.new_path, exist_ok=True)
        
        # Проверяем существование директории
        if not os.path.isdir(self.new_path):
            raise FileNotFoundError(f"Директория не существует: {self.new_path}")
        
        # Переходим в новую директорию
        os.chdir(self.new_path)
        return self.new_path
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Возврат в исходную директорию"""
        if self.original_path:
            os.chdir(self.original_path)
        return False  # Не подавлять исключения
    
    def __repr__(self) -> str:
        return f"ChangeDir(from='{self.original_path}', to='{self.new_path}')"


# ==================== 3. Альтернативная реализация через декоратор ====================

@contextmanager
def timer(name: str = "Блок кода", verbose: bool = True) -> Generator[float, None, None]:
    """
    Функциональный вариант таймера через @contextmanager декоратор.
    
    Пример:
        with timer("Моя операция") as elapsed:
            time.sleep(1)
        print(f"Заняло: {elapsed} сек")
    """
    start = time.perf_counter()
    try:
        yield start  # Можно вернуть start_time если нужно
    finally:
        elapsed = time.perf_counter() - start
        if verbose:
            print(f"[Timer] {name} завершён за {elapsed:.4f} сек")


@contextmanager
def change_dir(new_path: str, create: bool = False) -> Generator[str, None, None]:
    """
    Функциональный вариант смены директории через @contextmanager декоратор.
    
    Пример:
        with change_dir("/tmp") as current_dir:
            print(f"Теперь в: {current_dir}")
    """
    original_path = os.getcwd()
    new_path_abs = os.path.abspath(new_path)
    
    if create and not os.path.exists(new_path_abs):
        os.makedirs(new_path_abs, exist_ok=True)
    
    if not os.path.isdir(new_path_abs):
        raise FileNotFoundError(f"Директория не существует: {new_path_abs}")
    
    try:
        os.chdir(new_path_abs)
        yield new_path_abs
    finally:
        os.chdir(original_path)


# ==================== ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ ====================

if __name__ == "__main__":
    print("=" * 60)
    print("ПРИМЕР 1: Timer - измерение времени")
    print("=" * 60)
    
    # Пример 1a: Базовое использование
    with Timer("Тестовая операция"):
        time.sleep(0.5)
        sum(range(1000000))
    
    # Пример 1b: Без автоматического вывода
    with Timer("Тихий таймер", verbose=False) as t:
        time.sleep(0.3)
    print(f"Результат вручную: {t}")
    
    # Пример 1c: Функциональный вариант
    with timer("Функциональный таймер"):
        time.sleep(0.2)
    
    print("\n" + "=" * 60)
    print("ПРИМЕР 2: ChangeDir - смена директории")
    print("=" * 60)
    
    # Пример 2a: Базовое использование
    original = os.getcwd()
    print(f"Исходная директория: {original}")
    
    with ChangeDir("/tmp"):
        print(f"Внутри контекста: {os.getcwd()}")
        # Создаём тестовый файл
        with open("test_context_manager.txt", "w") as f:
            f.write("Тестовый файл")
        print("Создан файл: test_context_manager.txt")
    
    print(f"После выхода: {os.getcwd()}")
    
    # Пример 2b: С созданием директории
    test_dir = "/tmp/test_context_dir"
    with ChangeDir(test_dir, create=True):
        print(f"Создана и перешли в: {os.getcwd()}")
    
    # Удаляем тестовую директорию
    import shutil
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)
        print(f"Удалена тестовая директория: {test_dir}")
    
    # Пример 2c: Функциональный вариант
    with change_dir("/tmp") as current:
        print(f"Функциональный вариант: {current}")
    
    print("\n" + "=" * 60)
    print("ПРИМЕР 3: Комбинированное использование")
    print("=" * 60)
    
    # Измеряем время операций в другой директории
    with ChangeDir("/tmp"):
        with Timer("Операции в /tmp"):
            for i in range(3):
                with open(f"temp_{i}.txt", "w") as f:
                    f.write(f"Файл {i}")
            time.sleep(0.1)
        
        # Удаляем временные файлы
        for i in range(3):
            os.remove(f"temp_{i}.txt")
    
    print("\n" + "=" * 60)
    print("ПРИМЕР 4: Обработка исключений")
    print("=" * 60)
    
    # Timer корректно работает с исключениями
    try:
        with Timer("Операция с ошибкой"):
            time.sleep(0.2)
            raise ValueError("Тестовая ошибка")
    except ValueError as e:
        print(f"Перехвачено: {e}")
    
    # ChangeDir возвращает исходную директорию даже при ошибке
    original = os.getcwd()
    try:
        with ChangeDir("/tmp"):
            print(f"В /tmp: {os.getcwd()}")
            raise RuntimeError("Ошибка в контексте")
    except RuntimeError:
        pass
    
    print(f"Вернулись в: {os.getcwd()}")
    assert os.getcwd() == original, "Директория не восстановлена!"
    
    print("\n✅ Все примеры выполнены успешно!")
