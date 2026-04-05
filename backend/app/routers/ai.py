"""
AI-powered scanning endpoints using Google Gemini.
"""
import json
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator

from app.services.ai_service import ai_service
from app.services.anki_service import anki_service
from app.services.ai_usage_service import ai_usage_service
from app.services.dict_service import dict_service
from app.utils.deck_filter import filter_decks_by_mode
from app.models.ai import (
    CostEstimate,
    PinyinCheckRequest,
    PinyinCheckResponse,
    PinyinIssue,
    ApplySuggestionRequest,
    ApplySuggestionResponse,
    DeckPinyinResult,
    MultiDeckPinyinResponse,
    ExampleSentence,
    GenerateExamplesRequest,
    GenerateExamplesResponse,
)
from app.models.field import (
    FieldType,
    FieldSuggestionRequest,
    FieldSuggestionResponse,
    DeckFieldStatsResponse,
    FieldVerifyResponse,
)
from app.services.field_service import field_service
from app.services.field_stats_service import field_stats_service


class UsageResponse(BaseModel):
    month: str
    total_cost: float
    total_requests: int
    total_tokens: int
    monthly_limit: float
    remaining: float
    limit_reached: bool
    usage_percent: float
    last_request: Optional[str]


class SetLimitRequest(BaseModel):
    limit: float

router = APIRouter(prefix="/api/ai", tags=["ai"])


# Pinyin checker prompt template
PINYIN_CHECK_PROMPT = """You are a Chinese language expert. Check if the pinyin matches the Chinese characters correctly.

For each card, verify:
1. Pinyin syllables match the characters (correct sounds)
2. Tone marks are correct (e.g., 你 should be nǐ with 3rd tone, not ní with 2nd tone)
3. Format is consistent - use EITHER tone marks (nǐ hǎo) OR tone numbers (ni3 hao3), NOT both
4. IMPORTANT: Each syllable MUST be separated by a space (e.g., "zhè ge" NOT "zhège", "péngyou" should be "péng yǒu")
5. No invalid pinyin format (e.g., qīng1 mixes tone mark with number - WRONG)

Cards to check:
{cards_json}

Return JSON array of issues found. Only include cards with actual errors.
Format:
{{
  "issues": [
    {{
      "note_id": 123,
      "word": "这个",
      "field_name": "Pinyin",
      "current_pinyin": "zhège",
      "suggested_pinyin": "zhè ge",
      "reason": "Missing space between syllables: should be 'zhè ge' not 'zhège'",
      "confidence": 0.95
    }}
  ]
}}

If no issues found, return: {{"issues": []}}

Be VERY strict. Flag these errors:
- Wrong tones (2nd vs 3rd tone confusion)
- Missing tone marks entirely
- Mixed format (tone mark + number like "qīng1" should be "qīng" or "qing1")
- Wrong vowel sounds
- Invalid syllables
- Missing spaces between syllables (ALWAYS separate each syllable with a space)
- Pinyin doesn't match the Chinese character at all"""


# Example generation prompt template
EXAMPLE_GENERATION_PROMPT = """You are a Chinese language expert. Generate 2 natural example sentences for the Chinese word "{word}" ({pinyin}).

Definition: {definition}

For EACH sentence provide:
1. Chinese sentence (10-15 characters, natural everyday usage)
2. Pinyin with proper tone marks, EACH SYLLABLE SEPARATED BY A SPACE (e.g., "Wǒ hěn gāo xìng" NOT "Wǒ hěngāoxìng")
3. Sino-Vietnamese reading (Han-Viet for each character, separated by spaces)
4. Vietnamese translation

Return JSON format:
{{
  "examples": [
    {{
      "chinese": "我每天都吃苹果。",
      "pinyin": "Wǒ měi tiān dōu chī píng guǒ.",
      "sino": "Ngã mỗi thiên đô cật bình quả.",
      "vietnamese": "Tôi mỗi ngày đều ăn táo."
    }}
  ]
}}

Requirements:
- Sentences should be simple, practical, daily-use Chinese
- Target HSK 2-4 level vocabulary (avoid obscure words)
- CRITICAL: Pinyin must have a space between EVERY syllable (zhè ge, not zhège)
- Sino-Vietnamese should follow standard Han-Viet readings
- Vietnamese translation should be natural (not word-for-word)
- Ensure the target word "{word}" appears in each sentence"""


def format_examples_html(examples: list[ExampleSentence]) -> str:
    """Convert examples to HTML for Anki RichTextEditor.
    Uses inline styles so formatting is preserved after editing in TipTap.
    """
    html_parts = []
    for ex in examples:
        html_parts.append(f'''<p><strong>{ex.chinese}</strong></p>
<p style="color: #94e2d5;">{ex.pinyin}</p>
<p style="color: #a6adc8;">{ex.sino}</p>
<p style="color: #a6e3a1;">{ex.vietnamese}</p>''')
    return '<br/><hr/><br/>'.join(html_parts)


def extract_card_for_examples(card: dict) -> dict | None:
    """Extract word/pinyin/definition from card, return None if Example exists"""
    fields = card.get("fields", {})

    # Skip if Example field has content
    example = fields.get("Example", {}).get("value", "")
    if example and example.strip():
        return None

    word = (
        fields.get("Word", {}).get("value", "") or
        fields.get("汉字", {}).get("value", "") or
        fields.get("Hanzi", {}).get("value", "") or
        fields.get("Chinese", {}).get("value", "") or
        fields.get("Character", {}).get("value", "") or
        fields.get("Front", {}).get("value", "")
    )

    if not word:
        return None

    pinyin = (
        fields.get("Pinyin", {}).get("value", "") or
        fields.get("拼音", {}).get("value", "") or
        fields.get("Reading", {}).get("value", "") or
        fields.get("Pronunciation", {}).get("value", "")
    )

    definition = (
        fields.get("Definition", {}).get("value", "") or
        fields.get("Meaning", {}).get("value", "") or
        fields.get("English", {}).get("value", "") or
        fields.get("Back", {}).get("value", "")
    )

    return {
        "note_id": card.get("note"),
        "word": word,
        "pinyin": pinyin or "",
        "definition": definition or ""
    }


