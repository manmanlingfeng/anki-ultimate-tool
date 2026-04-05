from typing import Optional
from fastapi import APIRouter, HTTPException
from app.services.anki_service import anki_service
from app.models.deck import DeckTreeNode, CreateDeckRequest
from app.models.card import CardInfo, CreateCardRequest, UpdateCardRequest, MoveCardsRequest
from app.utils.audio_naming import extract_audio_from_field
from app.utils.field_cleaner import scan_field_issues, clean_field
from app.utils.deck_filter import filter_decks_by_mode

router = APIRouter(prefix="/api/anki", tags=["anki"])

@router.get("/health")
async def check_anki_health():
    """Check if Anki is running and accessible"""
    is_healthy = await anki_service.health_check()
    if not is_healthy:
        raise HTTPException(503, "Anki is not running")
    return {"status": "connected"}


@router.post("/sync")
async def sync_anki():
    """Synchronize local Anki collection with AnkiWeb"""
    try:
        await anki_service.sync()
        return {"status": "synced"}
    except Exception as e:
        raise HTTPException(500, f"Sync failed: {str(e)}")

@router.get("/decks/tree")
async def get_deck_tree():
    """Get hierarchical deck structure with stats"""
    decks = await anki_service.get_deck_names_and_ids()

    # Build tree structure
    tree = {}
    for full_name, deck_id in decks.items():
        if not full_name.startswith("Chinese"):
            continue

        parts = full_name.split("::")
        current = tree
        for i, part in enumerate(parts):
            path = "::".join(parts[:i+1])
            if part not in current:
                current[part] = {"children": {}, "full_name": path, "deck_id": deck_id}
            current = current[part]["children"]

    # Get stats for leaf decks (Parts)
    leaf_decks = [name for name in decks.keys()
                  if name.startswith("Chinese") and "Part" in name]

    stats = await anki_service.get_deck_stats(leaf_decks) if leaf_decks else {}

    def build_node(name: str, data: dict, parent_path: str = "") -> DeckTreeNode:
        full_name = data.get("full_name", name)
        deck_id = data.get("deck_id", 0)
        stat = stats.get(str(deck_id), {})
        total = stat.get("total_in_deck", 0)

        children = [
            build_node(child_name, child_data, full_name)
            for child_name, child_data in data.get("children", {}).items()
        ]

        if children and not total:
            total = sum(c.total_cards for c in children)

        return DeckTreeNode(
            name=name,
            full_name=full_name,
            deck_id=deck_id,
            total_cards=total,
            has_overflow=total > 100 and "Part" in full_name,
            children=children
        )

    result = []
    for name, data in tree.items():
        result.append(build_node(name, data))

    return result

@router.get("/decks/{deck_id}/cards")
async def get_deck_cards(
    deck_id: int,
    include_children: bool = True,
    limit: int = 50,
    offset: int = 0
):
    """Get cards in a deck with pagination support.

    Args:
        deck_id: The deck ID to fetch cards from
        include_children: If True, also fetch cards from all child decks (default True)
        limit: Max cards to return per page (default 50)
        offset: Number of cards to skip (default 0)
    """
    decks = await anki_service.get_deck_names_and_ids()
    deck_name = next((name for name, id in decks.items() if id == deck_id), None)

    if not deck_name:
        raise HTTPException(404, "Deck not found")

    # Build query based on include_children flag
    if include_children:
        # Find all child decks and build OR query
        prefix = deck_name + "::"
        deck_names = [deck_name] + [n for n in decks.keys() if n.startswith(prefix)]
        query = " OR ".join([f'deck:"{dn}"' for dn in deck_names])
    else:
        query = f'deck:"{deck_name}"'

    card_ids = await anki_service.find_cards(query)
    if not card_ids:
        return {"cards": [], "total": 0, "has_more": False}

    # Sort descending - newest cards (higher IDs) first
    card_ids.sort(reverse=True)
    total = len(card_ids)

    # Apply pagination
    paginated_ids = card_ids[offset:offset + limit]
    if not paginated_ids:
        return {"cards": [], "total": total, "has_more": False}

    cards_info = await anki_service.get_cards_info(paginated_ids)

    result = []
    for idx, card in enumerate(cards_info):
        audio_field = card["fields"].get("Audio", {}).get("value", "")
        audio_file = extract_audio_from_field(audio_field)

        result.append(CardInfo(
            card_id=card["cardId"],
            note_id=card["note"],
            deck_name=card["deckName"],
            fields=card["fields"],
            audio_file=audio_file,
            audio_index=offset + idx  # Global index for audio ordering
        ))

    return {
        "cards": result,
        "total": total,
        "has_more": offset + limit < total
    }

