"""
Flask Application Example with PostgreSQL and Redis
"""
import os
from datetime import datetime
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import redis
import structlog

# Initialize logger
log = structlog.get_logger()

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL',
    'postgresql://postgres:postgres@postgres:5432/appdb'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
db = SQLAlchemy(app)

# Initialize Redis
redis_client = redis.from_url(
    os.getenv('REDIS_URL', 'redis://:redispass@redis:6379/0'),
    decode_responses=True
)


# Database Model
class User(db.Model):
    """User model"""
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


# Routes
@app.route('/')
def index():
    """Root endpoint"""
    return jsonify({
        'message': 'Flask + PostgreSQL + Redis + Nginx',
        'version': os.getenv('APP_VERSION', '1.0.0'),
        'timestamp': datetime.utcnow().isoformat()
    })


@app.route('/health')
def health():
    """Health check endpoint"""
    # Check database connection
    db_status = 'ok'
    try:
        db.session.execute(db.text('SELECT 1'))
    except Exception as e:
        db_status = f'error: {str(e)}'
        log.error('Database health check failed', error=str(e))

    # Check Redis connection
    redis_status = 'ok'
    try:
        redis_client.ping()
    except Exception as e:
        redis_status = f'error: {str(e)}'
        log.error('Redis health check failed', error=str(e))

    return jsonify({
        'status': 'healthy',
        'database': db_status,
        'redis': redis_status,
        'timestamp': datetime.utcnow().isoformat()
    }), 200


@app.route('/api/users', methods=['GET'])
def get_users():
    """Get all users (with caching)"""
    cache_key = 'users:all'
    
    # Try to get from cache
    cached_data = redis_client.get(cache_key)
    if cached_data:
        log.info('Users retrieved from cache')
        return jsonify({'source': 'cache', 'data': cached_data})
    
    # Query database
    users = User.query.all()
    users_data = [user.to_dict() for user in users]
    
    # Cache for 60 seconds
    redis_client.setex(cache_key, 60, str(users_data))
    
    log.info('Users retrieved from database', count=len(users))
    return jsonify({'source': 'database', 'data': users_data})


@app.route('/api/users', methods=['POST'])
def create_user():
    """Create a new user"""
    data = request.get_json()
    
    if not data or 'username' not in data or 'email' not in data:
        return jsonify({'error': 'username and email are required'}), 400
    
    # Check if user exists
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 400
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already exists'}), 400
    
    # Create user
    user = User(username=data['username'], email=data['email'])
    db.session.add(user)
    db.session.commit()
    
    # Invalidate cache
    redis_client.delete('users:all')
    
    log.info('User created', user_id=user.id, username=user.username)
    return jsonify({'message': 'User created', 'user': user.to_dict()}), 201


@app.route('/api/stats')
def get_stats():
    """Get application statistics"""
    # Get from cache or compute
    cache_key = 'stats:overview'
    cached_stats = redis_client.get(cache_key)
    
    if cached_stats:
        return jsonify({'source': 'cache', 'data': cached_stats})
    
    stats = {
        'total_users': User.query.count(),
        'redis_keys': redis_client.dbsize(),
        'timestamp': datetime.utcnow().isoformat()
    }
    
    # Cache for 30 seconds
    redis_client.setex(cache_key, 30, str(stats))
    
    return jsonify({'source': 'database', 'data': stats})


@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """Clear all cache"""
    keys = redis_client.keys('*')
    if keys:
        redis_client.delete(*keys)
    
    log.info('Cache cleared', keys_deleted=len(keys))
    return jsonify({'message': f'Cleared {len(keys)} cache keys'})


# Initialize database tables
with app.app_context():
    db.create_all()
    log.info('Database tables created')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