async def enrich_issues_with_dict(issues: list[PinyinIssue]) -> list[PinyinIssue]:
    """
    Enrich pinyin issues with dictionary data from zdic.net.
    Adds zdic_entry, is_polyphonic, and all_valid_readings fields.
    """
    if not issues:
        return issues

    # Collect unique words to look up
    words_to_lookup = list(set(issue.word for issue in issues))

    # Batch lookup from dictionary
    dict_results = await dict_service.lookup_batch(words_to_lookup)

    # Enrich each issue
    for issue in issues:
        entry = dict_results.get(issue.word)
        if entry:
            issue.zdic_entry = entry
            issue.is_polyphonic = entry.is_polyphonic
            issue.all_valid_readings = [r.pinyin for r in entry.readings]

    return issues


@router.get("/health")
async def check_ai_health():
    """Check if AI service is configured"""
    usage = ai_usage_service.get_current_usage()
    return {
        "available": ai_service.is_available() and not usage["limit_reached"],
        "model": ai_service.MODEL_NAME if ai_service.is_available() else None,
        "limit_reached": usage["limit_reached"],
        "usage_percent": usage["usage_percent"]
    }


@router.get("/usage")
async def get_usage() -> UsageResponse:
    """Get current month's AI usage statistics"""
    usage = ai_usage_service.get_current_usage()
    return UsageResponse(**usage)


@router.post("/usage/limit")
async def set_limit(request: SetLimitRequest):
    """Set the monthly AI cost limit"""
    if request.limit < 0:
        raise HTTPException(400, "Limit must be non-negative")
    ai_usage_service.set_monthly_limit(request.limit)
    return {"success": True, "new_limit": request.limit}


@router.get("/estimate/{deck_id}")
async def estimate_cost(deck_id: int) -> CostEstimate:
    """Estimate cost for scanning a deck"""
    decks = await anki_service.get_deck_names_and_ids()
    deck_name = next((name for name, did in decks.items() if did == deck_id), None)
    if not deck_name:
        raise HTTPException(404, "Deck not found")

    card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
    estimate = ai_service.estimate_cost(len(card_ids))
    return CostEstimate(**estimate)


@router.post("/pinyin-check")
async def check_pinyin(request: PinyinCheckRequest) -> PinyinCheckResponse:
    """Check pinyin accuracy for cards in a deck"""
    if not ai_service.is_available():
        raise HTTPException(503, "AI service not configured. Set GEMINI_API_KEY.")

    # Check budget
    can_proceed, error_msg = ai_usage_service.can_make_request()
    if not can_proceed:
        raise HTTPException(429, error_msg)

    # Get deck name
    decks = await anki_service.get_deck_names_and_ids()
    deck_name = next((name for name, did in decks.items() if did == request.deck_id), None)
    if not deck_name:
        raise HTTPException(404, "Deck not found")

    # Get cards
    if request.card_ids:
        card_ids = request.card_ids
    else:
        card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')

    if not card_ids:
        return PinyinCheckResponse(
            total_checked=0,
            issues_found=0,
            issues=[],
            estimated_cost=0.0
        )

    # Get card details
    cards_info = await anki_service.get_cards_info(card_ids)

    # Extract relevant fields for pinyin check
    cards_for_check = []
    for card in cards_info:
        fields = card.get("fields", {})
        # Debug: Print available fields for first card
        if not cards_for_check:
            print(f"[AI Debug] Available fields: {list(fields.keys())}")

        # Look for Word and Pinyin fields (various common field names)
        word = (
            fields.get("Word", {}).get("value", "") or
            fields.get("汉字", {}).get("value", "") or
            fields.get("Hanzi", {}).get("value", "") or
            fields.get("Chinese", {}).get("value", "") or
            fields.get("Character", {}).get("value", "") or
            fields.get("Front", {}).get("value", "")
        )
        pinyin = (
            fields.get("Pinyin", {}).get("value", "") or
            fields.get("拼音", {}).get("value", "") or
            fields.get("Reading", {}).get("value", "") or
            fields.get("Pronunciation", {}).get("value", "")
        )

        if word and pinyin:
            cards_for_check.append({
                "note_id": card.get("note"),
                "word": word,
                "pinyin": pinyin
            })

    if not cards_for_check:
        print(f"[AI Debug] No cards found with Word+Pinyin fields! Total cards checked: {len(cards_info)}")
        if cards_info:
            print(f"[AI Debug] First card fields: {list(cards_info[0].get('fields', {}).keys())}")
        return PinyinCheckResponse(
            total_checked=0,
            issues_found=0,
            issues=[],
            estimated_cost=0.0
        )

    # Batch and process
    all_issues: list[PinyinIssue] = []
    batches = ai_service.batch_cards(cards_for_check)
    error_message: str | None = None

    for batch in batches:
        batch_data = [{"note_id": c["note_id"], "word": c["word"], "pinyin": c["pinyin"]} for c in batch]
        print(f"[AI Debug] Checking batch of {len(batch_data)} cards")
        print(f"[AI Debug] Sample cards: {batch_data[:3]}")

        prompt = PINYIN_CHECK_PROMPT.format(cards_json=str(batch_data))

        try:
            response_text, usage_info = await ai_service.call_gemini(prompt)
            print(f"[AI Debug] Raw response: {response_text[:500]}...")
            result = ai_service.parse_json_response(response_text)

            # Record actual usage for this batch
            actual_cost = ai_service.calculate_actual_cost(usage_info)
            ai_usage_service.record_usage(
                cost=actual_cost,
                tokens=usage_info.get("total_tokens", 0),
                input_tokens=usage_info.get("input_tokens", 0),
                output_tokens=usage_info.get("output_tokens", 0)
            )
            print(f"[AI Debug] Parsed issues: {len(result.get('issues', []))}")

            for issue in result.get("issues", []):
                all_issues.append(PinyinIssue(
                    note_id=issue["note_id"],
                    word=issue["word"],
                    field_name=issue.get("field_name", "Pinyin"),
                    current_pinyin=issue["current_pinyin"],
                    suggested_pinyin=issue["suggested_pinyin"],
                    reason=issue["reason"],
                    confidence=issue.get("confidence", 0.9)
                ))
        except Exception as e:
            error_str = str(e)
            print(f"Error processing batch: {error_str}")
            # Extract user-friendly error message
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                error_message = "API quota exceeded. Please wait or enable billing in Google AI Studio."
            elif "401" in error_str or "UNAUTHENTICATED" in error_str:
                error_message = "Invalid API key. Check your GEMINI_API_KEY."
            else:
                error_message = f"AI API error: {error_str[:100]}"

    # Enrich issues with dictionary data from zdic.net
    enriched_issues = await enrich_issues_with_dict(all_issues)

    # Get estimated cost for response (actual cost already recorded per batch)
    cost = ai_service.estimate_cost(len(cards_for_check))

    return PinyinCheckResponse(
        total_checked=len(cards_for_check),
        issues_found=len(enriched_issues),
        issues=enriched_issues,
        estimated_cost=cost["estimated_cost"],
        error=error_message
    )


