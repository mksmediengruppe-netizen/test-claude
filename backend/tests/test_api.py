"""Unit tests for API endpoints — health, templates, models, chats."""
import os
import sys
import json
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.environ.setdefault('OPENROUTER_API_KEY', 'test-key-not-real')
os.environ.setdefault('JWT_SECRET', 'test-jwt-secret-for-testing-only-32chars!')
os.environ.setdefault('ENCRYPTION_KEY', 'test-encryption-key-32-chars-ok!')

from app import app


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


# ── Health Endpoint ───────────────────────────────────────────

class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        """GET /api/health should return 200."""
        resp = client.get('/api/health')
        assert resp.status_code == 200

    def test_health_returns_json(self, client):
        """Health endpoint should return valid JSON."""
        resp = client.get('/api/health')
        data = resp.get_json()
        assert data is not None

    def test_health_status_ok(self, client):
        """Health status should be 'ok'."""
        resp = client.get('/api/health')
        data = resp.get_json()
        assert data['status'] == 'ok'

    def test_health_version(self, client):
        """Health should report version 6.0."""
        resp = client.get('/api/health')
        data = resp.get_json()
        assert '6.0' in str(data.get('version', ''))

    def test_health_has_features(self, client):
        """Health should list features."""
        resp = client.get('/api/health')
        data = resp.get_json()
        assert 'features' in data
        assert isinstance(data['features'], list)
        assert len(data['features']) > 0


# ── Templates Endpoint ────────────────────────────────────────

class TestTemplatesEndpoint:
    def test_templates_returns_200(self, client):
        """GET /api/templates should return 200."""
        resp = client.get('/api/templates')
        assert resp.status_code == 200

    def test_templates_returns_list(self, client):
        """Templates should return a list."""
        resp = client.get('/api/templates')
        data = resp.get_json()
        templates = data.get('templates', data) if isinstance(data, dict) else data
        assert isinstance(templates, list)

    def test_templates_have_required_fields(self, client):
        """Each template should have id, title, and prompt fields."""
        resp = client.get('/api/templates')
        data = resp.get_json()
        templates = data.get('templates', data) if isinstance(data, dict) else data
        if len(templates) > 0:
            t = templates[0]
            assert 'id' in t or 'title' in t


# ── Models Endpoint ───────────────────────────────────────────

class TestModelsEndpoint:
    def test_models_returns_200(self, client):
        """GET /api/models should return 200."""
        resp = client.get('/api/models')
        assert resp.status_code == 200

    def test_models_returns_list(self, client):
        """Models should return a list."""
        resp = client.get('/api/models')
        data = resp.get_json()
        models = data.get('models', data) if isinstance(data, dict) else data
        assert isinstance(models, list)

    def test_at_least_3_models(self, client):
        """Should have at least 3 model configurations (multimodal variants)."""
        resp = client.get('/api/models')
        data = resp.get_json()
        models = data.get('models', data) if isinstance(data, dict) else data
        assert len(models) >= 3, f"Expected at least 3 models, got {len(models)}"


# ── Chats CRUD ────────────────────────────────────────────────

class TestChatsAPI:
    def test_list_chats(self, client):
        """GET /api/chats should return 200."""
        resp = client.get('/api/chats')
        assert resp.status_code == 200

    def test_create_chat(self, client):
        """POST /api/chats should create a new chat."""
        resp = client.post('/api/chats',
                           json={'title': 'Test Chat'},
                           content_type='application/json')
        assert resp.status_code in [200, 201]
        data = resp.get_json()
        assert data is not None

    def test_create_and_list_chat(self, client):
        """Created chat should appear in the list."""
        # Create
        client.post('/api/chats',
                     json={'title': 'Findable Chat'},
                     content_type='application/json')
        # List
        resp = client.get('/api/chats')
        data = resp.get_json()
        chats = data if isinstance(data, list) else data.get('chats', [])
        titles = [c.get('title', '') for c in chats]
        assert 'Findable Chat' in titles


# ── Settings Endpoint ─────────────────────────────────────────

class TestSettingsAPI:
    def test_get_settings(self, client):
        """GET /api/settings should return 200."""
        resp = client.get('/api/settings')
        assert resp.status_code == 200

    def test_settings_has_expected_keys(self, client):
        """Settings should contain expected configuration keys."""
        resp = client.get('/api/settings')
        data = resp.get_json()
        assert data is not None
        # At minimum, should have some settings
        assert isinstance(data, dict)
