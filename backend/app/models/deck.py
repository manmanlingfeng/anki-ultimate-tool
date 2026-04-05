from pydantic import BaseModel
from typing import Optional

class DeckStats(BaseModel):
    deck_id: int
    name: str
    total_cards: int
    new_count: int
    review_count: int
    learn_count: int

class DeckTreeNode(BaseModel):
    name: str
    full_name: str
    deck_id: int
    total_cards: int
    has_overflow: bool
    children: list["DeckTreeNode"] = []

class CreateDeckRequest(BaseModel):
    deck_name: str
