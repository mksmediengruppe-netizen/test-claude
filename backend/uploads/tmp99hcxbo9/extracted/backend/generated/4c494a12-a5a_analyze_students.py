#!/usr/bin/env python3
"""
Скрипт для анализа CSV файла с данными студентов.
Читает CSV (name, score, grade), считает среднее, находит топ-3, выводит в Markdown.
"""

import pandas as pd
import sys
from pathlib import Path


def analyze_student_data(csv_file):
    """
    Анализирует CSV файл с данными студентов.
    
    Args:
        csv_file: путь к CSV файлу
    """
    try:
        # Читаем CSV файл
        df = pd.read_csv(csv_file)
        
        # Проверяем наличие нужных колонок
        required_columns = ['name', 'score', 'grade']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            print(f"❌ Ошибка: отсутствуют колонки: {', '.join(missing_columns)}")
            print(f"   Найдены колонки: {', '.join(df.columns)}")
            return
        
        # Считаем средний балл
        average_score = df['score'].mean()
        
        # Находим топ-3 по score
        top_3 = df.nlargest(3, 'score')
        
        # Формируем Markdown таблицу
        markdown_output = generate_markdown_table(df, average_score, top_3)
        
        # Выводим результат
        print(markdown_output)
        
        # Сохраняем в файл
        output_file = Path(csv_file).stem + '_analysis.md'
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(markdown_output)
        
        print(f"\n✅ Результат сохранён в: {output_file}")
        
    except FileNotFoundError:
        print(f"❌ Ошибка: файл '{csv_file}' не найден")
    except Exception as e:
        print(f"❌ Ошибка: {e}")


def generate_markdown_table(df, average_score, top_3):
    """
    Генерирует Markdown таблицу с результатами анализа.
    
    Args:
        df: DataFrame с данными
        average_score: средний балл
        top_3: топ-3 студента
    
    Returns:
        Строка в формате Markdown
    """
    md = []
    
    # Заголовок
    md.append("# 📊 Анализ данных студентов\n")
    
    # Общая статистика
    md.append("## 📈 Общая статистика")
    md.append(f"- **Всего студентов:** {len(df)}")
    md.append(f"- **Средний балл:** {average_score:.2f}")
    md.append(f"- **Максимальный балл:** {df['score'].max()}")
    md.append(f"- **Минимальный балл:** {df['score'].min()}\n")
    
    # Топ-3 студента
    md.append("## 🏆 Топ-3 студента")
    md.append("| # | Имя | Балл | Оценка |")
    md.append("|---|-----|------|--------|")
    
    for idx, (_, row) in enumerate(top_3.iterrows(), 1):
        md.append(f"| {idx} | {row['name']} | {row['score']} | {row['grade']} |")
    
    md.append("")
    
    # Полная таблица всех студентов
    md.append("## 📋 Все студенты")
    md.append("| Имя | Балл | Оценка |")
    md.append("|-----|------|--------|")
    
    for _, row in df.iterrows():
        md.append(f"| {row['name']} | {row['score']} | {row['grade']} |")
    
    return "\n".join(md)


def main():
    """Главная функция."""
    if len(sys.argv) > 1:
        csv_file = sys.argv[1]
    else:
        csv_file = input("Введите путь к CSV файлу: ").strip()
    
    analyze_student_data(csv_file)


if __name__ == "__main__":
    main()