@router.get("/pinyin-check-stream/{deck_id}")
async def check_pinyin_stream(deck_id: int):
    """
    Stream pinyin check results for a single deck using Server-Sent Events.
    Events:
    - start: {total_cards: int, total_batches: int, deck_name: str}
    - progress: {batch: int, total_batches: int, cards_processed: int}
    - result: {issues: [...]}
    - complete: {total_checked, issues_found, estimated_cost}
    - error: {message}
    """
    async def generate_events() -> AsyncGenerator[str, None]:
        if not ai_service.is_available():
            yield f"event: error\ndata: {json.dumps({'message': 'AI service not configured. Set GEMINI_API_KEY.'})}\n\n"
            return

        # Check budget
        can_proceed, error_msg = ai_usage_service.can_make_request()
        if not can_proceed:
            yield f"event: error\ndata: {json.dumps({'message': error_msg})}\n\n"
            return

        # Get deck name
        decks = await anki_service.get_deck_names_and_ids()
        deck_name = next((name for name, did in decks.items() if did == deck_id), None)
        if not deck_name:
            yield f"event: error\ndata: {json.dumps({'message': 'Deck not found'})}\n\n"
            return

        # Get cards
        card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
        if not card_ids:
            yield f"event: complete\ndata: {json.dumps({'total_checked': 0, 'issues_found': 0, 'estimated_cost': 0})}\n\n"
            return

        # Get card details
        cards_info = await anki_service.get_cards_info(card_ids)

        # Extract relevant fields for pinyin check
        cards_for_check = []
        for card in cards_info:
            fields = card.get("fields", {})
            word = (
                fields.get("Word", {}).get("value", "") or
                fields.get("汉字", {}).get("value", "") or
                fields.get("Hanzi", {}).get("value", "") or
                fields.get("Chinese", {}).get("value", "") or
                fields.get("Character", {}).get("value", "") or
                fields.get("Front", {}).get("value", "")
            )
            pinyin = (
                fields.get("Pinyin", {}).get("value", "") or
                fields.get("拼音", {}).get("value", "") or
                fields.get("Reading", {}).get("value", "") or
                fields.get("Pronunciation", {}).get("value", "")
            )

            if word and pinyin:
                cards_for_check.append({
                    "note_id": card.get("note"),
                    "word": word,
                    "pinyin": pinyin
                })

        if not cards_for_check:
            yield f"event: complete\ndata: {json.dumps({'total_checked': 0, 'issues_found': 0, 'estimated_cost': 0})}\n\n"
            return

        # Batch cards
        batches = ai_service.batch_cards(cards_for_check)
        total_batches = len(batches)

        # Send start event
        short_name = deck_name.split('::')[-1]
        yield f"event: start\ndata: {json.dumps({'total_cards': len(cards_for_check), 'total_batches': total_batches, 'deck_name': short_name})}\n\n"

        all_issues: list[PinyinIssue] = []
        cards_processed = 0

        for batch_idx, batch in enumerate(batches):
            batch_data = [{"note_id": c["note_id"], "word": c["word"], "pinyin": c["pinyin"]} for c in batch]
            cards_processed += len(batch)

            # Send progress event
            yield f"event: progress\ndata: {json.dumps({'batch': batch_idx + 1, 'total_batches': total_batches, 'cards_processed': cards_processed})}\n\n"

            prompt = PINYIN_CHECK_PROMPT.format(cards_json=str(batch_data))

            try:
                response_text, usage_info = await ai_service.call_gemini(prompt)
                result = ai_service.parse_json_response(response_text)

                # Record actual usage for this batch
                actual_cost = ai_service.calculate_actual_cost(usage_info)
                ai_usage_service.record_usage(
                    cost=actual_cost,
                    tokens=usage_info.get("total_tokens", 0),
                    input_tokens=usage_info.get("input_tokens", 0),
                    output_tokens=usage_info.get("output_tokens", 0)
                )

                batch_issues = []
                for issue in result.get("issues", []):
                    batch_issues.append(PinyinIssue(
                        note_id=issue["note_id"],
                        word=issue["word"],
                        field_name=issue.get("field_name", "Pinyin"),
                        current_pinyin=issue["current_pinyin"],
                        suggested_pinyin=issue["suggested_pinyin"],
                        reason=issue["reason"],
                        confidence=issue.get("confidence", 0.9)
                    ))

                # Enrich with dictionary data
                if batch_issues:
                    enriched = await enrich_issues_with_dict(batch_issues)
                    all_issues.extend(enriched)
                    # Send result event with new issues
                    yield f"event: result\ndata: {json.dumps({'issues': [i.model_dump() for i in enriched]})}\n\n"

            except Exception as e:
                error_str = str(e)
                print(f"Error processing batch: {error_str}")
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    yield f"event: error\ndata: {json.dumps({'message': 'API quota exceeded. Please wait or enable billing.'})}\n\n"
                    return

            await asyncio.sleep(0.1)

        # Get estimated cost for response (actual cost already recorded per batch)
        cost = ai_service.estimate_cost(len(cards_for_check))

        # Send complete event
        yield f"event: complete\ndata: {json.dumps({'total_checked': len(cards_for_check), 'issues_found': len(all_issues), 'estimated_cost': cost['estimated_cost']})}\n\n"

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/apply-suggestion")
async def apply_suggestion(request: ApplySuggestionRequest) -> ApplySuggestionResponse:
    """Apply a single AI suggestion to a card"""
    try:
        await anki_service.update_note_fields(
            request.note_id,
            {request.field_name: request.value}
        )
        return ApplySuggestionResponse(success=True, note_id=request.note_id)
    except Exception as e:
        raise HTTPException(500, f"Failed to apply suggestion: {str(e)}")