@router.get("/cards/check-duplicate")
async def check_duplicate_word(word: str, deck_id: Optional[int] = None):
    """Check if a word already exists in a deck or globally"""
    from app.utils.html_cleaner import strip_html_tags

    # Clean the input word
    clean_word = strip_html_tags(word).strip()
    if not clean_word:
        return {"exists": False, "matches": []}

    # Build search query
    if deck_id:
        decks = await anki_service.get_deck_names_and_ids()
        deck_name = next((name for name, id in decks.items() if id == deck_id), None)
        if not deck_name:
            return {"exists": False, "matches": []}
        query = f'deck:"{deck_name}" Word:"{clean_word}"'
    else:
        query = f'Word:"{clean_word}"'

    card_ids = await anki_service.find_cards(query)

    if not card_ids:
        return {"exists": False, "matches": []}

    # Get card info for matches
    cards_info = await anki_service.get_cards_info(card_ids[:5])  # Limit to 5 matches
    matches = []
    for card in cards_info:
        matches.append({
            "note_id": card["note"],
            "deck_name": card["deckName"],
            "word": card["fields"].get("Word", {}).get("value", ""),
            "pinyin": card["fields"].get("Pinyin", {}).get("value", ""),
        })

    return {"exists": True, "matches": matches}


@router.post("/cards")
async def create_card(request: CreateCardRequest):
    """Create new flashcard"""
    fields = {
        "Word": request.word,
        "Pinyin": request.pinyin,
        "Sino": request.sino,
        "Definition": request.definition,
        "Tip": request.tip or "",
        "Example": request.example or "",
        "Audio": "",
        "Simplified": ""
    }

    note_id = await anki_service.add_note(
        deck_name=request.deck_name,
        model_name="Chinese Vocabulary",
        fields=fields
    )

    return {"note_id": note_id}

@router.put("/cards/{note_id}")
async def update_card(note_id: int, request: UpdateCardRequest):
    """Update card fields"""
    await anki_service.update_note_fields(note_id, request.fields)
    return {"success": True}

@router.delete("/cards/{note_id}")
async def delete_card(note_id: int):
    """Delete a card"""
    await anki_service.delete_notes([note_id])
    return {"success": True}

@router.post("/cards/move")
async def move_cards(request: MoveCardsRequest):
    """Move cards to different deck"""
    await anki_service.change_deck(request.card_ids, request.target_deck)
    return {"success": True, "moved": len(request.card_ids)}

@router.post("/decks")
async def create_deck(request: CreateDeckRequest):
    """Create new deck"""
    deck_id = await anki_service.create_deck(request.deck_name)
    return {"deck_id": deck_id}


