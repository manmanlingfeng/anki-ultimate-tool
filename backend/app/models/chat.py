"""
Chat models for Ask AI feature.
Handles conversation history and chat requests for flashcard Q&A.
"""

from datetime import datetime
from pydantic import BaseModel


class ChatMessage(BaseModel):
    """Single message in a conversation."""
    role: str  # "user" | "assistant"
    content: str
    timestamp: datetime


class ChatRequest(BaseModel):
    """Request to ask AI a question about a card."""
    note_id: int
    word: str
    pinyin: str | None = None
    definition: str | None = None
    question: str


class ChatHistory(BaseModel):
    """Conversation history for a specific card."""
    note_id: int
    word: str
    messages: list[ChatMessage]
    updated_at: datetime


class PresetQuestion(BaseModel):
    """Preset question template for quick access."""
    id: str
    label: str  # Vietnamese label
    card_type: str  # "single_char" | "phrase" | "all"


class ChatHistoryStore(BaseModel):
    """Root structure for chat history JSON file."""
    version: int = 1
    histories: dict[str, ChatHistory] = {}
