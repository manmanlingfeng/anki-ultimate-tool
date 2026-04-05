"""
Field statistics service for counting filled/missing fields.
"""
from typing import Optional

from app.services.anki_service import anki_service
from app.models.field import FieldStats, DeckFieldStatsResponse
from app.utils.examples_validator import should_regenerate_examples


class FieldStatsService:
    """Service for calculating field statistics"""

    async def get_field_stats(
        self, deck_id: Optional[int], deck_name: str
    ) -> DeckFieldStatsResponse:
        """
        Get field statistics for a deck.
        Counts filled vs missing for each field type.
        """
        # Get all cards for deck
        if deck_id:
            card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
        else:
            # Get all cards if no deck specified
            card_ids = await anki_service.find_cards("")

        if not card_ids:
            return self._empty_stats(deck_id, deck_name)

        cards_info = await anki_service.get_cards_info(card_ids)

        # Count filled/missing for each field
        stats = {
            "pinyin": {"total": 0, "filled": 0, "missing": 0},
            "sino": {"total": 0, "filled": 0, "missing": 0},
            "definition": {"total": 0, "filled": 0, "missing": 0},
            "examples": {"total": 0, "filled": 0, "missing": 0},
            "simplified": {"total": 0, "filled": 0, "missing": 0},
            "audio": {"total": 0, "filled": 0, "missing": 0},
        }

        for card in cards_info:
            fields = card.get("fields", {})

            # Check each field type
            stats["pinyin"]["total"] += 1
            if self._is_field_filled(fields, ["Pinyin", "拼音", "Reading"]):
                stats["pinyin"]["filled"] += 1
            else:
                stats["pinyin"]["missing"] += 1

            stats["sino"]["total"] += 1
            if self._is_field_filled(fields, ["Sino", "Han-Viet", "Hán Việt"]):
                stats["sino"]["filled"] += 1
            else:
                stats["sino"]["missing"] += 1

            stats["definition"]["total"] += 1
            if self._is_field_filled(fields, ["Definition", "Meaning", "Vietnamese"]):
                stats["definition"]["filled"] += 1
            else:
                stats["definition"]["missing"] += 1

            stats["examples"]["total"] += 1
            if self._is_field_filled(fields, ["Example", "Examples", "例句"]):
                stats["examples"]["filled"] += 1
            else:
                stats["examples"]["missing"] += 1

            stats["simplified"]["total"] += 1
            if self._is_field_filled(fields, ["Simplified", "简体", "Giản Thể"]):
                stats["simplified"]["filled"] += 1
            else:
                stats["simplified"]["missing"] += 1

            stats["audio"]["total"] += 1
            if self._is_field_filled(fields, ["Audio", "Sound", "声音"]):
                stats["audio"]["filled"] += 1
            else:
                stats["audio"]["missing"] += 1

        return DeckFieldStatsResponse(
            deck_id=deck_id,
            deck_name=deck_name,
            pinyin=FieldStats(**stats["pinyin"]),
            sino=FieldStats(**stats["sino"]),
            definition=FieldStats(**stats["definition"]),
            examples=FieldStats(**stats["examples"]),
            simplified=FieldStats(**stats["simplified"]),
            audio=FieldStats(**stats["audio"]),
        )

    def _is_field_filled(self, fields: dict, field_names: list[str]) -> bool:
        """Check if any of the field names has non-empty value"""
        for name in field_names:
            if name in fields:
                value = fields[name].get("value", "")
                if value and value.strip():
                    return True
        return False

    def _empty_stats(self, deck_id: Optional[int], deck_name: str) -> DeckFieldStatsResponse:
        """Return empty stats structure"""
        empty = FieldStats(total=0, filled=0, missing=0)
        return DeckFieldStatsResponse(
            deck_id=deck_id,
            deck_name=deck_name,
            pinyin=empty,
            sino=empty,
            definition=empty,
            examples=empty,
            simplified=empty,
            audio=empty,
        )

    async def get_cards_missing_field(
        self, deck_id: Optional[int], field_type: str, mode: str = "with_children"
    ) -> list[dict]:
        """
        Get cards that are missing the specified field.
        Returns list of dicts with note_id, word, pinyin, definition.

        For simplified field: skips cards where word is already simplified.
        For examples field: also includes cards with malformed examples format.
        """
        # Field name mappings
        field_names_map = {
            "pinyin": ["Pinyin", "拼音", "Reading"],
            "sino": ["Sino", "Han-Viet", "Hán Việt"],
            "definition": ["Definition", "Meaning", "Vietnamese"],
            "examples": ["Example", "Examples", "例句"],
            "simplified": ["Simplified", "简体", "Giản Thể"],
        }

        target_field_names = field_names_map.get(field_type, [field_type.capitalize()])

        # For simplified field, prepare OpenCC converter
        opencc_converter = None
        if field_type == "simplified":
            try:
                from opencc import OpenCC
                opencc_converter = OpenCC('t2s')
            except Exception:
                pass  # OpenCC not available, will include all cards

        # Get cards - for now just use deck_id if provided
        if deck_id:
            # Get deck name first
            decks = await anki_service.get_deck_names_and_ids()
            deck_name = next((name for name, did in decks.items() if did == deck_id), None)
            if deck_name:
                card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
            else:
                card_ids = []
        else:
            card_ids = await anki_service.find_cards("")

        if not card_ids:
            return []

        cards_info = await anki_service.get_cards_info(card_ids)
        missing_cards = []

        for card in cards_info:
            fields = card.get("fields", {})

            # Get current field value
            current_value = ""
            for field_name in target_field_names:
                if field_name in fields:
                    val = fields[field_name].get("value", "")
                    if val:
                        current_value = val
                        break

            # Check if field should be regenerated
            should_include = False
            original_value = ""

            if not self._is_field_filled(fields, target_field_names):
                # Field is empty/missing
                should_include = True
            elif field_type == "examples":
                # For examples: also check format validity
                needs_regen, reason = should_regenerate_examples(current_value)
                if needs_regen:
                    should_include = True
                    original_value = current_value

            if not should_include:
                continue

            # Extract word and other fields for context
            word = (
                fields.get("Word", {}).get("value", "") or
                fields.get("汉字", {}).get("value", "") or
                fields.get("Character", {}).get("value", "") or
                fields.get("Front", {}).get("value", "")
            )

            if not word:
                continue

            # For simplified field: skip if word is already simplified
            if field_type == "simplified" and opencc_converter:
                simplified_word = opencc_converter.convert(word)
                if simplified_word == word:
                    # Word is already simplified, no need to fill
                    continue

            pinyin = (
                fields.get("Pinyin", {}).get("value", "") or
                fields.get("拼音", {}).get("value", "") or
                fields.get("Reading", {}).get("value", "")
            )
            definition = (
                fields.get("Definition", {}).get("value", "") or
                fields.get("Meaning", {}).get("value", "") or
                fields.get("Vietnamese", {}).get("value", "")
            )

            missing_cards.append({
                "note_id": card.get("note"),
                "word": word,
                "pinyin": pinyin,
                "definition": definition,
                "original_value": original_value,
            })

        return missing_cards

    async def get_all_cards_for_field(
        self, deck_id: Optional[int], field_type: str, mode: str = "with_children"
    ) -> list[dict]:
        """
        Get ALL cards for regeneration (regardless of field value).
        Returns list of dicts with note_id, word, pinyin, definition, original_value.
        """
        # Field name mappings
        field_names_map = {
            "pinyin": ["Pinyin", "拼音", "Reading"],
            "sino": ["Sino", "Han-Viet", "Hán Việt"],
            "definition": ["Definition", "Meaning", "Vietnamese"],
            "examples": ["Example", "Examples", "例句"],
            "simplified": ["Simplified", "简体", "Giản Thể"],
        }

        target_field_names = field_names_map.get(field_type, [field_type.capitalize()])

        # Get cards - for now just use deck_id if provided
        if deck_id:
            decks = await anki_service.get_deck_names_and_ids()
            deck_name = next((name for name, did in decks.items() if did == deck_id), None)
            if deck_name:
                card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
            else:
                card_ids = []
        else:
            card_ids = await anki_service.find_cards("")

        if not card_ids:
            return []

        cards_info = await anki_service.get_cards_info(card_ids)
        all_cards = []

        for card in cards_info:
            fields = card.get("fields", {})

            # Extract word and other fields for context
            word = (
                fields.get("Word", {}).get("value", "") or
                fields.get("汉字", {}).get("value", "") or
                fields.get("Character", {}).get("value", "") or
                fields.get("Front", {}).get("value", "")
            )
            pinyin = (
                fields.get("Pinyin", {}).get("value", "") or
                fields.get("拼音", {}).get("value", "") or
                fields.get("Reading", {}).get("value", "")
            )
            definition = (
                fields.get("Definition", {}).get("value", "") or
                fields.get("Meaning", {}).get("value", "") or
                fields.get("Vietnamese", {}).get("value", "")
            )

            # Get the current value of the target field
            original_value = ""
            for field_name in target_field_names:
                if field_name in fields:
                    val = fields[field_name].get("value", "")
                    if val:
                        original_value = val
                        break

            if word:  # Only include if we have a word
                all_cards.append({
                    "note_id": card.get("note"),
                    "word": word,
                    "pinyin": pinyin,
                    "definition": definition,
                    "original_value": original_value,
                })

        return all_cards

    async def get_cards_with_field(
        self, deck_id: Optional[int], field_type: str, mode: str = "with_children"
    ) -> list[dict]:
        """
        Get cards that HAVE the specified field (for verification).
        Returns list of dicts with note_id, word, pinyin, definition, current_value.
        """
        # Field name mappings
        field_names_map = {
            "pinyin": ["Pinyin", "拼音", "Reading"],
            "sino": ["Sino", "Han-Viet", "Hán Việt"],
            "definition": ["Definition", "Meaning", "Vietnamese"],
            "examples": ["Example", "Examples", "例句"],
            "simplified": ["Simplified", "简体", "Giản Thể"],
        }

        target_field_names = field_names_map.get(field_type, [field_type.capitalize()])

        # Get cards - for now just use deck_id if provided
        if deck_id:
            decks = await anki_service.get_deck_names_and_ids()
            deck_name = next((name for name, did in decks.items() if did == deck_id), None)
            if deck_name:
                card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
            else:
                card_ids = []
        else:
            card_ids = await anki_service.find_cards("")

        if not card_ids:
            return []

        cards_info = await anki_service.get_cards_info(card_ids)
        cards_with_field = []

        for card in cards_info:
            fields = card.get("fields", {})

            # Check if target field EXISTS and is filled
            if self._is_field_filled(fields, target_field_names):
                # Extract word and other fields for context
                word = (
                    fields.get("Word", {}).get("value", "") or
                    fields.get("汉字", {}).get("value", "") or
                    fields.get("Character", {}).get("value", "") or
                    fields.get("Front", {}).get("value", "")
                )
                pinyin = (
                    fields.get("Pinyin", {}).get("value", "") or
                    fields.get("拼音", {}).get("value", "") or
                    fields.get("Reading", {}).get("value", "")
                )
                definition = (
                    fields.get("Definition", {}).get("value", "") or
                    fields.get("Meaning", {}).get("value", "") or
                    fields.get("Vietnamese", {}).get("value", "")
                )

                # Get the current value of the target field
                current_value = ""
                for field_name in target_field_names:
                    if field_name in fields:
                        val = fields[field_name].get("value", "")
                        if val and val.strip():
                            current_value = val
                            break

                if word and current_value:  # Only include if we have word and field value
                    cards_with_field.append({
                        "note_id": card.get("note"),
                        "word": word,
                        "pinyin": pinyin,
                        "definition": definition,
                        "current_value": current_value,
                    })

        return cards_with_field


# Singleton instance
field_stats_service = FieldStatsService()
