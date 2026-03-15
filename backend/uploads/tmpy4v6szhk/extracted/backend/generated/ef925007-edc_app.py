"""
Flask Application with PostgreSQL and Redis
"""
import os
from datetime import datetime
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import redis
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Load configuration from environment variables
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'postgresql://app_user:app_password@postgres:5432/app_db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db = SQLAlchemy(app)
CORS(app)

# Redis connection
redis_client = redis.from_url(
    os.getenv('REDIS_URL', 'redis://:redis_password@redis:6379/0'),
    decode_responses=True
)

# ==================== Database Models ====================
class User(db.Model):
    """User model"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'created_at': self.created_at.isoformat()
        }

# ==================== Routes ====================
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Check PostgreSQL
        db.session.execute(db.text('SELECT 1'))
        postgres_status = 'healthy'
    except Exception as e:
        postgres_status = f'unhealthy: {str(e)}'
    
    try:
        # Check Redis
        redis_client.ping()
        redis_status = 'healthy'
    except Exception as e:
        redis_status = f'unhealthy: {str(e)}'
    
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'services': {
            'postgres': postgres_status,
            'redis': redis_status,
            'flask': 'healthy'
        }
    }), 200

@app.route('/api/users', methods=['GET'])
def get_users():
    """Get all users with caching"""
    cache_key = 'users:all'
    
    # Try to get from cache
    cached_data = redis_client.get(cache_key)
    if cached_data:
        logger.info('Users retrieved from cache')
        return jsonify({'data': cached_data, 'cached': True}), 200
    
    # Get from database
    users = User.query.all()
    users_data = [user.to_dict() for user in users]
    
    # Cache for 60 seconds
    redis_client.setex(cache_key, 60, str(users_data))
    
    return jsonify({'data': users_data, 'cached': False}), 200

@app.route('/api/users', methods=['POST'])
def create_user():
    """Create a new user"""
    data = request.get_json()
    
    if not data or 'username' not in data or 'email' not in data:
        return jsonify({'error': 'Username and email are required'}), 400
    
    try:
        user = User(username=data['username'], email=data['email'])
        db.session.add(user)
        db.session.commit()
        
        # Invalidate cache
        redis_client.delete('users:all')
        
        return jsonify({'message': 'User created', 'user': user.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get application statistics"""
    try:
        # Get from cache
        cache_key = 'app:stats'
        cached_stats = redis_client.get(cache_key)
        
        if cached_stats:
            return jsonify({'data': cached_stats, 'cached': True}), 200
        
        # Calculate stats
        user_count = User.query.count()
        redis_keys = redis_client.dbsize()
        
        stats = {
            'users_count': user_count,
            'redis_keys': redis_keys,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Cache for 30 seconds
        redis_client.setex(cache_key, 30, str(stats))
        
        return jsonify({'data': stats, 'cached': False}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """Clear all cache"""
    try:
        redis_client.flushdb()
        return jsonify({'message': 'Cache cleared successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== Error Handlers ====================
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({'error': 'Internal server error'}), 500

# ==================== Initialize Database ====================
@app.before_request
def create_tables():
    """Create tables if they don't exist"""
    if not hasattr(app, '_tables_created'):
        db.create_all()
        app._tables_created = True

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)