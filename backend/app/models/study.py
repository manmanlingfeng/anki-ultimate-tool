"""Pydantic models for study session functionality."""
from typing import Literal, Optional
from pydantic import BaseModel


class StudyCardField(BaseModel):
    """Single field from a card."""
    value: str
    order: int


class StudyCard(BaseModel):
    """Card data for study session."""
    card_id: int
    note_id: int
    deck_name: str
    fields: dict[str, StudyCardField]
    audio_file: Optional[str] = None
    interval: int  # Current interval in days
    factor: int  # Ease factor (2500 = 250%)
    due: int  # Due date (timestamp for learning, days for review)
    queue: int  # 1=learning, 2=review
    days_overdue: int  # Days past due date (for review cards)
    next_reviews: list[str]  # Anki's interval labels [Again, Hard, Good, Easy]


class StartStudyRequest(BaseModel):
    """Request to start a study session."""
    deck_id: Optional[int] = None  # None = study all decks


class StartStudyResponse(BaseModel):
    """Response with study session data."""
    session_id: str
    deck_name: str
    cards: list[StudyCard]
    total_due: int


class AnswerRequest(BaseModel):
    """Request to answer a card."""
    session_id: str
    card_id: int
    ease: Literal[1, 2, 3, 4]  # 1=Again, 2=Hard, 3=Good, 4=Easy


class AnswerResponse(BaseModel):
    """Response after answering a card."""
    new_interval: int
    new_factor: int
    next_card: Optional[StudyCard] = None
    remaining: int


class IntervalPreview(BaseModel):
    """Preview of intervals for each answer option."""
    again: int  # ease=1
    hard: int   # ease=2
    good: int   # ease=3
    easy: int   # ease=4


class PreviewRequest(BaseModel):
    """Request to preview intervals for a card."""
    card_id: int


class StudyStats(BaseModel):
    """Study statistics for a deck."""
    due_today: int
    reviewed_today: int
    streak_days: int
    accuracy_rate: float  # 0.0-1.0
