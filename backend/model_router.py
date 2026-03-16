"""
Model Router — Super Agent v6.0 Multi-Model Routing
====================================================
Расширенный маршрутизатор моделей с классификацией сложности,
fallback chain, и cost tracking.

Не заменяет существующий LangGraph router — добавляет слой сверху.
"""

import os
import re
import json
import time
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger("model_router")

# ══════════════════════════════════════════════════════════════
# MODEL REGISTRY
# ══════════════════════════════════════════════════════════════

# Tiered model registry: fast → standard → powerful
MODEL_TIERS = {
    "fast": {
        "models": [
            {"id": "openai/gpt-4.1-nano", "name": "GPT-4.1 Nano", "input_price": 0.05, "output_price": 0.40, "max_tokens": 8000},
            {"id": "deepseek/deepseek-v3.2", "name": "DeepSeek V3.2", "input_price": 0.26, "output_price": 0.38, "max_tokens": 16000},
        ],
        "max_complexity": 2,
        "description": "Simple questions, greetings, short answers"
    },
    "standard": {
        "models": [
            {"id": "qwen/qwen3-235b-a22b", "name": "Qwen3 235B", "input_price": 0.10, "output_price": 0.60, "max_tokens": 32000},
            {"id": "minimax/minimax-m2.5", "name": "MiniMax M2.5", "input_price": 0.27, "output_price": 0.95, "max_tokens": 32000},
        ],
        "max_complexity": 4,
        "description": "Code generation, analysis, multi-step tasks"
    },
    "powerful": {
        "models": [
            {"id": "anthropic/claude-sonnet-4.6", "name": "Claude Sonnet 4.6", "input_price": 3.00, "output_price": 15.00, "max_tokens": 128000},
            {"id": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4", "input_price": 3.00, "output_price": 15.00, "max_tokens": 64000},
        ],
        "max_complexity": 5,
        "description": "Complex reasoning, planning, architecture"
    }
}

# Fallback chains per tier
FALLBACK_CHAINS = {
    "fast": ["openai/gpt-4.1-nano", "deepseek/deepseek-v3.2", "qwen/qwen3-235b-a22b"],
    "standard": ["qwen/qwen3-235b-a22b", "minimax/minimax-m2.5", "deepseek/deepseek-v3.2"],
    "powerful": ["anthropic/claude-sonnet-4.6", "anthropic/claude-sonnet-4", "qwen/qwen3-235b-a22b", "minimax/minimax-m2.5"],
}

# Cost tracking store
_cost_log_path = os.environ.get("DATA_DIR", "/var/www/super-agent/backend/data") + "/cost_log.json"
_cost_log = []


def classify_complexity(query: str, history: List[Dict] = None) -> int:
    """
    Classify query complexity on a 1-5 scale.
    1-2: Simple (greetings, short factual, translations)
    3: Medium (code snippets, explanations, summaries)
    4: Complex (multi-file code, analysis, debugging)
    5: Expert (architecture, planning, research)
    
    Returns: int 1-5
    """
    query_lower = query.lower()
    word_count = len(query.split())

    # Score starts at 2 (baseline)
    score = 2

    # Length-based scoring
    if word_count < 5:
        score -= 1
    elif word_count > 50:
        score += 1
    elif word_count > 150:
        score += 2

    # Simple patterns (reduce complexity)
    simple_patterns = [
        r"^(привет|hello|hi|hey|здравствуй|добрый)",
        r"^(спасибо|thanks|thank you|благодар)",
        r"^(да|нет|yes|no|ok|ок|хорошо)$",
        r"^переведи",
        r"^(что такое|what is)\s+\w+\??$",
    ]
    for pattern in simple_patterns:
        if re.search(pattern, query_lower):
            score = max(1, score - 1)

    # Medium complexity patterns
    medium_patterns = [
        r"(напиши|write|create|сделай)\s+(код|code|функци|скрипт|script)",
        r"(объясни|explain|расскажи|describe)",
        r"(сравни|compare|отличи|difference)",
        r"(исправь|fix|debug|ошибк|error|bug)",
    ]
    for pattern in medium_patterns:
        if re.search(pattern, query_lower):
            score = max(3, score)

    # Complex patterns
    complex_patterns = [
        r"(архитектур|architecture|design pattern|паттерн)",
        r"(проект|project|приложение|application|систем|system)",
        r"(анализ|analyze|исследу|research|оптимиз|optimize)",
        r"(план|plan|стратеги|strategy|roadmap)",
        r"(рефактор|refactor|переписа|rewrite)",
        r"(деплой|deploy|настрой сервер|configure server)",
        r"(несколько файлов|multiple files|full stack|фулл стек)",
        r"(безопасност|security|аудит|audit)",
    ]
    for pattern in complex_patterns:
        if re.search(pattern, query_lower):
            score = max(4, score)

    # Expert patterns
    expert_patterns = [
        r"(спроектируй|design|architect)\s+.*(систем|system|платформ|platform)",
        r"(полный проект|full project|с нуля|from scratch)",
        r"(микросервис|microservice|distributed|распределён)",
        r"(machine learning|ml|нейросет|neural)",
    ]
    for pattern in expert_patterns:
        if re.search(pattern, query_lower):
            score = 5

    # Context from history
    if history and len(history) > 5:
        score = min(5, score + 1)  # Long conversations tend to be complex

    # File/code content increases complexity
    if any(kw in query_lower for kw in ["```", "файл:", "file:", "import ", "def ", "class "]):
        score = max(3, score)

    return max(1, min(5, score))


def select_model(query: str, variant: str = "premium",
                 history: List[Dict] = None,
                 preferred_model: str = None) -> Dict[str, Any]:
    """
    Select the best model for a given query based on complexity and variant.
    
    Returns: {model_id, model_name, tier, complexity, fallback_chain}
    """
    complexity = classify_complexity(query, history)

    # Determine tier from complexity
    if complexity <= 2:
        tier = "fast"
    elif complexity <= 4:
        tier = "standard"
    else:
        tier = "powerful"

    # Get models for tier
    tier_config = MODEL_TIERS[tier]
    models = tier_config["models"]

    # Select primary model
    if preferred_model:
        # Check if preferred model is in any tier
        for t_name, t_config in MODEL_TIERS.items():
            for m in t_config["models"]:
                if m["id"] == preferred_model:
                    return {
                        "model_id": m["id"],
                        "model_name": m["name"],
                        "tier": t_name,
                        "complexity": complexity,
                        "input_price": m["input_price"],
                        "output_price": m["output_price"],
                        "max_tokens": m["max_tokens"],
                        "fallback_chain": FALLBACK_CHAINS.get(t_name, [])
                    }

    primary = models[0]
    return {
        "model_id": primary["id"],
        "model_name": primary["name"],
        "tier": tier,
        "complexity": complexity,
        "input_price": primary["input_price"],
        "output_price": primary["output_price"],
        "max_tokens": primary["max_tokens"],
        "fallback_chain": FALLBACK_CHAINS.get(tier, [])
    }


def get_fallback_model(current_model: str, tier: str = "standard") -> Optional[str]:
    """Get next fallback model in the chain."""
    chain = FALLBACK_CHAINS.get(tier, FALLBACK_CHAINS["standard"])
    try:
        idx = chain.index(current_model)
        if idx + 1 < len(chain):
            return chain[idx + 1]
    except ValueError:
        pass
    # Return first model in standard chain as ultimate fallback
    return FALLBACK_CHAINS["standard"][0]


def log_cost(user_id: str, model_id: str, tokens_in: int, tokens_out: int,
             cost_usd: float, tier: str, complexity: int,
             tool_name: str = None, success: bool = True):
    """Log cost for analytics and optimization."""
    global _cost_log

    entry = {
        "user_id": user_id,
        "model_id": model_id,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "cost_usd": cost_usd,
        "tier": tier,
        "complexity": complexity,
        "tool_name": tool_name,
        "success": success,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    _cost_log.append(entry)

    # Persist periodically (every 10 entries)
    if len(_cost_log) % 10 == 0:
        _save_cost_log()


def get_cost_analytics(user_id: str = None, days: int = 30) -> Dict[str, Any]:
    """Get cost analytics for dashboard."""
    _load_cost_log()

    entries = _cost_log
    if user_id:
        entries = [e for e in entries if e.get("user_id") == user_id]

    # Filter by date
    cutoff = datetime.now(timezone.utc).timestamp() - days * 86400
    entries = [e for e in entries if _parse_ts(e.get("timestamp", "")) > cutoff]

    if not entries:
        return {"total_cost": 0, "total_requests": 0, "by_tier": {}, "by_model": {}}

    total_cost = sum(e.get("cost_usd", 0) for e in entries)
    total_requests = len(entries)
    total_tokens_in = sum(e.get("tokens_in", 0) for e in entries)
    total_tokens_out = sum(e.get("tokens_out", 0) for e in entries)

    # By tier
    by_tier = {}
    for e in entries:
        tier = e.get("tier", "unknown")
        if tier not in by_tier:
            by_tier[tier] = {"cost": 0, "requests": 0}
        by_tier[tier]["cost"] += e.get("cost_usd", 0)
        by_tier[tier]["requests"] += 1

    # By model
    by_model = {}
    for e in entries:
        model = e.get("model_id", "unknown")
        if model not in by_model:
            by_model[model] = {"cost": 0, "requests": 0}
        by_model[model]["cost"] += e.get("cost_usd", 0)
        by_model[model]["requests"] += 1

    # Success rate
    success_count = sum(1 for e in entries if e.get("success", True))
    success_rate = round(success_count / max(total_requests, 1) * 100, 1)

    return {
        "total_cost": round(total_cost, 4),
        "total_requests": total_requests,
        "total_tokens_in": total_tokens_in,
        "total_tokens_out": total_tokens_out,
        "avg_cost_per_request": round(total_cost / max(total_requests, 1), 6),
        "success_rate": success_rate,
        "by_tier": by_tier,
        "by_model": by_model,
        "period_days": days
    }


def _parse_ts(ts_str: str) -> float:
    try:
        return datetime.fromisoformat(ts_str).timestamp()
    except Exception:
        return 0


def _load_cost_log():
    global _cost_log
    try:
        if os.path.exists(_cost_log_path):
            with open(_cost_log_path, "r") as f:
                _cost_log = json.load(f)
    except Exception:
        _cost_log = []


def _save_cost_log():
    try:
        os.makedirs(os.path.dirname(_cost_log_path), exist_ok=True)
        # Keep only last 10000 entries
        data = _cost_log[-10000:]
        with open(_cost_log_path, "w") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed to save cost log: {e}")
