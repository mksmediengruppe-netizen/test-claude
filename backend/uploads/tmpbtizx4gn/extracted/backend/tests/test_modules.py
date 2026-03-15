"""Unit tests for utility modules — retry_policy, idempotency, file_versioning, rate_limiter, model_router, observability."""
import os
import sys
import time
import json
import tempfile
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.environ.setdefault('OPENROUTER_API_KEY', 'test-key-not-real')
os.environ.setdefault('JWT_SECRET', 'test-jwt-secret-for-testing-only-32chars!')
os.environ.setdefault('ENCRYPTION_KEY', 'test-encryption-key-32-chars-ok!')


# ── Retry Policy ──────────────────────────────────────────────

class TestRetryPolicy:
    def test_import(self):
        """retry_policy module should be importable."""
        import retry_policy
        assert hasattr(retry_policy, 'retry')

    def test_circuit_breaker_creation(self):
        """CircuitBreaker should be instantiable."""
        from retry_policy import CircuitBreaker
        cb = CircuitBreaker(name="test", failure_threshold=3)
        assert cb is not None

    def test_get_breaker(self):
        """get_breaker should return a CircuitBreaker."""
        from retry_policy import get_breaker
        breaker = get_breaker("test_breaker")
        assert breaker is not None

    def test_retryable_error(self):
        """RetryableError should be an Exception."""
        from retry_policy import RetryableError
        err = RetryableError("test error")
        assert str(err) == "test error"


# ── Idempotency ───────────────────────────────────────────────

class TestIdempotency:
    def test_import(self):
        """idempotency module should be importable."""
        import idempotency
        assert hasattr(idempotency, 'IdempotencyStore')

    def test_idempotency_store(self):
        """IdempotencyStore should track request keys."""
        from idempotency import IdempotencyStore
        store = IdempotencyStore()
        key = f"test-{time.time()}"
        result = store.check(key)
        assert result is not None

    def test_make_key(self):
        """make_key should produce a deterministic hash."""
        from idempotency import make_key
        k1 = make_key("a", "b", "c")
        k2 = make_key("a", "b", "c")
        assert k1 == k2

    def test_is_idempotent_command(self):
        """Should identify idempotent commands."""
        from idempotency import is_idempotent_command
        assert is_idempotent_command("ls -la") is True

    def test_is_mutating_command(self):
        """Should identify mutating commands."""
        from idempotency import is_mutating_command
        assert is_mutating_command("rm -rf /tmp/test") is True


# ── File Versioning ───────────────────────────────────────────

class TestFileVersioning:
    def test_import(self):
        """file_versioning module should be importable."""
        import file_versioning
        assert hasattr(file_versioning, 'FileVersionStore')

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

    def test_sliding_window_limiter(self):
        """SlidingWindowRateLimiter should be instantiable."""
        from rate_limiter import SlidingWindowRateLimiter
        limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=60)
        assert limiter is not None

    def test_rate_limit_manager(self):
        """RateLimitManager should be instantiable."""
        from rate_limiter import RateLimitManager
        mgr = RateLimitManager()
        assert mgr is not None

    def test_get_rate_limiter(self):
        """get_rate_limiter should return a RateLimitManager."""
        from rate_limiter import get_rate_limiter
        limiter = get_rate_limiter()
        assert limiter is not None


# ── Model Router ──────────────────────────────────────────────

class TestModelRouter:
    def test_import(self):
        """model_router module should be importable."""
        import model_router
        assert model_router is not None

    def test_classify_complexity(self):
        """classify_complexity should return an integer."""
        from model_router import classify_complexity
        result = classify_complexity("Hello, how are you?")
        assert isinstance(result, int)

    def test_select_model(self):
        """select_model should return a model config dict."""
        from model_router import select_model
        result = select_model("Write a Python function", variant="premium")
        assert isinstance(result, dict)
        assert "model" in result or "id" in result

    def test_select_model_variants(self):
        """select_model should work with all 3 variants."""
        from model_router import select_model
        for variant in ["original", "premium", "budget"]:
            result = select_model("test query", variant=variant)
            assert isinstance(result, dict), f"Failed for variant {variant}"


# ── Observability ─────────────────────────────────────────────

class TestObservability:
    def test_import(self):
        """observability module should be importable."""
        import observability
        assert observability is not None

    def test_generate_request_id(self):
        """generate_request_id should return a string."""
        from observability import generate_request_id
        rid = generate_request_id()
        assert isinstance(rid, str)
        assert len(rid) > 0

    def test_start_and_end_trace(self):
        """Trace lifecycle should work."""
        from observability import start_trace, end_trace, generate_request_id
        rid = generate_request_id()
        trace = start_trace(rid, "test_op")
        assert trace is not None
        result = end_trace(rid, status="success")
        assert result is not None

    def test_metrics_collector(self):
        """MetricsCollector should be instantiable."""
        from observability import get_metrics_collector
        mc = get_metrics_collector()
        assert mc is not None
