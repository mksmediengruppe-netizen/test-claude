"""Shared fixtures for Super Agent v6.0 test suite."""
import os
import sys
import json
import pytest
import tempfile

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Set test environment variables before importing app
os.environ.setdefault('OPENROUTER_API_KEY', 'test-key-not-real')
os.environ.setdefault('JWT_SECRET', 'test-jwt-secret-for-testing-only-32chars!')
os.environ.setdefault('ENCRYPTION_KEY', 'test-encryption-key-32-chars-ok!')


@pytest.fixture
def app():
    """Create a test Flask app instance."""
    from app import app as flask_app
    flask_app.config['TESTING'] = True
    return flask_app


@pytest.fixture
def client(app):
    """Create a test client."""
    return app.test_client()


@pytest.fixture
def temp_dir():
    """Create a temporary directory for test data."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir
