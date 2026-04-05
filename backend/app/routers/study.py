"""
Study session endpoints for reviewing Anki cards.

Supports review cards only (queue=2, graduated cards).
Uses Anki's SM-2 algorithm for interval calculations.
"""
import uuid
import time
import random
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException

from app.services.anki_service import anki_service
from app.services.srs import calculate_next_review, preview_intervals, calculate_days_overdue
from app.models.study import (
    StartStudyRequest, StartStudyResponse,
    AnswerRequest, AnswerResponse,
    PreviewRequest, IntervalPreview,
    StudyCard, StudyCardField
)
from app.utils.audio_naming import extract_audio_from_field

router = APIRouter(prefix="/api/study", tags=["study"])

# In-memory session storage (simple approach for MVP)
# Key: session_id, Value: dict with cards, current_index, deck_name
_sessions: dict[str, dict] = {}


def _clean_interval_label(label: str) -> str:
    """Clean Anki interval label by removing unicode directional characters."""
    # Remove unicode directional isolates (U+2068, U+2069)
    return label.replace('\u2068', '').replace('\u2069', '')


def _card_to_study_card(card: dict) -> StudyCard:
    """Convert AnkiConnect card info to StudyCard model."""
    audio_field = card["fields"].get("Audio", {}).get("value", "")
    audio_file = extract_audio_from_field(audio_field)

    # Convert fields to StudyCardField format
    fields = {}
    for name, data in card["fields"].items():
        fields[name] = StudyCardField(
            value=data.get("value", ""),
            order=data.get("order", 0)
        )

    # Get Anki's interval labels and clean them
    next_reviews_raw = card.get("nextReviews", ["1d", "1d", "1d", "1d"])
    next_reviews = [_clean_interval_label(label) for label in next_reviews_raw]

    queue = card.get("queue", 2)

    return StudyCard(
        card_id=card["cardId"],
        note_id=card["note"],
        deck_name=card["deckName"],
        fields=fields,
        audio_file=audio_file,
        interval=card.get("interval", 1),
        factor=card.get("factor", 2500),
        due=card.get("due", 0),
        queue=queue,
        days_overdue=calculate_days_overdue(card.get("due", 0)) if queue == 2 else 0,
        next_reviews=next_reviews
    )


