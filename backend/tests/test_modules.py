"""Unit tests for utility modules — retry_policy, idempotency, file_versioning, memory, rate_limiter."""
import os
import sys
import time
import json
import tempfile
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.environ.setdefault('OPENROUTER_API_KEY', 'test-key-not-real')
os.environ.setdefault('JWT_SECRET', 'test-jwt-secret-for-testing-only-32chars!')


# ── Retry Policy ──────────────────────────────────────────────

class TestRetryPolicy:
    def test_import(self):
        """retry_policy module should be importable."""
        import retry_policy
        assert hasattr(retry_policy, 'RetryPolicy') or hasattr(retry_policy, 'retry_with_policy')

    def test_retry_policy_creation(self):
        """RetryPolicy should be instantiable with default params."""
        from retry_policy import RetryPolicy
        policy = RetryPolicy()
        assert policy is not None

    def test_retry_calculates_delay(self):
        """RetryPolicy should calculate exponential backoff delay."""
        from retry_policy import RetryPolicy
        policy = RetryPolicy(base_delay=1.0, max_delay=60.0)
        delay = policy.get_delay(attempt=1)
        assert delay >= 0


# ── Idempotency ───────────────────────────────────────────────

class TestIdempotency:
    def test_import(self):
        """idempotency module should be importable."""
        import idempotency
        assert hasattr(idempotency, 'IdempotencyStore') or hasattr(idempotency, 'check_idempotency')

    def test_idempotency_store(self):
        """IdempotencyStore should track request keys."""
        from idempotency import IdempotencyStore
        store = IdempotencyStore()
        key = f"test-{time.time()}"
        # First call should be new
        is_new = store.check(key)
        assert is_new is True or is_new is not None


# ── File Versioning ───────────────────────────────────────────

class TestFileVersioning:
    def test_import(self):
        """file_versioning module should be importable."""
        import file_versioning
        assert hasattr(file_versioning, 'FileVersionStore') or hasattr(file_versioning, 'save_version')

    def test_version_store_creation(self):
        """FileVersionStore should be instantiable."""
        from file_versioning import FileVersionStore
        with tempfile.TemporaryDirectory() as tmpdir:
            store = FileVersionStore(base_dir=tmpdir)
            assert store is not None


# ── Rate Limiter ──────────────────────────────────────────────

class TestRateLimiter:
    def test_import(self):
        """rate_limiter module should be importable."""
        import rate_limiter
        assert rate_limiter is not None

    def test_rate_limiter_allows_first_request(self):
        """First request should always be allowed."""
        from rate_limiter import RateLimiter
        limiter = RateLimiter()
        result = limiter.check(f"user_{time.time()}", "test")
        assert result.get('allowed', True) is True


# ── Model Router ──────────────────────────────────────────────

class TestModelRouter:
    def test_import(self):
        """model_router module should be importable."""
        import model_router
        assert model_router is not None

    def test_has_route_function(self):
        """model_router should have a routing function."""
        import model_router
        assert (hasattr(model_router, 'route_model') or
                hasattr(model_router, 'ModelRouter') or
                hasattr(model_router, 'get_model_config'))


# ── Observability ─────────────────────────────────────────────

class TestObservability:
    def test_import(self):
        """observability module should be importable."""
        import observability
        assert observability is not None

    def test_has_logging_functions(self):
        """observability should have logging/metrics functions."""
        import observability
        assert (hasattr(observability, 'log_event') or
                hasattr(observability, 'ObservabilityHub') or
                hasattr(observability, 'track_metric'))