@router.get("/decks/scan-all")
async def scan_all_decks(
    deck_id: Optional[int] = None,
    mode: str = "all"
):
    """
    Scan decks for field issues and audio status with card-level details.

    Args:
        deck_id: Optional deck ID to filter (required for non-"all" modes)
        mode: "all" (all decks), "with_children" (deck + children), "children_only"
    """
    all_decks = await anki_service.get_deck_names_and_ids()

    # Filter decks based on mode
    filtered_decks = filter_decks_by_mode(deck_id, mode, all_decks)
    leaf_decks = list(filtered_decks.items())

    if not leaf_decks:
        return {
            "total_decks": 0,
            "total_cards": 0,
            "cards_with_issues": 0,
            "cards_without_audio": 0,
            "decks": []
        }

    check_fields = ['Word', 'Pinyin', 'Sino', 'Definition', 'Tip', 'Example']
    decks_data = []
    total_cards = 0
    total_cards_with_issues = 0
    total_cards_without_audio = 0

    for deck_name, deck_id in leaf_decks:
        card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
        if not card_ids:
            continue

        cards_info = await anki_service.get_cards_info(card_ids)
        cards_with_issues_list = []
        deck_cards_without_audio = 0

        for card in cards_info:
            # Check for field issues
            card_issues = []
            for field_name in check_fields:
                field_value = card["fields"].get(field_name, {}).get("value", "")
                issues = scan_field_issues(field_name, field_value)
                card_issues.extend(issues)

            if card_issues:
                cards_with_issues_list.append({
                    "note_id": card["note"],
                    "card_id": card["cardId"],
                    "word": card["fields"].get("Word", {}).get("value", ""),
                    "pinyin": card["fields"].get("Pinyin", {}).get("value", ""),
                    "issues": card_issues
                })

            # Check for audio
            audio_field = card["fields"].get("Audio", {}).get("value", "")
            audio_file = extract_audio_from_field(audio_field)
            if not audio_file:
                deck_cards_without_audio += 1

        total_cards += len(cards_info)
        total_cards_with_issues += len(cards_with_issues_list)
        total_cards_without_audio += deck_cards_without_audio

        # Only include decks with issues
        if cards_with_issues_list or deck_cards_without_audio > 0:
            decks_data.append({
                "deck_id": deck_id,
                "deck_name": deck_name,
                "total_cards": len(cards_info),
                "cards_with_issues": cards_with_issues_list,
                "cards_without_audio": deck_cards_without_audio
            })

    # Sort by number of cards with issues (descending)
    decks_data.sort(key=lambda x: len(x["cards_with_issues"]), reverse=True)

    return {
        "total_decks": len(leaf_decks),
        "total_cards": total_cards,
        "cards_with_issues": total_cards_with_issues,
        "cards_without_audio": total_cards_without_audio,
        "decks": decks_data
    }


@router.post("/decks/fix-all")
async def fix_all_decks(
    deck_id: Optional[int] = None,
    mode: str = "all"
):
    """
    Fix field issues across decks.

    Args:
        deck_id: Optional deck ID to filter (required for non-"all" modes)
        mode: "all" (all decks), "with_children" (deck + children), "children_only"
    """
    all_decks = await anki_service.get_deck_names_and_ids()

    # Filter decks based on mode
    filtered_decks = filter_decks_by_mode(deck_id, mode, all_decks)
    leaf_decks = list(filtered_decks.items())

    check_fields = ['Word', 'Pinyin', 'Sino', 'Definition', 'Tip', 'Example']
    total_fixed_cards = 0
    total_fixed_fields = 0

    for deck_name, _ in leaf_decks:
        card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
        if not card_ids:
            continue

        cards_info = await anki_service.get_cards_info(card_ids)

        for card in cards_info:
            updates = {}
            for field_name in check_fields:
                original = card["fields"].get(field_name, {}).get("value", "")
                cleaned = clean_field(original)
                if cleaned != original:
                    updates[field_name] = cleaned
                    total_fixed_fields += 1

            if updates:
                await anki_service.update_note_fields(card["note"], updates)
                total_fixed_cards += 1

    return {
        "fixed_cards": total_fixed_cards,
        "total_fields_fixed": total_fixed_fields
    }


