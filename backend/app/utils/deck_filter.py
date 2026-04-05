"""
Deck filtering utilities for scan mode selection.
"""
from typing import Optional


def filter_decks_by_mode(
    deck_id: Optional[int],
    mode: str,
    all_decks: dict[str, int]
) -> dict[str, int]:
    """
    Filter decks based on selection mode.

    Args:
        deck_id: Selected deck ID (None for "all" mode)
        mode: "all", "deck", "with_children", or "children_only"
        all_decks: Dict of all deck names to IDs

    Returns:
        Filtered dict of deck names to IDs (only leaf/Part decks)
    """
    if mode == "all" or (not deck_id and mode != "deck"):
        # Current behavior - scan all Part decks
        part_decks = {name: did for name, did in all_decks.items()
                      if "::Part" in name or name.endswith("Part")}
        # Fallback: if no Part decks, use all decks starting with Chinese
        if not part_decks:
            part_decks = {name: did for name, did in all_decks.items()
                          if name.startswith("Chinese")}
        return part_decks

    # Find selected deck's full name
    selected_name = next((n for n, d in all_decks.items() if d == deck_id), None)
    if not selected_name:
        return {}

    prefix = selected_name + "::"
    result = {}

    for name, did in all_decks.items():
        is_selected = (name == selected_name)
        is_child = name.startswith(prefix)
        is_leaf = "::Part" in name or name.endswith("Part")

        # For non-leaf decks, only include if they have cards directly
        if mode == "deck":
            # Only the selected deck itself (no children)
            if is_selected:
                result[name] = did
        elif mode == "with_children":
            if (is_selected or is_child) and (is_leaf or is_selected):
                result[name] = did
        elif mode == "children_only":
            if is_child and is_leaf:
                result[name] = did

    return result
