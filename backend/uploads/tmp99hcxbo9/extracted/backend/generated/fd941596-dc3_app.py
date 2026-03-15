#!/usr/bin/env python3
"""
Flask TODO API
Endpoints:
- GET    /tasks       - Получить все задачи
- POST   /tasks       - Создать новую задачу
- DELETE /tasks/<id>  - Удалить задачу по ID
- PUT    /tasks/<id>  - Обновить статус задачи
"""

from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
import sqlite3
import datetime

app = Flask(__name__)
CORS(app)

DB_PATH = 'todo.db'

def init_db():
    """Инициализация базы данных SQLite"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            completed BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def get_db_connection():
    """Создать соединение с базой данных"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    """Главная страница - фронтенд"""
    return render_template('index.html')

@app.route('/tasks', methods=['GET'])
def get_tasks():
    """Получить все задачи"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM tasks ORDER BY created_at DESC')
    tasks = cursor.fetchall()
    conn.close()
    
    result = []
    for task in tasks:
        result.append({
            'id': task['id'],
            'title': task['title'],
            'description': task['description'],
            'completed': bool(task['completed']),
            'created_at': task['created_at'],
            'updated_at': task['updated_at']
        })
    
    return jsonify(result)

@app.route('/tasks', methods=['POST'])
def create_task():
    """Создать новую задачу"""
    data = request.get_json()
    
    if not data or 'title' not in data:
        return jsonify({'error': 'Title is required'}), 400
    
    title = data['title']
    description = data.get('description', '')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO tasks (title, description) VALUES (?, ?)',
        (title, description)
    )
    conn.commit()
    task_id = cursor.lastrowid
    conn.close()
    
    return jsonify({
        'id': task_id,
        'title': title,
        'description': description,
        'completed': False,
        'message': 'Task created successfully'
    }), 201

@app.route('/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    """Удалить задачу по ID"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
    
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({'error': 'Task not found'}), 404
    
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Task deleted successfully'})

@app.route('/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    """Обновить статус задачи"""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Проверяем существование задачи
    cursor.execute('SELECT * FROM tasks WHERE id = ?', (task_id,))
    if cursor.fetchone() is None:
        conn.close()
        return jsonify({'error': 'Task not found'}), 404
    
    # Обновляем поля
    if 'completed' in data:
        cursor.execute(
            'UPDATE tasks SET completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            (1 if data['completed'] else 0, task_id)
        )
    
    if 'title' in data:
        cursor.execute(
            'UPDATE tasks SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            (data['title'], task_id)
        )
    
    if 'description' in data:
        cursor.execute(
            'UPDATE tasks SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            (data['description'], task_id)
        )
    
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Task updated successfully'})

@app.route('/tasks/<int:task_id>', methods=['GET'])
def get_task(task_id):
    """Получить задачу по ID"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM tasks WHERE id = ?', (task_id,))
    task = cursor.fetchone()
    conn.close()
    
    if task is None:
        return jsonify({'error': 'Task not found'}), 404
    
    return jsonify({
        'id': task['id'],
        'title': task['title'],
        'description': task['description'],
        'completed': bool(task['completed']),
        'created_at': task['created_at'],
        'updated_at': task['updated_at']
    })

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=8080, debug=True)
