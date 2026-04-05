"""
AI Service for Gemini-powered deck scanning.

Uses Google Gemini 2.0 Flash for:
- Pinyin validation
- Content quality checking
- Example generation
"""
import os
import json
from typing import Any

try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    try:
        # Fallback to old package
        import google.generativeai as genai
        types = genai.types
        GENAI_AVAILABLE = True
    except ImportError:
        GENAI_AVAILABLE = False
        genai = None
        types = None


class AIService:
    BATCH_SIZE = 50
    MODEL_NAME = "gemini-2.0-flash"

    # Pricing per 1M tokens (Gemini Flash)
    COST_PER_1M_INPUT = 0.10
    COST_PER_1M_OUTPUT = 0.40
    TOKENS_PER_CARD_ESTIMATE = 50  # Avg tokens per card

    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.client = None
        self._init_client()

    def _init_client(self):
        """Initialize Gemini client if API key configured"""
        if not GENAI_AVAILABLE:
            print("Warning: google-genai not installed. Run: pip install google-genai")
            return

        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"Warning: Failed to initialize Gemini client: {e}")

    def is_available(self) -> bool:
        """Check if AI service is configured and ready"""
        return self.client is not None

    def estimate_cost(self, card_count: int) -> dict:
        """Estimate API cost for given card count"""
        estimated_input_tokens = card_count * self.TOKENS_PER_CARD_ESTIMATE
        estimated_output_tokens = card_count * 20  # Smaller output per card

        input_cost = (estimated_input_tokens / 1_000_000) * self.COST_PER_1M_INPUT
        output_cost = (estimated_output_tokens / 1_000_000) * self.COST_PER_1M_OUTPUT
        total_cost = input_cost + output_cost

        return {
            "card_count": card_count,
            "estimated_tokens": estimated_input_tokens + estimated_output_tokens,
            "estimated_cost": round(total_cost, 4)
        }

    def calculate_actual_cost(self, usage_info: dict) -> float:
        """Calculate actual cost from token usage"""
        input_tokens = usage_info.get("input_tokens", 0)
        output_tokens = usage_info.get("output_tokens", 0)

        input_cost = (input_tokens / 1_000_000) * self.COST_PER_1M_INPUT
        output_cost = (output_tokens / 1_000_000) * self.COST_PER_1M_OUTPUT

        return round(input_cost + output_cost, 6)

    def batch_cards(self, cards: list[dict]) -> list[list[dict]]:
        """Split cards into batches of BATCH_SIZE"""
        return [
            cards[i:i + self.BATCH_SIZE]
            for i in range(0, len(cards), self.BATCH_SIZE)
        ]

    async def call_gemini(self, prompt: str) -> tuple[str, dict]:
        """Make async call to Gemini API and return (text, usage_info)"""
        if not self.client:
            raise Exception("Gemini API not configured. Set GEMINI_API_KEY environment variable.")

        try:
            response = await self.client.aio.models.generate_content(
                model=self.MODEL_NAME,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,  # Low temp for accuracy
                )
            )

            # Extract actual token usage from response
            usage_info = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
            if hasattr(response, 'usage_metadata') and response.usage_metadata:
                usage_info = {
                    "input_tokens": getattr(response.usage_metadata, 'prompt_token_count', 0) or 0,
                    "output_tokens": getattr(response.usage_metadata, 'candidates_token_count', 0) or 0,
                    "total_tokens": getattr(response.usage_metadata, 'total_token_count', 0) or 0,
                }

            return response.text, usage_info
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    def parse_json_response(self, response: str) -> dict[str, Any]:
        """Parse JSON from Gemini response, handling markdown wrapping and list responses"""
        def ensure_dict(data: Any) -> dict[str, Any]:
            """Ensure we return a dict, extracting from list if needed"""
            if isinstance(data, list) and len(data) > 0:
                return dict(data[0]) if isinstance(data[0], dict) else {}
            return dict(data) if isinstance(data, dict) else {}

        try:
            result = json.loads(response)
            return ensure_dict(result)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code blocks
            if "```json" in response:
                start = response.find("```json") + 7
                end = response.find("```", start)
                if end > start:
                    result = json.loads(response[start:end].strip())
                    return ensure_dict(result)
            elif "```" in response:
                start = response.find("```") + 3
                end = response.find("```", start)
                if end > start:
                    result = json.loads(response[start:end].strip())
                    return ensure_dict(result)
            raise Exception("Failed to parse AI response as JSON")


# Singleton instance
ai_service = AIService()
