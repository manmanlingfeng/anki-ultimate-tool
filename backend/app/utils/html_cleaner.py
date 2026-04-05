"""HTML cleaning utilities for text processing."""
import re
from html import unescape


def strip_html_tags(text: str) -> str:
    """
    Remove all HTML tags from text, keeping only the content.
    Also decodes HTML entities.
    """
    if not text:
        return ""

    # Remove HTML tags
    clean = re.sub(r'<[^>]+>', '', text)

    # Decode HTML entities
    clean = unescape(clean)

    return clean.strip()
