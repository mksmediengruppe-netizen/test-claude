#!/usr/bin/env python3
"""
Скрипт для анализа CSV файла с данными студентов.
Читает CSV (name,score,grade), считает среднее, находит топ-3, выводит Markdown-таблицу.
"""

import pandas as pd
import sys

def analyze_students(csv_file='students.csv'):
    """
    Анализирует CSV файл с данными студентов.
    
    Args:
        csv_file: путь к CSV файлу
    """
    try:
        # Читаем CSV файл
        df = pd.read_csv(csv_file)
        print(f"✅ Загружено {len(df)} записей из {csv_file}\n")
        
        # Считаем средний балл
        avg_score = df['score'].mean()
        print(f"📊 Средний балл: {avg_score:.2f}\n")
        
        # Находим топ-3 по score
        top3 = df.nlargest(3, 'score')
        
        # Формируем Markdown-таблицу
        print("🏆 Топ-3 студента:")
        print()
        print("| Name | Score | Grade |")
        print("|------|-------|-------|")
        for _, row in top3.iterrows():
            print(f"| {row['name']} | {row['score']} | {row['grade']} |")
        
        # Дополнительная статистика
        print()
        print("📈 Статистика:")
        print(f"- Минимальный балл: {df['score'].min()}")
        print(f"- Максимальный балл: {df['score'].max()}")
        print(f"- Медиана: {df['score'].median():.2f}")
        
        # Распределение по оценкам
        print()
        print("📋 Распределение по оценкам:")
        grade_counts = df['grade'].value_counts().sort_index()
        for grade, count in grade_counts.items():
            print(f"- {grade}: {count}")
            
    except FileNotFoundError:
        print(f"❌ Ошибка: файл '{csv_file}' не найден!")
        sys.exit(1)
    except KeyError as e:
        print(f"❌ Ошибка: отсутствует колонка {e}")
        print("   Ожидаемые колонки: name, score, grade")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # Можно указать путь к файлу как аргумент
    csv_path = sys.argv[1] if len(sys.argv) > 1 else 'students.csv'
    analyze_students(csv_path)