@router.get("/decks/{deck_id}/scan")
async def scan_deck_fields(deck_id: int):
    """Scan all cards in deck for field issues like HTML entities, extra spaces, etc."""
    decks = await anki_service.get_deck_names_and_ids()
    deck_name = next((name for name, id in decks.items() if id == deck_id), None)

    if not deck_name:
        raise HTTPException(404, "Deck not found")

    card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
    if not card_ids:
        return {"total_cards": 0, "cards_with_issues": 0, "issues": []}

    card_ids.sort()
    cards_info = await anki_service.get_cards_info(card_ids)

    # Fields to check (exclude Audio which has special format)
    check_fields = ['Word', 'Pinyin', 'Sino', 'Definition', 'Tip', 'Example']

    cards_with_issues = []
    for card in cards_info:
        card_issues = []
        for field_name in check_fields:
            field_value = card["fields"].get(field_name, {}).get("value", "")
            issues = scan_field_issues(field_name, field_value)
            card_issues.extend(issues)

        if card_issues:
            cards_with_issues.append({
                "note_id": card["note"],
                "card_id": card["cardId"],
                "word": card["fields"].get("Word", {}).get("value", ""),
                "pinyin": card["fields"].get("Pinyin", {}).get("value", ""),
                "issues": card_issues
            })

    return {
        "total_cards": len(cards_info),
        "cards_with_issues": len(cards_with_issues),
        "issues": cards_with_issues
    }


@router.post("/decks/{deck_id}/fix")
async def fix_deck_fields(deck_id: int):
    """Fix all field issues in deck by cleaning problematic characters."""
    decks = await anki_service.get_deck_names_and_ids()
    deck_name = next((name for name, id in decks.items() if id == deck_id), None)

    if not deck_name:
        raise HTTPException(404, "Deck not found")

    card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
    if not card_ids:
        return {"fixed_cards": 0, "total_fields_fixed": 0}

    card_ids.sort()
    cards_info = await anki_service.get_cards_info(card_ids)

    check_fields = ['Word', 'Pinyin', 'Sino', 'Definition', 'Tip', 'Example']

    fixed_cards = 0
    total_fields_fixed = 0

    for card in cards_info:
        updates = {}
        for field_name in check_fields:
            original = card["fields"].get(field_name, {}).get("value", "")
            cleaned = clean_field(original)
            if cleaned != original:
                updates[field_name] = cleaned
                total_fields_fixed += 1

        if updates:
            await anki_service.update_note_fields(card["note"], updates)
            fixed_cards += 1

    return {
        "fixed_cards": fixed_cards,
        "total_fields_fixed": total_fields_fixed
    }


@router.get("/cards/{note_id}/preview")
async def preview_card_fix(note_id: int):
    """Preview what fields would look like after cleaning."""
    notes_info = await anki_service.get_notes_info([note_id])
    if not notes_info:
        raise HTTPException(404, "Note not found")

    note = notes_info[0]
    check_fields = ['Word', 'Pinyin', 'Sino', 'Definition', 'Tip', 'Example']

    changes = []
    for field_name in check_fields:
        original = note["fields"].get(field_name, {}).get("value", "")
        cleaned = clean_field(original)
        if cleaned != original:
            changes.append({
                "field": field_name,
                "original": original,
                "cleaned": cleaned
            })

    return {
        "note_id": note_id,
        "word": note["fields"].get("Word", {}).get("value", ""),
        "has_changes": len(changes) > 0,
        "changes": changes
    }


@router.get("/notes/{note_id}")
async def get_note(note_id: int):
    """Get full note data by note_id"""
    notes_info = await anki_service.get_notes_info([note_id])
    if not notes_info:
        raise HTTPException(404, "Note not found")
    note = notes_info[0]
    return {
        "note_id": note_id,
        "fields": note["fields"],
        "tags": note.get("tags", [])
    }


@router.post("/cards/{note_id}/fix")
async def fix_card_fields(note_id: int):
    """Fix field issues for a single card."""
    notes_info = await anki_service.get_notes_info([note_id])
    if not notes_info:
        raise HTTPException(404, "Note not found")

    note = notes_info[0]
    check_fields = ['Word', 'Pinyin', 'Sino', 'Definition', 'Tip', 'Example']

    updates = {}
    for field_name in check_fields:
        original = note["fields"].get(field_name, {}).get("value", "")
        cleaned = clean_field(original)
        if cleaned != original:
            updates[field_name] = cleaned

    if updates:
        await anki_service.update_note_fields(note_id, updates)

    return {
        "fixed": bool(updates),
        "fields_fixed": list(updates.keys())
    }


