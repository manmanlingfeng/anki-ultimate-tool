from pydantic import BaseModel
from typing import Optional

from app.models.dict import ZdicEntry


class PinyinIssue(BaseModel):
    note_id: int
    word: str
    field_name: str
    current_pinyin: str
    suggested_pinyin: str
    reason: str
    confidence: float  # 0.0-1.0
    # Dictionary reference (optional)
    zdic_entry: Optional[ZdicEntry] = None
    is_polyphonic: bool = False
    all_valid_readings: list[str] = []


class PinyinCheckRequest(BaseModel):
    deck_id: int
    card_ids: Optional[list[int]] = None  # None = all cards


class PinyinCheckResponse(BaseModel):
    total_checked: int
    issues_found: int
    issues: list[PinyinIssue]
    estimated_cost: float
    error: Optional[str] = None  # Error message if API failed


class ApplySuggestionRequest(BaseModel):
    note_id: int
    field_name: str
    value: str


class ApplySuggestionResponse(BaseModel):
    success: bool
    note_id: int


class CostEstimate(BaseModel):
    card_count: int
    estimated_tokens: int
    estimated_cost: float


class DeckPinyinResult(BaseModel):
    deck_id: int
    deck_name: str
    issues: list[PinyinIssue]


class MultiDeckPinyinResponse(BaseModel):
    total_decks: int
    total_checked: int
    issues_found: int
    estimated_cost: float
    error: Optional[str] = None
    decks: list[DeckPinyinResult]


# Example generation models
class ExampleSentence(BaseModel):
    """Single example sentence with Chinese, pinyin, Sino-Vietnamese, and Vietnamese translation"""
    chinese: str
    pinyin: str
    sino: str  # Sino-Vietnamese (Han-Viet)
    vietnamese: str


class GenerateExamplesRequest(BaseModel):
    """Request to generate examples for a single card"""
    note_id: int
    word: str
    pinyin: str
    definition: str


class GenerateExamplesResponse(BaseModel):
    """Response with generated examples"""
    note_id: int
    examples: list[ExampleSentence]
    html: str  # Pre-formatted HTML for RichTextEditor
    estimated_cost: float