@router.get("/estimate-all")
async def estimate_cost_all() -> CostEstimate:
    """Estimate cost for scanning all decks"""
    all_decks = await anki_service.get_deck_names_and_ids()
    total_cards = 0

    for deck_name in all_decks.keys():
        # Only count "Part" decks (leaf decks with actual cards)
        if "::Part" in deck_name or deck_name.endswith("Part"):
            card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
            total_cards += len(card_ids)

    # If no Part decks found, count all cards
    if total_cards == 0:
        for deck_name in all_decks.keys():
            card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
            total_cards += len(card_ids)

    estimate = ai_service.estimate_cost(total_cards)
    return CostEstimate(**estimate)


@router.post("/pinyin-check-all")
async def check_pinyin_all() -> MultiDeckPinyinResponse:
    """Check pinyin accuracy for all decks"""
    if not ai_service.is_available():
        raise HTTPException(503, "AI service not configured. Set GEMINI_API_KEY.")

    # Check budget
    can_proceed, error_msg = ai_usage_service.can_make_request()
    if not can_proceed:
        raise HTTPException(429, error_msg)

    all_decks = await anki_service.get_deck_names_and_ids()
    deck_results: list[DeckPinyinResult] = []
    total_checked = 0
    total_issues = 0
    error_message: str | None = None

    # Find all leaf decks (Part decks)
    part_decks = {name: did for name, did in all_decks.items()
                  if "::Part" in name or name.endswith("Part")}

    # Fallback: if no Part decks, use all decks
    if not part_decks:
        part_decks = all_decks

    for deck_name, deck_id in part_decks.items():
        card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
        if not card_ids:
            continue

        # Get card details
        cards_info = await anki_service.get_cards_info(card_ids)

        # Extract relevant fields for pinyin check
        cards_for_check = []
        for card in cards_info:
            fields = card.get("fields", {})
            word = (
                fields.get("Word", {}).get("value", "") or
                fields.get("汉字", {}).get("value", "") or
                fields.get("Hanzi", {}).get("value", "") or
                fields.get("Chinese", {}).get("value", "") or
                fields.get("Character", {}).get("value", "") or
                fields.get("Front", {}).get("value", "")
            )
            pinyin = (
                fields.get("Pinyin", {}).get("value", "") or
                fields.get("拼音", {}).get("value", "") or
                fields.get("Reading", {}).get("value", "") or
                fields.get("Pronunciation", {}).get("value", "")
            )

            if word and pinyin:
                cards_for_check.append({
                    "note_id": card.get("note"),
                    "word": word,
                    "pinyin": pinyin
                })

        if not cards_for_check:
            continue

        total_checked += len(cards_for_check)

        # Process this deck's cards
        deck_issues: list[PinyinIssue] = []
        batches = ai_service.batch_cards(cards_for_check)

        for batch in batches:
            batch_data = [{"note_id": c["note_id"], "word": c["word"], "pinyin": c["pinyin"]} for c in batch]
            prompt = PINYIN_CHECK_PROMPT.format(cards_json=str(batch_data))

            try:
                response_text, usage_info = await ai_service.call_gemini(prompt)
                result = ai_service.parse_json_response(response_text)

                # Record actual usage for this batch
                actual_cost = ai_service.calculate_actual_cost(usage_info)
                ai_usage_service.record_usage(
                    cost=actual_cost,
                    tokens=usage_info.get("total_tokens", 0),
                    input_tokens=usage_info.get("input_tokens", 0),
                    output_tokens=usage_info.get("output_tokens", 0)
                )

                for issue in result.get("issues", []):
                    deck_issues.append(PinyinIssue(
                        note_id=issue["note_id"],
                        word=issue["word"],
                        field_name=issue.get("field_name", "Pinyin"),
                        current_pinyin=issue["current_pinyin"],
                        suggested_pinyin=issue["suggested_pinyin"],
                        reason=issue["reason"],
                        confidence=issue.get("confidence", 0.9)
                    ))
            except Exception as e:
                error_str = str(e)
                print(f"Error processing deck {deck_name}: {error_str}")
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    error_message = "API quota exceeded. Please wait or enable billing in Google AI Studio."
                    break
                elif "401" in error_str or "UNAUTHENTICATED" in error_str:
                    error_message = "Invalid API key. Check your GEMINI_API_KEY."
                    break
                else:
                    error_message = f"AI API error: {error_str[:100]}"

        if deck_issues:
            # Enrich issues with dictionary data
            enriched_deck_issues = await enrich_issues_with_dict(deck_issues)
            deck_results.append(DeckPinyinResult(
                deck_id=deck_id,
                deck_name=deck_name,
                issues=enriched_deck_issues
            ))
            total_issues += len(enriched_deck_issues)

        # Stop if we hit an error
        if error_message:
            break

    # Get estimated cost for response (actual cost already recorded per batch)
    cost = ai_service.estimate_cost(total_checked)

    return MultiDeckPinyinResponse(
        total_decks=len(part_decks),
        total_checked=total_checked,
        issues_found=total_issues,
        estimated_cost=cost["estimated_cost"],
        error=error_message,
        decks=deck_results
    )


