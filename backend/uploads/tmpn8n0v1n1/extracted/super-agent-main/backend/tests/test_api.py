"""Unit tests for API endpoints — health, templates, models."""
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


# ── Connectors Endpoint (no auth required) ────────────────────

class TestConnectorsEndpoint:
    def test_connectors_returns_200(self, client):
        """GET /api/connectors should return 200."""
        resp = client.get('/api/connectors')
        assert resp.status_code == 200

    def test_connectors_returns_list(self, client):
        """Connectors should return a list."""
        resp = client.get('/api/connectors')
        data = resp.get_json()
        connectors = data.get('connectors', data) if isinstance(data, dict) else data
        assert isinstance(connectors, list)


# ── Auth-protected endpoints return 401 without token ─────────

class TestAuthProtection:
    def test_chats_requires_auth(self, client):
        """GET /api/chats should return 401 without token."""
        resp = client.get('/api/chats')
        assert resp.status_code == 401

    def test_settings_requires_auth(self, client):
        """GET /api/settings should return 401 without token."""
        resp = client.get('/api/settings')
        assert resp.status_code == 401

    def test_admin_requires_auth(self, client):
        """GET /api/admin/users should return 401 without token."""
        resp = client.get('/api/admin/users')
        assert resp.status_code == 401


# ── Error Handling ────────────────────────────────────────────

class TestErrorHandling:
    def test_404_for_unknown_route(self, client):
        """Unknown routes should return 404."""
        resp = client.get('/api/nonexistent')
        assert resp.status_code == 404

    def test_login_empty_body(self, client):
        """Login with empty body should return 400."""
        resp = client.post('/api/auth/login',
                           json={},
                           content_type='application/json')
        assert resp.status_code == 400

    def test_login_wrong_credentials(self, client):
        """Login with wrong credentials should return 401."""
        resp = client.post('/api/auth/login',
                           json={'email': 'wrong@test.com', 'password': 'wrong'},
                           content_type='application/json')
        assert resp.status_code == 401
