"""
Field service for unified field suggestion handling.
Handles: Pinyin, Sino-Vietnamese, Definition, Examples, Simplified.
"""
from app.services.ai_service import ai_service
from app.services.dict_service import dict_service
from app.services.ai_usage_service import ai_usage_service
from app.services.field_prompts import (
    PINYIN_PROMPT,
    SINO_PROMPT,
    DEFINITION_PROMPT,
    SIMPLIFIED_PROMPT,
    EXAMPLES_PROMPT,
    VERIFY_SINO_PROMPT,
    VERIFY_DEFINITION_PROMPT,
    VERIFY_EXAMPLES_PROMPT,
    VERIFY_SIMPLIFIED_PROMPT,
)
from app.models.field import FieldType, FieldSuggestionResponse, FieldVerifyResponse


class FieldService:
    """Unified service for all field operations"""

    async def suggest_pinyin(self, word: str, note_id: int) -> FieldSuggestionResponse:
        """
        Suggest pinyin using dictionary-first strategy with AI fallback.

        Strategy:
        1. Try zdic.net dictionary (free, cached)
        2. If found → return first reading (most common)
        3. If polyphonic → return all alternatives
        4. If not found → AI fallback
        """
        # Try dictionary first
        entry = await dict_service.lookup(word)

        if entry and entry.readings:
            reading = entry.readings[0]  # Most common
            alternatives = None
            confidence = 0.95

            if entry.is_polyphonic:
                alternatives = [r.pinyin for r in entry.readings]
                confidence = 0.85  # Lower confidence for polyphonic

            return FieldSuggestionResponse(
                note_id=note_id,
                field_type=FieldType.PINYIN,
                suggestion=reading.pinyin,
                source="dictionary",
                confidence=confidence,
                alternatives=alternatives,
                cost=0.0,
            )

        # Fallback to AI
        return await self._ai_suggest_pinyin(word, note_id)

    async def _ai_suggest_pinyin(self, word: str, note_id: int) -> FieldSuggestionResponse:
        """AI fallback for pinyin when dictionary lookup fails"""
        prompt = PINYIN_PROMPT.format(word=word)
        response_text, usage_info = await ai_service.call_gemini(prompt)
        result = ai_service.parse_json_response(response_text)

        actual_cost = ai_service.calculate_actual_cost(usage_info)
        ai_usage_service.record_usage(
            cost=actual_cost,
            tokens=usage_info.get("total_tokens", 0),
            input_tokens=usage_info.get("input_tokens", 0),
            output_tokens=usage_info.get("output_tokens", 0),
        )

        return FieldSuggestionResponse(
            note_id=note_id,
            field_type=FieldType.PINYIN,
            suggestion=result["pinyin"],
            source="ai",
            confidence=result.get("confidence", 0.9),
            cost=actual_cost,
        )

    async def suggest_sino(
        self, word: str, pinyin: str, note_id: int
    ) -> FieldSuggestionResponse:
        """Suggest Sino-Vietnamese reading (AI only)"""
        prompt = SINO_PROMPT.format(word=word, pinyin=pinyin)
        response_text, usage_info = await ai_service.call_gemini(prompt)
        result = ai_service.parse_json_response(response_text)

        actual_cost = ai_service.calculate_actual_cost(usage_info)
        ai_usage_service.record_usage(
            cost=actual_cost,
            tokens=usage_info.get("total_tokens", 0),
            input_tokens=usage_info.get("input_tokens", 0),
            output_tokens=usage_info.get("output_tokens", 0),
        )

        return FieldSuggestionResponse(
            note_id=note_id,
            field_type=FieldType.SINO,
            suggestion=result["sino"],
            source="ai",
            confidence=result.get("confidence", 0.9),
            cost=actual_cost,
        )

    async def suggest_definition(
        self, word: str, pinyin: str, note_id: int
    ) -> FieldSuggestionResponse:
        """Suggest Vietnamese definition (AI only)"""
        prompt = DEFINITION_PROMPT.format(word=word, pinyin=pinyin)
        response_text, usage_info = await ai_service.call_gemini(prompt)
        result = ai_service.parse_json_response(response_text)

        actual_cost = ai_service.calculate_actual_cost(usage_info)
        ai_usage_service.record_usage(
            cost=actual_cost,
            tokens=usage_info.get("total_tokens", 0),
            input_tokens=usage_info.get("input_tokens", 0),
            output_tokens=usage_info.get("output_tokens", 0),
        )

        return FieldSuggestionResponse(
            note_id=note_id,
            field_type=FieldType.DEFINITION,
            suggestion=result["definition"],
            source="ai",
            confidence=result.get("confidence", 0.9),
            cost=actual_cost,
        )

    async def suggest_simplified(
        self, word: str, note_id: int
    ) -> FieldSuggestionResponse:
        """
        Suggest simplified Chinese.

        Strategy:
        1. Use OpenCC for local conversion (free, instant)
        2. If word is already simplified (same after conversion), return as-is
        3. Only for complex cases, fall back to AI
        """
        # Try local conversion first (no AI cost)
        try:
            from opencc import OpenCC
            converter = OpenCC('t2s')  # Traditional to Simplified
            local_simplified = converter.convert(word)

            # If word is already simplified (no change), return immediately
            if local_simplified == word:
                return FieldSuggestionResponse(
                    note_id=note_id,
                    field_type=FieldType.SIMPLIFIED,
                    suggestion=word,
                    source="local",
                    confidence=1.0,
                    cost=0.0,
                    is_already_simplified=True,
                )

            # Local conversion found a difference - use local result
            return FieldSuggestionResponse(
                note_id=note_id,
                field_type=FieldType.SIMPLIFIED,
                suggestion=local_simplified,
                source="dictionary",  # OpenCC is dictionary-based
                confidence=0.98,
                cost=0.0,
            )
        except Exception:
            # OpenCC not available or failed, fall back to AI
            pass

        # Fallback to AI for edge cases
        prompt = SIMPLIFIED_PROMPT.format(word=word)
        response_text, usage_info = await ai_service.call_gemini(prompt)
        result = ai_service.parse_json_response(response_text)

        actual_cost = ai_service.calculate_actual_cost(usage_info)
        ai_usage_service.record_usage(
            cost=actual_cost,
            tokens=usage_info.get("total_tokens", 0),
            input_tokens=usage_info.get("input_tokens", 0),
            output_tokens=usage_info.get("output_tokens", 0),
        )

        simplified = result["simplified"]
        if result.get("is_same", False):
            simplified = word

        return FieldSuggestionResponse(
            note_id=note_id,
            field_type=FieldType.SIMPLIFIED,
            suggestion=simplified,
            source="ai",
            confidence=0.95,
            cost=actual_cost,
        )

    async def suggest_examples(
        self, word: str, pinyin: str, definition: str, note_id: int
    ) -> FieldSuggestionResponse:
        """Suggest example sentences (AI only)"""
        prompt = EXAMPLES_PROMPT.format(
            word=word, pinyin=pinyin, definition=definition or "N/A"
        )
        response_text, usage_info = await ai_service.call_gemini(prompt)
        result = ai_service.parse_json_response(response_text)

        actual_cost = ai_service.calculate_actual_cost(usage_info)
        ai_usage_service.record_usage(
            cost=actual_cost,
            tokens=usage_info.get("total_tokens", 0),
            input_tokens=usage_info.get("input_tokens", 0),
            output_tokens=usage_info.get("output_tokens", 0),
        )

        # Format examples as HTML
        examples = result.get("examples", [])
        html = self._format_examples_html(examples)
        # Plain text summary for suggestion field
        summary = " | ".join([ex.get("chinese", "") for ex in examples[:2]])

        return FieldSuggestionResponse(
            note_id=note_id,
            field_type=FieldType.EXAMPLES,
            suggestion=summary,
            html=html,
            source="ai",
            confidence=0.9,
            cost=actual_cost,
        )

    def _format_examples_html(self, examples: list) -> str:
        """Convert examples to HTML for Anki"""
        html_parts = []
        for ex in examples:
            chinese = ex.get("chinese", "")
            pinyin = ex.get("pinyin", "")
            sino = ex.get("sino", "")
            vietnamese = ex.get("vietnamese", "")
            html_parts.append(
                f'<p><strong>{chinese}</strong></p>'
                f'<p style="color: #94e2d5;">{pinyin}</p>'
                f'<p style="color: #a6adc8;">{sino}</p>'
                f'<p style="color: #a6e3a1;">{vietnamese}</p>'
            )
        return '<br/><hr/><br/>'.join(html_parts)

    # ========================================================================
    # Verification Methods
    # ========================================================================

    async def verify_sino(
        self, word: str, pinyin: str, current_value: str, note_id: int
    ) -> FieldVerifyResponse:
        """Verify Sino-Vietnamese reading"""
        prompt = VERIFY_SINO_PROMPT.format(
            word=word, pinyin=pinyin, current_value=current_value
        )
        response_text, usage_info = await ai_service.call_gemini(prompt)
        result = ai_service.parse_json_response(response_text)

        actual_cost = ai_service.calculate_actual_cost(usage_info)
        ai_usage_service.record_usage(
            cost=actual_cost,
            tokens=usage_info.get("total_tokens", 0),
            input_tokens=usage_info.get("input_tokens", 0),
            output_tokens=usage_info.get("output_tokens", 0),
        )

        return FieldVerifyResponse(
            note_id=note_id,
            field_type=FieldType.SINO,
            is_correct=result.get("is_correct", False),
            current_value=current_value,
            suggested_value=result.get("suggested_value"),
            reason=result.get("reason"),
            confidence=result.get("confidence", 0.9),
            cost=actual_cost,
        )

    async def verify_definition(
        self, word: str, pinyin: str, current_value: str, note_id: int
    ) -> FieldVerifyResponse:
        """Verify Vietnamese definition"""
        prompt = VERIFY_DEFINITION_PROMPT.format(
            word=word, pinyin=pinyin, current_value=current_value
        )
        response_text, usage_info = await ai_service.call_gemini(prompt)
        result = ai_service.parse_json_response(response_text)

        actual_cost = ai_service.calculate_actual_cost(usage_info)
        ai_usage_service.record_usage(
            cost=actual_cost,
            tokens=usage_info.get("total_tokens", 0),
            input_tokens=usage_info.get("input_tokens", 0),
            output_tokens=usage_info.get("output_tokens", 0),
        )

        return FieldVerifyResponse(
            note_id=note_id,
            field_type=FieldType.DEFINITION,
            is_correct=result.get("is_correct", False),
            current_value=current_value,
            suggested_value=result.get("suggested_value"),
            reason=result.get("reason"),
            confidence=result.get("confidence", 0.9),
            cost=actual_cost,
        )

    async def verify_examples(
        self, word: str, pinyin: str, current_value: str, note_id: int
    ) -> FieldVerifyResponse:
        """Verify example sentences"""
        prompt = VERIFY_EXAMPLES_PROMPT.format(
            word=word, pinyin=pinyin, current_value=current_value
        )
        response_text, usage_info = await ai_service.call_gemini(prompt)
        result = ai_service.parse_json_response(response_text)

        actual_cost = ai_service.calculate_actual_cost(usage_info)
        ai_usage_service.record_usage(
            cost=actual_cost,
            tokens=usage_info.get("total_tokens", 0),
            input_tokens=usage_info.get("input_tokens", 0),
            output_tokens=usage_info.get("output_tokens", 0),
        )

        # Format corrected examples as HTML if provided
        suggested_value = None
        corrected_examples = result.get("corrected_examples", [])
        if corrected_examples and not result.get("is_correct", False):
            # Format examples to HTML
            html_parts = []
            for ex in corrected_examples:
                html_parts.append(f'''<p><strong>{ex.get("chinese", "")}</strong></p>
<p style="color: #94e2d5;">{ex.get("pinyin", "")}</p>
<p style="color: #a6adc8;">{ex.get("sino", "")}</p>
<p style="color: #a6e3a1;">{ex.get("vietnamese", "")}</p>''')
            suggested_value = '<br/><hr/><br/>'.join(html_parts)

        return FieldVerifyResponse(
            note_id=note_id,
            field_type=FieldType.EXAMPLES,
            is_correct=result.get("is_correct", False),
            current_value=current_value,
            suggested_value=suggested_value,
            reason=result.get("reason"),
            confidence=result.get("confidence", 0.9),
            issues=result.get("issues"),
            cost=actual_cost,
        )

    async def verify_simplified(
        self, word: str, current_value: str, note_id: int
    ) -> FieldVerifyResponse:
        """Verify simplified Chinese conversion"""
        prompt = VERIFY_SIMPLIFIED_PROMPT.format(word=word, current_value=current_value)
        response_text, usage_info = await ai_service.call_gemini(prompt)
        result = ai_service.parse_json_response(response_text)

        actual_cost = ai_service.calculate_actual_cost(usage_info)
        ai_usage_service.record_usage(
            cost=actual_cost,
            tokens=usage_info.get("total_tokens", 0),
            input_tokens=usage_info.get("input_tokens", 0),
            output_tokens=usage_info.get("output_tokens", 0),
        )

        return FieldVerifyResponse(
            note_id=note_id,
            field_type=FieldType.SIMPLIFIED,
            is_correct=result.get("is_correct", False),
            current_value=current_value,
            suggested_value=result.get("suggested_value"),
            reason=result.get("reason"),
            confidence=result.get("confidence", 0.95),
            cost=actual_cost,
        )


# Singleton instance
field_service = FieldService()