@router.get("/pinyin-check-all-stream")
async def check_pinyin_all_stream(
    deck_id: Optional[int] = None,
    mode: str = "all"
):
    """
    Stream pinyin check results deck by deck using Server-Sent Events.

    Args:
        deck_id: Optional deck ID to filter (required for non-"all" modes)
        mode: "all" (all decks), "with_children" (deck + children), "children_only"

    Events:
    - start: {total_decks: int, decks: [{deck_id, deck_name, card_count}]}
    - progress: {deck_id, deck_name, current, total}
    - result: {deck_id, deck_name, issues: [...], cards_checked}
    - complete: {total_checked, issues_found, estimated_cost}
    - error: {message}
    """
    async def generate_events() -> AsyncGenerator[str, None]:
        if not ai_service.is_available():
            yield f"event: error\ndata: {json.dumps({'message': 'AI service not configured. Set GEMINI_API_KEY.'})}\n\n"
            return

        # Check budget
        can_proceed, error_msg = ai_usage_service.can_make_request()
        if not can_proceed:
            yield f"event: error\ndata: {json.dumps({'message': error_msg})}\n\n"
            return

        all_decks = await anki_service.get_deck_names_and_ids()

        # Filter decks based on mode
        part_decks = filter_decks_by_mode(deck_id, mode, all_decks)

        # Build deck info list
        deck_info_list = []
        for d_name, d_id in part_decks.items():
            card_ids = await anki_service.find_cards(f'deck:"{d_name}"')
            if card_ids:
                deck_info_list.append({
                    "deck_id": d_id,
                    "deck_name": d_name,
                    "card_count": len(card_ids)
                })

        # Send start event
        yield f"event: start\ndata: {json.dumps({'total_decks': len(deck_info_list), 'decks': deck_info_list})}\n\n"

        total_checked = 0
        total_issues = 0

        for idx, deck_info in enumerate(deck_info_list):
            current_deck_id = deck_info["deck_id"]
            current_deck_name = deck_info["deck_name"]

            # Send progress event
            yield f"event: progress\ndata: {json.dumps({'deck_id': current_deck_id, 'deck_name': current_deck_name, 'current': idx + 1, 'total': len(deck_info_list)})}\n\n"

            card_ids = await anki_service.find_cards(f'deck:"{current_deck_name}"')
            if not card_ids:
                continue

            # Get card details
            cards_info = await anki_service.get_cards_info(card_ids)

            # Extract relevant fields for pinyin check
            cards_for_check = []
            for card in cards_info:
                fields = card.get("fields", {})
                word = (
                    fields.get("Word", {}).get("value", "") or
                    fields.get("汉字", {}).get("value", "") or
                    fields.get("Hanzi", {}).get("value", "") or
                    fields.get("Chinese", {}).get("value", "") or
                    fields.get("Character", {}).get("value", "") or
                    fields.get("Front", {}).get("value", "")
                )
                pinyin = (
                    fields.get("Pinyin", {}).get("value", "") or
                    fields.get("拼音", {}).get("value", "") or
                    fields.get("Reading", {}).get("value", "") or
                    fields.get("Pronunciation", {}).get("value", "")
                )

                if word and pinyin:
                    cards_for_check.append({
                        "note_id": card.get("note"),
                        "word": word,
                        "pinyin": pinyin
                    })

            if not cards_for_check:
                continue

            total_checked += len(cards_for_check)

            # Process this deck's cards
            deck_issues: list[PinyinIssue] = []
            batches = ai_service.batch_cards(cards_for_check)
            error_occurred = False

            for batch in batches:
                batch_data = [{"note_id": c["note_id"], "word": c["word"], "pinyin": c["pinyin"]} for c in batch]
                prompt = PINYIN_CHECK_PROMPT.format(cards_json=str(batch_data))

                try:
                    response_text, usage_info = await ai_service.call_gemini(prompt)
                    result = ai_service.parse_json_response(response_text)

                    # Record actual usage for this batch
                    actual_cost = ai_service.calculate_actual_cost(usage_info)
                    ai_usage_service.record_usage(
                        cost=actual_cost,
                        tokens=usage_info.get("total_tokens", 0),
                        input_tokens=usage_info.get("input_tokens", 0),
                        output_tokens=usage_info.get("output_tokens", 0)
                    )

                    for issue in result.get("issues", []):
                        deck_issues.append(PinyinIssue(
                            note_id=issue["note_id"],
                            word=issue["word"],
                            field_name=issue.get("field_name", "Pinyin"),
                            current_pinyin=issue["current_pinyin"],
                            suggested_pinyin=issue["suggested_pinyin"],
                            reason=issue["reason"],
                            confidence=issue.get("confidence", 0.9)
                        ))
                except Exception as e:
                    error_str = str(e)
                    print(f"Error processing deck {current_deck_name}: {error_str}")
                    if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                        yield f"event: error\ndata: {json.dumps({'message': 'API quota exceeded. Please wait or enable billing.'})}\n\n"
                        error_occurred = True
                        break

            if error_occurred:
                break

            # Enrich with dictionary data
            if deck_issues:
                enriched_issues = await enrich_issues_with_dict(deck_issues)
                total_issues += len(enriched_issues)

                # Send result event for this deck
                yield f"event: result\ndata: {json.dumps({'deck_id': current_deck_id, 'deck_name': current_deck_name, 'issues': [i.model_dump() for i in enriched_issues], 'cards_checked': len(cards_for_check)})}\n\n"

            # Small delay to prevent overwhelming the client
            await asyncio.sleep(0.1)

        # Get estimated cost for response (actual cost already recorded per batch)
        cost = ai_service.estimate_cost(total_checked)

        # Send complete event
        yield f"event: complete\ndata: {json.dumps({'total_checked': total_checked, 'issues_found': total_issues, 'estimated_cost': cost['estimated_cost']})}\n\n"

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# ============================================================================
# Example Generation Endpoints
# ============================================================================

