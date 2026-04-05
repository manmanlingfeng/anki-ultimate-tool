import httpx
from typing import Any
import os
import base64

ANKI_URL = os.getenv("ANKI_CONNECT_URL", "http://localhost:8765")

class AnkiService:
    def __init__(self):
        self.url = ANKI_URL
        self.version = 6

    async def _invoke(self, action: str, **params) -> Any:
        """Call AnkiConnect API"""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self.url,
                    json={
                        "action": action,
                        "version": self.version,
                        "params": params
                    },
                    timeout=30.0  # Increased for sync operations
                )
                data = response.json()
                if data.get("error"):
                    raise Exception(data["error"])
                return data.get("result")
            except httpx.ConnectError:
                raise Exception("Anki is not running or AnkiConnect not installed")
            except httpx.ReadTimeout:
                raise Exception("Anki is busy (sync in progress?). Please try again.")

    async def health_check(self) -> bool:
        """Check if Anki is accessible"""
        try:
            await self._invoke("version")
            return True
        except:
            return False

    async def sync(self) -> None:
        """Synchronize local Anki collection with AnkiWeb"""
        await self._invoke("sync")

    async def get_deck_names_and_ids(self) -> dict[str, int]:
        """Get all deck names with IDs"""
        return await self._invoke("deckNamesAndIds")

    async def get_deck_stats(self, decks: list[str]) -> dict:
        """Get stats for specified decks"""
        return await self._invoke("getDeckStats", decks=decks)

    async def find_cards(self, query: str) -> list[int]:
        """Find card IDs matching query"""
        return await self._invoke("findCards", query=query)

    async def get_cards_info(self, cards: list[int]) -> list[dict]:
        """Get detailed info for cards"""
        return await self._invoke("cardsInfo", cards=cards)

    async def get_notes_info(self, notes: list[int]) -> list[dict]:
        """Get detailed info for notes"""
        return await self._invoke("notesInfo", notes=notes)

    async def add_note(self, deck_name: str, model_name: str, fields: dict, audio: dict = None) -> int:
        """Add new note/card"""
        note = {
            "deckName": deck_name,
            "modelName": model_name,
            "fields": fields,
            "options": {"allowDuplicate": False}
        }
        if audio:
            note["audio"] = [audio]
        return await self._invoke("addNote", note=note)

    async def update_note_fields(self, note_id: int, fields: dict) -> None:
        """Update existing note fields"""
        await self._invoke("updateNoteFields", note={"id": note_id, "fields": fields})

    async def delete_notes(self, note_ids: list[int]) -> None:
        """Delete notes"""
        await self._invoke("deleteNotes", notes=note_ids)

    async def change_deck(self, cards: list[int], deck: str) -> None:
        """Move cards to different deck"""
        await self._invoke("changeDeck", cards=cards, deck=deck)

    async def create_deck(self, deck_name: str) -> int:
        """Create new deck"""
        return await self._invoke("createDeck", deck=deck_name)

    async def store_media_file(self, filename: str, data: bytes) -> str:
        """Store audio file in Anki media folder"""
        return await self._invoke(
            "storeMediaFile",
            filename=filename,
            data=base64.b64encode(data).decode()
        )

    async def get_media_dir_path(self) -> str:
        """Get Anki media folder path, converting Windows path to WSL if needed"""
        path = await self._invoke("getMediaDirPath")
        # Convert Windows path to WSL path if running in WSL
        if path and len(path) > 2 and path[1] == ':':
            # Windows path like C:\Users\... -> /mnt/c/Users/...
            drive = path[0].lower()
            path = f"/mnt/{drive}{path[2:].replace(chr(92), '/')}"
        return path

    async def get_media_files_names(self, pattern: str) -> list[str]:
        """
        Get media files matching pattern.

        Args:
            pattern: Glob pattern (e.g., "chinese_word_*.mp3")

        Returns:
            List of matching filenames
        """
        return await self._invoke("getMediaFilesNames", pattern=pattern)

    async def set_due_date(self, cards: list[int], days: str) -> None:
        """
        Set due date for cards.

        Args:
            cards: List of card IDs
            days: Days string - "0" for today, "1" for tomorrow, etc.
                  Can also use relative format like "+3" for 3 days from now
        """
        await self._invoke("setDueDate", cards=cards, days=days)

    async def set_ease_factors(self, cards: list[int], ease_factors: list[int]) -> None:
        """
        Set ease factors for cards.

        Args:
            cards: List of card IDs
            ease_factors: List of ease factors (2500 = 250%)
                         Must be same length as cards list
        """
        await self._invoke("setEaseFactors", cards=cards, easeFactors=ease_factors)

    async def get_reviews_of_cards(self, cards: list[int]) -> dict:
        """
        Get review history for cards.

        Args:
            cards: List of card IDs

        Returns:
            Dict mapping card ID to list of review records
        """
        return await self._invoke("getReviewsOfCards", cards=cards)

anki_service = AnkiService()
