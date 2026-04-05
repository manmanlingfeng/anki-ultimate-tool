import re
from typing import Optional

def parse_deck_name(deck_name: str) -> Optional[dict]:
    """
    Parse deck name into components.
    Input: "Chinese::Chinese Word::Chinese Word - Simplified::Chinese Word - Simplified - II::Part 0"
    Output: {type: "chinese_word", variant: "simplified", roman: "II", part: 0}
    """
    parts = deck_name.split("::")
    if len(parts) < 5:
        return None

    type_name = parts[1].lower().replace(" ", "_")
    variant = parts[2].split(" - ")[-1].lower()
    roman = parts[3].split(" - ")[-1]
    part_num = int(parts[4].split(" ")[-1])

    return {
        "type": type_name,
        "variant": variant,
        "roman": roman,
        "part": part_num
    }

def generate_audio_filename(deck_name: str, index: int) -> str:
    """
    Generate audio filename for card.
    Output: chinese_word_simplified_II_part_0_00.mp3
    """
    parsed = parse_deck_name(deck_name)
    if not parsed:
        raise ValueError(f"Cannot parse deck name: {deck_name}")

    return f"{parsed['type']}_{parsed['variant']}_{parsed['roman']}_part_{parsed['part']}_{index:02d}.mp3"

def parse_audio_filename(filename: str) -> Optional[dict]:
    """
    Parse audio filename to extract components.
    Input: chinese_word_simplified_II_part_0_11.mp3
    Output: {type: "chinese_word", variant: "simplified", roman: "II", part: 0, index: 11}
    """
    pattern = r"^(.+)_(.+)_([IVX]+)_part_(\d+)_(\d+)\.mp3$"
    match = re.match(pattern, filename)
    if not match:
        return None

    return {
        "type": match.group(1),
        "variant": match.group(2),
        "roman": match.group(3),
        "part": int(match.group(4)),
        "index": int(match.group(5))
    }

def extract_audio_from_field(audio_field: str) -> Optional[str]:
    """
    Extract filename from Anki audio field.
    Input: "[sound:chinese_word_simplified_II_part_0_11.mp3]"
    Output: "chinese_word_simplified_II_part_0_11.mp3"
    """
    match = re.search(r"\[sound:(.+?)\]", audio_field)
    return match.group(1) if match else None

def generate_audio_pattern(deck_name: str) -> Optional[str]:
    """
    Generate glob pattern for audio files in a deck.
    Output: chinese_word_simplified_II_part_0_*.mp3
    """
    parsed = parse_deck_name(deck_name)
    if not parsed:
        return None

    return f"{parsed['type']}_{parsed['variant']}_{parsed['roman']}_part_{parsed['part']}_*.mp3"

def extract_index_from_audio(filename: str) -> Optional[int]:
    """
    Extract card index from audio filename.
    Input: chinese_word_simplified_II_part_0_11.mp3
    Output: 11
    """
    parsed = parse_audio_filename(filename)
    return parsed["index"] if parsed else None