@router.post("/generate-examples")
async def generate_examples(request: GenerateExamplesRequest) -> GenerateExamplesResponse:
    """Generate example sentences for a single card"""
    if not ai_service.is_available():
        raise HTTPException(503, "AI service not configured. Set GEMINI_API_KEY.")

    # Check budget
    can_proceed, error_msg = ai_usage_service.can_make_request()
    if not can_proceed:
        raise HTTPException(429, error_msg)

    # Build prompt
    prompt = EXAMPLE_GENERATION_PROMPT.format(
        word=request.word,
        pinyin=request.pinyin,
        definition=request.definition or "N/A"
    )

    try:
        response_text, usage_info = await ai_service.call_gemini(prompt)
        result = ai_service.parse_json_response(response_text)

        examples = [ExampleSentence(**ex) for ex in result.get("examples", [])]
        html = format_examples_html(examples)

        # Record actual usage
        actual_cost = ai_service.calculate_actual_cost(usage_info)
        ai_usage_service.record_usage(
            cost=actual_cost,
            tokens=usage_info.get("total_tokens", 0),
            input_tokens=usage_info.get("input_tokens", 0),
            output_tokens=usage_info.get("output_tokens", 0)
        )

        return GenerateExamplesResponse(
            note_id=request.note_id,
            examples=examples,
            html=html,
            estimated_cost=actual_cost
        )
    except Exception as e:
        error_str = str(e)
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            raise HTTPException(429, "API quota exceeded. Please wait or enable billing.")
        raise HTTPException(500, f"Example generation failed: {error_str[:100]}")


@router.get("/generate-examples-stream")
async def generate_examples_stream(
    deck_id: Optional[int] = None,
    mode: str = "all"
):
    """
    Stream example generation results using Server-Sent Events.

    Args:
        deck_id: Optional deck ID to filter (required for non-"all" modes)
        mode: "all" (all decks), "with_children" (deck + children), "children_only"

    Events:
    - start: {total_cards: int, deck_name: str}
    - progress: {current: int, total: int, word: str}
    - result: {note_id, word, examples: [...], html}
    - complete: {total_processed, total_generated, estimated_cost}
    - error: {message}
    """
    async def generate_events() -> AsyncGenerator[str, None]:
        if not ai_service.is_available():
            yield f"event: error\ndata: {json.dumps({'message': 'AI service not configured. Set GEMINI_API_KEY.'})}\n\n"
            return

        # Check budget
        can_proceed, error_msg = ai_usage_service.can_make_request()
        if not can_proceed:
            yield f"event: error\ndata: {json.dumps({'message': error_msg})}\n\n"
            return

        all_decks = await anki_service.get_deck_names_and_ids()

        # Filter decks based on mode
        target_decks = filter_decks_by_mode(deck_id, mode, all_decks)

        # Collect all cards needing examples
        cards_for_generation = []
        deck_name_for_display = "All Decks"

        for d_name, d_id in target_decks.items():
            if deck_id and d_id == deck_id:
                deck_name_for_display = d_name.split('::')[-1]

            card_ids = await anki_service.find_cards(f'deck:"{d_name}"')
            if not card_ids:
                continue

            cards_info = await anki_service.get_cards_info(card_ids)

            for card in cards_info:
                extracted = extract_card_for_examples(card)
                if extracted:
                    cards_for_generation.append(extracted)

        if not cards_for_generation:
            yield f"event: complete\ndata: {json.dumps({'total_processed': 0, 'total_generated': 0, 'estimated_cost': 0, 'message': 'No cards need examples'})}\n\n"
            return

        # Send start event
        yield f"event: start\ndata: {json.dumps({'total_cards': len(cards_for_generation), 'deck_name': deck_name_for_display})}\n\n"

        total_generated = 0
        total_cost = 0.0

        for idx, card_data in enumerate(cards_for_generation):
            # Send progress event
            yield f"event: progress\ndata: {json.dumps({'current': idx + 1, 'total': len(cards_for_generation), 'word': card_data['word']})}\n\n"

            # Build prompt
            prompt = EXAMPLE_GENERATION_PROMPT.format(
                word=card_data["word"],
                pinyin=card_data["pinyin"],
                definition=card_data["definition"] or "N/A"
            )

            try:
                response_text, usage_info = await ai_service.call_gemini(prompt)
                result = ai_service.parse_json_response(response_text)

                examples = [ExampleSentence(**ex) for ex in result.get("examples", [])]
                html = format_examples_html(examples)

                # Send result event
                yield f"event: result\ndata: {json.dumps({'note_id': card_data['note_id'], 'word': card_data['word'], 'examples': [ex.model_dump() for ex in examples], 'html': html})}\n\n"

                # Record actual usage for this card
                actual_cost = ai_service.calculate_actual_cost(usage_info)
                ai_usage_service.record_usage(
                    cost=actual_cost,
                    tokens=usage_info.get("total_tokens", 0),
                    input_tokens=usage_info.get("input_tokens", 0),
                    output_tokens=usage_info.get("output_tokens", 0)
                )

                total_generated += 1
                total_cost += actual_cost

            except Exception as e:
                error_str = str(e)
                print(f"Error generating example for {card_data['word']}: {error_str}")
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    yield f"event: error\ndata: {json.dumps({'message': 'API quota exceeded. Please wait or enable billing.'})}\n\n"
                    break
                # Send skip event for failed cards so frontend knows
                yield f"event: skip\ndata: {json.dumps({'note_id': card_data['note_id'], 'word': card_data['word'], 'reason': error_str[:100]})}\n\n"

            # Small delay between requests
            await asyncio.sleep(0.2)

        # Send complete event (actual cost already recorded per request)
        yield f"event: complete\ndata: {json.dumps({'total_processed': len(cards_for_generation), 'total_generated': total_generated, 'estimated_cost': round(total_cost, 6)})}\n\n"

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# ============================================================================
# Field Operations Endpoints
# ============================================================================

