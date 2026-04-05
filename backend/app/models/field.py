"""
Field operation models for unified field suggestion system.
Supports: Pinyin, Sino-Vietnamese, Definition, Examples, Simplified.
"""
from enum import Enum
from pydantic import BaseModel
from typing import Optional, List


class FieldType(str, Enum):
    """Supported field types for suggestion"""
    PINYIN = "pinyin"
    SINO = "sino"
    DEFINITION = "definition"
    EXAMPLES = "examples"
    SIMPLIFIED = "simplified"


class FieldSuggestionRequest(BaseModel):
    """Request to generate suggestion for a single field"""
    note_id: int
    field_type: FieldType
    word: str
    pinyin: Optional[str] = None  # Context for sino/definition
    definition: Optional[str] = None  # Context for examples


class FieldSuggestionResponse(BaseModel):
    """Response with field suggestion"""
    note_id: int
    field_type: FieldType
    suggestion: str
    html: Optional[str] = None  # Formatted HTML for RTE
    source: str  # "dictionary" | "ai" | "local"
    confidence: float  # 0.0-1.0
    cost: Optional[float] = None
    alternatives: Optional[List[str]] = None  # For polyphonic readings
    is_already_simplified: Optional[bool] = None  # True if word is already simplified


class FieldStats(BaseModel):
    """Statistics for a single field type"""
    total: int
    filled: int
    missing: int


class DeckFieldStatsResponse(BaseModel):
    """Field statistics for a deck"""
    deck_id: Optional[int]
    deck_name: str
    pinyin: FieldStats
    sino: FieldStats
    definition: FieldStats
    examples: FieldStats
    simplified: FieldStats
    audio: FieldStats


class FieldVerifyResponse(BaseModel):
    """Response from field verification"""
    note_id: int
    field_type: FieldType
    is_correct: bool
    current_value: str
    suggested_value: Optional[str] = None
    reason: Optional[str] = None
    confidence: float = 0.9
    issues: Optional[List[str]] = None  # For examples
    cost: float = 0.0
