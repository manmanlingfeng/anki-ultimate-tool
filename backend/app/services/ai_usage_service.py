"""
AI Usage Tracking Service - Tracks and limits monthly AI API costs.
"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

# Default monthly limit in USD
DEFAULT_MONTHLY_LIMIT = 5.0

# Usage data file location
DATA_DIR = Path(__file__).parent.parent.parent / "data"
USAGE_FILE = DATA_DIR / "ai_usage.json"


class AIUsageService:
    def __init__(self):
        self._ensure_data_dir()
        self._monthly_limit = float(os.getenv("AI_MONTHLY_LIMIT", DEFAULT_MONTHLY_LIMIT))

    def _ensure_data_dir(self):
        """Ensure data directory exists"""
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    def _load_usage(self) -> dict:
        """Load usage data from file"""
        if not USAGE_FILE.exists():
            return {"months": {}}
        try:
            with open(USAGE_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {"months": {}}

    def _save_usage(self, data: dict):
        """Save usage data to file"""
        self._ensure_data_dir()
        with open(USAGE_FILE, "w") as f:
            json.dump(data, f, indent=2)

    def _get_current_month_key(self) -> str:
        """Get current month key (YYYY-MM)"""
        return datetime.now().strftime("%Y-%m")

    def get_monthly_limit(self) -> float:
        """Get the configured monthly limit"""
        return self._monthly_limit

    def set_monthly_limit(self, limit: float):
        """Set the monthly limit (runtime only, use env var for persistence)"""
        self._monthly_limit = limit

    def get_current_usage(self) -> dict:
        """Get current month's usage statistics"""
        data = self._load_usage()
        month_key = self._get_current_month_key()
        month_data = data.get("months", {}).get(month_key, {
            "total_cost": 0.0,
            "total_requests": 0,
            "total_tokens": 0,
            "last_request": None
        })

        return {
            "month": month_key,
            "total_cost": month_data.get("total_cost", 0.0),
            "total_requests": month_data.get("total_requests", 0),
            "total_tokens": month_data.get("total_tokens", 0),
            "monthly_limit": self._monthly_limit,
            "remaining": max(0, self._monthly_limit - month_data.get("total_cost", 0.0)),
            "limit_reached": month_data.get("total_cost", 0.0) >= self._monthly_limit,
            "usage_percent": min(100, (month_data.get("total_cost", 0.0) / self._monthly_limit) * 100) if self._monthly_limit > 0 else 0,
            "last_request": month_data.get("last_request")
        }

    def can_make_request(self, estimated_cost: float = 0.0) -> tuple[bool, Optional[str]]:
        """Check if a request can be made within budget"""
        usage = self.get_current_usage()

        if usage["limit_reached"]:
            return False, f"Monthly AI budget (${self._monthly_limit:.2f}) exceeded. Used: ${usage['total_cost']:.3f}"

        if usage["total_cost"] + estimated_cost > self._monthly_limit:
            return False, f"Request would exceed monthly budget. Remaining: ${usage['remaining']:.3f}"

        return True, None

    def record_usage(self, cost: float, tokens: int = 0, input_tokens: int = 0, output_tokens: int = 0):
        """Record a completed AI request with actual token usage"""
        data = self._load_usage()
        month_key = self._get_current_month_key()

        if "months" not in data:
            data["months"] = {}

        if month_key not in data["months"]:
            data["months"][month_key] = {
                "total_cost": 0.0,
                "total_requests": 0,
                "total_tokens": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "last_request": None
            }

        month_data = data["months"][month_key]
        month_data["total_cost"] = round(month_data.get("total_cost", 0.0) + cost, 6)
        month_data["total_requests"] = month_data.get("total_requests", 0) + 1
        month_data["total_tokens"] = month_data.get("total_tokens", 0) + tokens
        month_data["input_tokens"] = month_data.get("input_tokens", 0) + input_tokens
        month_data["output_tokens"] = month_data.get("output_tokens", 0) + output_tokens
        month_data["last_request"] = datetime.now().isoformat()

        self._save_usage(data)

    def get_usage_history(self, months: int = 6) -> list[dict]:
        """Get usage history for the last N months"""
        data = self._load_usage()
        months_data = data.get("months", {})

        # Sort by month key descending
        sorted_months = sorted(months_data.keys(), reverse=True)[:months]

        return [
            {
                "month": month,
                "total_cost": months_data[month].get("total_cost", 0.0),
                "total_requests": months_data[month].get("total_requests", 0),
                "total_tokens": months_data[month].get("total_tokens", 0),
            }
            for month in sorted_months
        ]

    def reset_current_month(self):
        """Reset current month's usage (for testing/admin)"""
        data = self._load_usage()
        month_key = self._get_current_month_key()

        if "months" in data and month_key in data["months"]:
            del data["months"][month_key]
            self._save_usage(data)


# Singleton instance
ai_usage_service = AIUsageService()