@router.post("/start", response_model=StartStudyResponse)
async def start_study(request: StartStudyRequest):
    """
    Start a study session for a deck or all decks.

    Fetches all due cards including:
    - Learning cards (queue=1) - shown first
    - Review cards (queue=2)

    If deck_id is None, studies all decks with due cards.
    """
    try:
        decks = await anki_service.get_deck_names_and_ids()

        if request.deck_id is not None:
            # Single deck mode
            deck_name = next((name for name, did in decks.items() if did == request.deck_id), None)
            if not deck_name:
                raise HTTPException(404, "Deck not found")
            query = f'deck:"{deck_name}" is:due'
            session_deck_name = deck_name
        else:
            # All decks mode
            query = 'is:due'
            session_deck_name = "All Decks"

        # Find all due cards (learning + review)
        card_ids = await anki_service.find_cards(query)

        if not card_ids:
            # Return empty session if no due cards
            session_id = str(uuid.uuid4())
            _sessions[session_id] = {
                "cards": [],
                "current_index": 0,
                "deck_name": session_deck_name
            }
            return StartStudyResponse(
                session_id=session_id,
                deck_name=session_deck_name,
                cards=[],
                total_due=0
            )

        # Get card details
        cards_info = await anki_service.get_cards_info(card_ids)

        # Convert to StudyCard models
        study_cards = []
        for card in cards_info:
            try:
                study_cards.append(_card_to_study_card(card))
            except Exception as e:
                # Log the problematic card and skip it
                print(f"Error converting card {card.get('cardId')}: {e}")
                continue

        # Filter and sort cards to match Anki's order:
        # 1. Learning cards (queue=1): only include if due <= now (timestamp)
        # 2. Review cards (queue=2): already filtered by is:due query
        # 3. Learning cards come before review cards
        # 4. Review cards are shuffled (Anki uses reviewOrder=0 by default)
        now_timestamp = int(time.time())

        def is_due_now(c) -> bool:
            if c.queue == 1:
                # Learning cards: due is Unix timestamp, only show if due now
                return c.due <= now_timestamp
            # Review cards are already filtered by Anki's is:due
            return True

        study_cards = [c for c in study_cards if is_due_now(c)]

        # Separate learning and review cards
        learning_cards = [c for c in study_cards if c.queue == 1]
        review_cards = [c for c in study_cards if c.queue == 2]

        # Sort learning cards by due timestamp (earlier first)
        learning_cards.sort(key=lambda c: (c.due, c.interval))

        # Shuffle review cards to match Anki's default random order
        random.shuffle(review_cards)

        # Combine: learning cards first, then shuffled review cards
        study_cards = learning_cards + review_cards

        # Create session
        session_id = str(uuid.uuid4())
        _sessions[session_id] = {
            "cards": study_cards,
            "current_index": 0,
            "deck_name": session_deck_name
        }

        return StartStudyResponse(
            session_id=session_id,
            deck_name=session_deck_name,
            cards=study_cards,
            total_due=len(study_cards)
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in start_study: {e}")
        raise HTTPException(500, f"Failed to start study session: {str(e)}")


@router.post("/answer", response_model=AnswerResponse)
async def answer_card(request: AnswerRequest):
    """
    Answer a card and update its scheduling in Anki.

    Calculates new interval using SM-2 algorithm and updates card via AnkiConnect.
    """
    session = _sessions.get(request.session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Find the card in session
    card = next((c for c in session["cards"] if c.card_id == request.card_id), None)
    if not card:
        raise HTTPException(404, "Card not found in session")

    # Calculate new interval and factor
    new_interval, new_factor = calculate_next_review(
        interval=card.interval,
        factor=card.factor,
        days_overdue=card.days_overdue,
        ease=request.ease
    )

    # Update card in Anki
    # setDueDate expects days from today
    await anki_service.set_due_date([request.card_id], str(new_interval))
    await anki_service.set_ease_factors([request.card_id], [new_factor])

    # Update session state
    session["current_index"] += 1

    # Remove answered card from session
    session["cards"] = [c for c in session["cards"] if c.card_id != request.card_id]

    # Get next card
    next_card = session["cards"][0] if session["cards"] else None
    remaining = len(session["cards"])

    return AnswerResponse(
        new_interval=new_interval,
        new_factor=new_factor,
        next_card=next_card,
        remaining=remaining
    )


@router.post("/preview", response_model=IntervalPreview)
async def preview_card_intervals(request: PreviewRequest):
    """
    Preview intervals for all answer options for a card.

    Returns predicted intervals for Again/Hard/Good/Easy without fuzz.
    """
    # Get card info
    cards_info = await anki_service.get_cards_info([request.card_id])
    if not cards_info:
        raise HTTPException(404, "Card not found")

    card = cards_info[0]
    interval = card.get("interval", 1)
    factor = card.get("factor", 2500)
    days_overdue = calculate_days_overdue(card.get("due", 0))

    # Get previews for all ease options
    previews = preview_intervals(interval, factor, days_overdue)

    return IntervalPreview(
        again=previews[1],
        hard=previews[2],
        good=previews[3],
        easy=previews[4]
    )


@router.get("/due-count/{deck_id}")
async def get_due_count(deck_id: int):
    """Get count of due cards for a deck (learning + review)."""
    decks = await anki_service.get_deck_names_and_ids()
    deck_name = next((name for name, did in decks.items() if did == deck_id), None)

    if not deck_name:
        raise HTTPException(404, "Deck not found")

    # Count all due cards (learning + review)
    query = f'deck:"{deck_name}" is:due'
    card_ids = await anki_service.find_cards(query)

    return {"deck_id": deck_id, "due_count": len(card_ids)}


@router.delete("/session/{session_id}")
async def end_session(session_id: str):
    """End a study session and clean up."""
    if session_id in _sessions:
        del _sessions[session_id]
        return {"success": True}
    return {"success": False, "message": "Session not found"}


@router.get("/due-counts")
async def get_all_due_counts():
    """
    Get due card counts for all decks (learning + review).

    Returns total due count and per-deck breakdown.
    """
    decks = await anki_service.get_deck_names_and_ids()

    # Get all due cards (learning + review)
    all_due_query = 'is:due'
    all_card_ids = await anki_service.find_cards(all_due_query)

    if not all_card_ids:
        return {
            "total_due": 0,
            "decks": []
        }

    # Get card info to group by deck
    cards_info = await anki_service.get_cards_info(all_card_ids)

    # Group by deck
    deck_counts: dict[str, int] = {}
    for card in cards_info:
        deck_name = card.get("deckName", "Unknown")
        deck_counts[deck_name] = deck_counts.get(deck_name, 0) + 1

    # Build response with deck IDs
    deck_id_map = {name: did for name, did in decks.items()}
    decks_with_due = [
        {
            "deck_id": deck_id_map.get(name, 0),
            "deck_name": name,
            "due_count": count
        }
        for name, count in sorted(deck_counts.items(), key=lambda x: -x[1])
    ]

    return {
        "total_due": len(all_card_ids),
        "decks": decks_with_due
    }
