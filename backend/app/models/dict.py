"""
Dictionary models for zdic.net integration.
"""
from pydantic import BaseModel
from typing import Optional


class ZdicReading(BaseModel):
    """A single pinyin reading with its meaning."""
    pinyin: str              # e.g., "háng"
    meaning: str = ""        # e.g., "row, profession"
    is_common: bool = True   # Common vs rare reading


class ZdicEntry(BaseModel):
    """Dictionary entry from zdic.net."""
    word: str                          # Chinese character(s)
    readings: list[ZdicReading]        # All valid readings
    url: str                           # Link to zdic.net page
    is_polyphonic: bool = False        # True if multiple readings

    @property
    def all_pinyin(self) -> list[str]:
        """Get list of all pinyin readings."""
        return [r.pinyin for r in self.readings]


class DictLookupResponse(BaseModel):
    """Response for dictionary lookup endpoint."""
    word: str
    entry: Optional[ZdicEntry] = None
    error: Optional[str] = None
    cached: bool = False