@router.get("/cards/search")
async def search_cards(
    query: str,
    deck_ids: Optional[str] = None,
    fields: Optional[str] = None,
    limit: int = 50
):
    """
    Search cards across decks and fields.

    Args:
        query: Search text (searches in selected fields)
        deck_ids: Comma-separated deck IDs to search in (empty = all decks)
        fields: Comma-separated field names to search (Word,Pinyin,Definition,Example,Sino,Simplified)
        limit: Max results to return (default 50)
    """
    from app.utils.html_cleaner import strip_html_tags

    if not query or len(query.strip()) < 1:
        return {"results": [], "total": 0}

    clean_query = query.strip()

    # Parse deck IDs
    target_deck_ids = []
    if deck_ids:
        target_deck_ids = [int(d) for d in deck_ids.split(",") if d.strip()]

    # Parse fields to search
    searchable_fields = ['Word', 'Pinyin', 'Definition', 'Example', 'Sino', 'Simplified']
    if fields:
        requested_fields = [f.strip() for f in fields.split(",")]
        searchable_fields = [f for f in requested_fields if f in searchable_fields]

    if not searchable_fields:
        searchable_fields = ['Word', 'Pinyin', 'Definition']

    # Get all decks
    all_decks = await anki_service.get_deck_names_and_ids()

    # Filter to Chinese decks and target deck IDs
    deck_map = {}
    for name, did in all_decks.items():
        if not name.startswith("Chinese"):
            continue
        if target_deck_ids and did not in target_deck_ids:
            continue
        deck_map[did] = name

    if not deck_map:
        return {"results": [], "total": 0}

    # Build Anki search queries for each field
    results = []
    seen_note_ids = set()

    for field_name in searchable_fields:
        # Anki search syntax: field:value
        anki_query = f'{field_name}:*{clean_query}*'

        # If filtering by decks, add deck filter
        if target_deck_ids:
            deck_queries = [f'deck:"{deck_map[did]}"' for did in target_deck_ids if did in deck_map]
            if deck_queries:
                anki_query = f'({" OR ".join(deck_queries)}) {anki_query}'

        try:
            card_ids = await anki_service.find_cards(anki_query)
            if not card_ids:
                continue

            cards_info = await anki_service.get_cards_info(card_ids[:100])

            for card in cards_info:
                note_id = card["note"]
                if note_id in seen_note_ids:
                    continue

                # Check if this card's deck is in our filter
                card_deck_name = card["deckName"]
                if not card_deck_name.startswith("Chinese"):
                    continue

                # Get the deck ID from all_decks (dict is {name: deck_id})
                card_deck_id = next((did for name, did in all_decks.items() if name == card_deck_name), None)
                if not card_deck_id:
                    # Skip cards where we can't find the deck ID
                    continue

                # If filtering by deck IDs, check if this card's deck is in the filter
                if target_deck_ids and card_deck_id not in target_deck_ids:
                    continue

                seen_note_ids.add(note_id)

                # Find which field matched
                matched_field = field_name
                matched_value = strip_html_tags(card["fields"].get(field_name, {}).get("value", ""))

                audio_field = card["fields"].get("Audio", {}).get("value", "")
                audio_file = extract_audio_from_field(audio_field)

                results.append({
                    "note_id": note_id,
                    "card_id": card["cardId"],
                    "deck_id": card_deck_id,
                    "deck_name": card_deck_name,
                    "word": strip_html_tags(card["fields"].get("Word", {}).get("value", "")),
                    "pinyin": strip_html_tags(card["fields"].get("Pinyin", {}).get("value", "")),
                    "definition": strip_html_tags(card["fields"].get("Definition", {}).get("value", ""))[:100],
                    "matched_field": matched_field,
                    "matched_value": matched_value[:100] if len(matched_value) > 100 else matched_value,
                    "has_audio": bool(audio_file),
                })

                if len(results) >= limit:
                    break

        except Exception as e:
            print(f"Search error for field {field_name}: {e}")
            continue

        if len(results) >= limit:
            break

    return {
        "results": results[:limit],
        "total": len(results),
        "query": clean_query,
        "fields_searched": searchable_fields
    }