@router.post("/suggest-field", response_model=FieldSuggestionResponse)
async def suggest_field(request: FieldSuggestionRequest) -> FieldSuggestionResponse:
    """
    Generate suggestion for a single field.

    Supports:
    - pinyin: Dictionary-first (free), AI fallback
    - sino: AI-generated Sino-Vietnamese reading
    - definition: AI-generated Vietnamese definition
    - examples: AI-generated example sentences (reuse existing endpoint)
    - simplified: AI-generated simplified Chinese

    Returns suggestion with source (dictionary/ai), confidence, and cost.
    """
    if not ai_service.is_available():
        raise HTTPException(503, "AI service not configured. Set GEMINI_API_KEY.")

    # Check budget for AI operations
    can_proceed, error_msg = ai_usage_service.can_make_request()
    if not can_proceed:
        raise HTTPException(429, error_msg)

    try:
        # Route to appropriate handler based on field_type
        if request.field_type == FieldType.PINYIN:
            return await field_service.suggest_pinyin(request.word, request.note_id)

        elif request.field_type == FieldType.SINO:
            if not request.pinyin:
                raise HTTPException(400, "Pinyin required for Sino-Vietnamese generation")
            return await field_service.suggest_sino(
                request.word, request.pinyin, request.note_id
            )

        elif request.field_type == FieldType.DEFINITION:
            if not request.pinyin:
                raise HTTPException(400, "Pinyin required for definition generation")
            return await field_service.suggest_definition(
                request.word, request.pinyin, request.note_id
            )

        elif request.field_type == FieldType.SIMPLIFIED:
            return await field_service.suggest_simplified(request.word, request.note_id)

        elif request.field_type == FieldType.EXAMPLES:
            return await field_service.suggest_examples(
                request.word,
                request.pinyin or "",
                request.definition or "",
                request.note_id
            )

        else:
            raise HTTPException(400, f"Unknown field type: {request.field_type}")

    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            raise HTTPException(429, "API quota exceeded. Please wait or enable billing.")
        raise HTTPException(500, f"Field suggestion failed: {error_str[:200]}")


@router.get("/field-stats", response_model=DeckFieldStatsResponse)
async def get_field_stats(
    deck_id: Optional[int] = None, deck_name: Optional[str] = None
) -> DeckFieldStatsResponse:
    """
    Get counts of filled/missing fields for a deck.

    Returns statistics for:
    - pinyin, sino, definition, examples, simplified, audio

    If deck_id not provided, returns stats for all decks.
    """
    # Get deck name if not provided
    if deck_id and not deck_name:
        decks = await anki_service.get_deck_names_and_ids()
        deck_name = next((name for name, did in decks.items() if did == deck_id), None)
        if not deck_name:
            raise HTTPException(404, "Deck not found")

    if not deck_name:
        deck_name = "All Decks"

    return await field_stats_service.get_field_stats(deck_id, deck_name)


