from pydantic import BaseModel
from typing import Optional

class CardField(BaseModel):
    value: str
    order: int

class CardInfo(BaseModel):
    card_id: int
    note_id: int
    deck_name: str
    fields: dict[str, CardField]
    audio_file: Optional[str] = None
    audio_index: Optional[int] = None

class CreateCardRequest(BaseModel):
    deck_name: str
    word: str
    pinyin: str
    sino: str
    definition: str
    tip: Optional[str] = ""
    example: Optional[str] = ""

class UpdateCardRequest(BaseModel):
    note_id: int
    fields: dict[str, str]

class MoveCardsRequest(BaseModel):
    card_ids: list[int]
    target_deck: str
