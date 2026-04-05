"""
Examples field format validator.
Validates that examples follow the required format:
- Must have exactly 2 examples
- Each example has 4 lines: Chinese, Pinyin, Sino-Vietnamese, Vietnamese
"""
import re
from typing import Tuple, List
from html import unescape


def strip_html_to_lines(text: str) -> List[str]:
    """
    Convert HTML to a list of content lines.
    Each <p> or text content becomes a line.
    """
    # First, split by the common separator pattern
    # Split on <br/><hr/><br/> or similar patterns
    text = re.sub(r'<br\s*/?>\s*<hr\s*/?>\s*<br\s*/?>', '\n===SEPARATOR===\n', text, flags=re.IGNORECASE)

    # Replace <p>...</p> with the content + newline
    text = re.sub(r'<p[^>]*>(.*?)</p>', r'\1\n', text, flags=re.IGNORECASE | re.DOTALL)

    # Replace remaining <br> tags with newlines
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)

    # Remove <strong>, <em>, etc. but keep content
    text = re.sub(r'</?(?:strong|b|em|i|span)[^>]*>', '', text, flags=re.IGNORECASE)

    # Remove any remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)

    # Decode HTML entities
    text = unescape(text)

    # Split into lines and clean up
    lines = [l.strip() for l in text.split('\n') if l.strip()]

    return lines


def contains_chinese(text: str) -> bool:
    """Check if text contains Chinese characters"""
    return bool(re.search(r'[\u4e00-\u9fff]', text))


def contains_pinyin_tones(text: str) -> bool:
    """Check if text contains pinyin tone marks"""
    tone_chars = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ'
    return any(c in text for c in tone_chars)


def is_valid_examples_format(examples_value: str) -> Tuple[bool, List[str]]:
    """
    Check if examples field follows the required format.

    Required format for EACH example (must have exactly 2 examples):
    1. Chinese sentence (with Chinese characters)
    2. Pinyin with tone marks
    3. Sino-Vietnamese (Han-Viet)
    4. Vietnamese translation

    Examples are separated by blank lines or <hr/> tags.

    Returns:
        Tuple of (is_valid, list_of_issues)
    """
    issues = []

    if not examples_value or not examples_value.strip():
        return False, ["Empty examples field"]

    # Convert HTML to lines
    lines = strip_html_to_lines(examples_value)

    # Filter out separator markers
    content_lines = []
    example_breaks = []
    for i, line in enumerate(lines):
        if line == '===SEPARATOR===':
            example_breaks.append(len(content_lines))
        else:
            content_lines.append(line)

    if len(content_lines) == 0:
        return False, ["No content found in examples field"]

    # Determine example blocks
    # If we have separator, use it. Otherwise try to split by 4 lines each
    if example_breaks:
        # Split at the separator
        blocks = []
        start = 0
        for break_point in example_breaks:
            if break_point > start:
                blocks.append(content_lines[start:break_point])
            start = break_point
        if start < len(content_lines):
            blocks.append(content_lines[start:])
    else:
        # Try to group by 4 lines per example
        if len(content_lines) >= 8:
            blocks = [content_lines[0:4], content_lines[4:8]]
        elif len(content_lines) >= 4:
            blocks = [content_lines[0:4]]
            if len(content_lines) > 4:
                blocks.append(content_lines[4:])
        else:
            blocks = [content_lines]

    # Filter out empty blocks
    blocks = [b for b in blocks if b]

    if len(blocks) == 0:
        return False, ["No examples found"]

    if len(blocks) < 2:
        issues.append(f"Only {len(blocks)} example(s) found, need exactly 2")
    elif len(blocks) > 2:
        issues.append(f"Found {len(blocks)} blocks, expected exactly 2 examples")

    # Validate each block (up to 2)
    for i, block_lines in enumerate(blocks[:2], 1):
        if len(block_lines) == 0:
            issues.append(f"Example {i}: Empty block")
            continue

        if len(block_lines) < 4:
            issues.append(f"Example {i}: Only {len(block_lines)} lines, need 4 (Chinese, Pinyin, Sino, Vietnamese)")
            continue
        elif len(block_lines) > 4:
            issues.append(f"Example {i}: Has {len(block_lines)} lines, expected 4")

        # Validate line 1: Should contain Chinese characters
        if not contains_chinese(block_lines[0]):
            issues.append(f"Example {i}: Line 1 should be Chinese sentence (no Chinese chars found)")

        # Validate line 2: Should contain pinyin tone marks
        if len(block_lines) >= 2 and not contains_pinyin_tones(block_lines[1]):
            issues.append(f"Example {i}: Line 2 should be Pinyin with tone marks")

        # Validate line 4: Vietnamese should not have Chinese
        if len(block_lines) >= 4:
            if contains_chinese(block_lines[3]):
                issues.append(f"Example {i}: Line 4 (Vietnamese) should not contain Chinese characters")

    return len(issues) == 0, issues


def should_regenerate_examples(examples_value: str) -> Tuple[bool, str]:
    """
    Determine if examples field should be regenerated.

    Returns:
        Tuple of (should_regenerate, reason)
    """
    if not examples_value or not examples_value.strip():
        return True, "Empty examples field"

    is_valid, issues = is_valid_examples_format(examples_value)

    if not is_valid:
        return True, "; ".join(issues)

    return False, ""