@router.get("/fill-missing-stream")
async def fill_missing_stream(
    deck_id: Optional[int] = None,
    field_type: str = "pinyin",
    mode: str = "with_children",
    fill_mode: str = "missing"  # "missing" or "all"
):
    """
    Stream fill suggestions for cards missing the specified field.

    Events:
    - start: {total: int}
    - progress: {current: int, total: int, word: str}
    - result: {note_id, word, pinyin, suggestion, source, confidence, ...}
    - complete: {total_processed: int}
    - error: {message: str, note_id: int}
    """

    async def generate() -> AsyncGenerator[str, None]:
        try:
            # Get cards based on fill_mode
            if fill_mode == "all":
                cards = await field_stats_service.get_all_cards_for_field(
                    deck_id, field_type, mode
                )
            else:
                cards = await field_stats_service.get_cards_missing_field(
                    deck_id, field_type, mode
                )
            total = len(cards)

            yield f"event: start\ndata: {json.dumps({'total': total})}\n\n"

            if total == 0:
                yield f"event: complete\ndata: {json.dumps({'total_processed': 0})}\n\n"
                return

            for i, card in enumerate(cards):
                try:
                    # Generate suggestion based on field type
                    word = card.get("word", "")
                    pinyin = card.get("pinyin", "")
                    note_id = card.get("note_id", 0)
                    definition = card.get("definition", "")

                    # Get suggestion from field_service
                    if field_type == "pinyin":
                        suggestion = await field_service.suggest_pinyin(word, note_id)
                    elif field_type == "sino":
                        suggestion = await field_service.suggest_sino(word, pinyin, note_id)
                    elif field_type == "definition":
                        suggestion = await field_service.suggest_definition(word, pinyin, note_id)
                    elif field_type == "simplified":
                        suggestion = await field_service.suggest_simplified(word, note_id)
                    elif field_type == "examples":
                        suggestion = await field_service.suggest_examples(
                            word, pinyin, definition, note_id
                        )
                    else:
                        continue

                    result = {
                        "note_id": note_id,
                        "word": word,
                        "pinyin": pinyin,
                        "field_type": field_type,
                        "suggestion": suggestion.suggestion,
                        "html": suggestion.html,
                        "source": suggestion.source,
                        "confidence": suggestion.confidence,
                        "alternatives": suggestion.alternatives,
                        "original_value": card.get("original_value", ""),
                    }

                    yield f"event: progress\ndata: {json.dumps({'current': i+1, 'total': total, 'word': word})}\n\n"
                    yield f"event: result\ndata: {json.dumps(result)}\n\n"

                except Exception as e:
                    yield f"event: error\ndata: {json.dumps({'message': str(e)[:200], 'note_id': card.get('note_id', 0)})}\n\n"

                await asyncio.sleep(0.1)  # Rate limit

            yield f"event: complete\ndata: {json.dumps({'total_processed': total})}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': str(e)[:200]})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/verify-field-stream")
async def verify_field_stream(
    deck_id: Optional[int] = None,
    field_type: str = "pinyin",
    mode: str = "with_children"
):
    """
    Stream verification results for cards with the specified field.

    Args:
        deck_id: Optional deck ID to filter
        field_type: Field to verify (sino, definition, examples, simplified)
        mode: "all", "with_children", "children_only"

    Events:
    - start: {total: int}
    - progress: {current: int, total: int, word: str}
    - result: {note_id, word, is_correct, current_value, suggested_value, reason, confidence, issues}
    - complete: {total_processed: int, issues_found: int, total_cost: float}
    - error: {message: str}
    """

    async def generate() -> AsyncGenerator[str, None]:
        try:
            if not ai_service.is_available():
                yield f"event: error\ndata: {json.dumps({'message': 'AI service not configured. Set GEMINI_API_KEY.'})}\n\n"
                return

            # Check budget
            can_proceed, error_msg = ai_usage_service.can_make_request()
            if not can_proceed:
                yield f"event: error\ndata: {json.dumps({'message': error_msg})}\n\n"
                return

            # Get cards that have this field
            cards = await field_stats_service.get_cards_with_field(
                deck_id, field_type, mode
            )
            total = len(cards)

            yield f"event: start\ndata: {json.dumps({'total': total})}\n\n"

            if total == 0:
                yield f"event: complete\ndata: {json.dumps({'total_processed': 0, 'issues_found': 0, 'total_cost': 0.0})}\n\n"
                return

            issues_found = 0
            total_cost = 0.0

            for i, card in enumerate(cards):
                try:
                    word = card.get("word", "")
                    pinyin = card.get("pinyin", "")
                    note_id = card.get("note_id", 0)
                    current_value = card.get("current_value", "")

                    # Send progress event
                    yield f"event: progress\ndata: {json.dumps({'current': i+1, 'total': total, 'word': word})}\n\n"

                    # Verify based on field type
                    verify_result: FieldVerifyResponse
                    if field_type == "sino":
                        verify_result = await field_service.verify_sino(
                            word, pinyin, current_value, note_id
                        )
                    elif field_type == "definition":
                        verify_result = await field_service.verify_definition(
                            word, pinyin, current_value, note_id
                        )
                    elif field_type == "examples":
                        verify_result = await field_service.verify_examples(
                            word, pinyin, current_value, note_id
                        )
                    elif field_type == "simplified":
                        verify_result = await field_service.verify_simplified(
                            word, current_value, note_id
                        )
                    else:
                        yield f"event: error\ndata: {json.dumps({'message': f'Unknown field type: {field_type}'})}\n\n"
                        return

                    # Track cost
                    total_cost += verify_result.cost

                    # Only send result if there's an issue
                    if not verify_result.is_correct:
                        issues_found += 1
                        result = {
                            "note_id": verify_result.note_id,
                            "word": word,
                            "field_type": verify_result.field_type,
                            "is_correct": verify_result.is_correct,
                            "current_value": verify_result.current_value,
                            "suggested_value": verify_result.suggested_value,
                            "reason": verify_result.reason,
                            "confidence": verify_result.confidence,
                            "issues": verify_result.issues,
                        }
                        yield f"event: result\ndata: {json.dumps(result)}\n\n"

                except Exception as e:
                    error_str = str(e)
                    if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                        yield f"event: error\ndata: {json.dumps({'message': 'API quota exceeded. Please wait or enable billing.'})}\n\n"
                        return
                    yield f"event: error\ndata: {json.dumps({'message': error_str[:200]})}\n\n"

                await asyncio.sleep(0.2)  # Rate limit

            yield f"event: complete\ndata: {json.dumps({'total_processed': total, 'issues_found': issues_found, 'total_cost': round(total_cost, 6)})}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': str(e)[:200]})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
