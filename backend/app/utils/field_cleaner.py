"""
Field cleaner utility for detecting and fixing problematic characters in card fields.

Note: Anki supports HTML formatting, so tags like <b>, <i>, <ul>, <li>, <br> etc.
are VALID and should NOT be flagged as issues when used properly.

Detected issues:
- &nbsp; entities (should be regular space)
- Unicode non-breaking spaces
- Multiple consecutive spaces
- Leading/trailing whitespace
- Zero-width invisible characters
- Trailing <br> tags (no content after)
- Leading <br> tags (no content before)
- Excessive <br> tags (3+ consecutive)
- Empty tags (<b></b>, <i></i>, etc.)
- Whitespace-only tags (<b> </b>)
- &nbsp; + <br> combinations
- <br> before closing block tag (<div>text<br></div>)
- Block tags containing only <br> (<div><br></div>)
- Nested empty block tags (<div><div></div></div>)
- Deeply nested wrappers (<div><div><div>text</div></div></div>)
- Redundant nested tags (<b><b>text</b></b>)
- Empty style/class attributes (<span class="">text</span>)
- Unnecessary wrapper chain (block only contains another block)
"""
import re
from typing import TypedDict

# Patterns for different issue types
PATTERNS = {
    # Space-related
    'nbsp_entity': re.compile(r'&nbsp;|&#160;|&#xa0;', re.IGNORECASE),
    'multiple_spaces': re.compile(r'  +'),
    'zero_width': re.compile(r'[\u200b\u200c\u200d\ufeff]'),
    'unicode_nbsp': re.compile(r'[\u00a0]'),
    'other_unicode_space': re.compile(r'[\u2000-\u200a\u202f\u205f\u3000]'),

    # HTML-related
    'br_tag': re.compile(r'<br\s*/?\s*>', re.IGNORECASE),
    'trailing_br': re.compile(r'(<br\s*/?\s*>)+\s*$', re.IGNORECASE),
    'leading_br': re.compile(r'^\s*(<br\s*/?\s*>)+', re.IGNORECASE),
    'excessive_br': re.compile(r'(<br\s*/?\s*>\s*){3,}', re.IGNORECASE),
    'empty_tag': re.compile(r'<(b|i|u|s|strong|em|span|div|p)>\s*</\1>', re.IGNORECASE),
    'whitespace_only_tag': re.compile(r'<(b|i|u|s|strong|em|span)>(\s|&nbsp;|&#160;)+</\1>', re.IGNORECASE),
    'nbsp_br_combo': re.compile(r'(&nbsp;|&#160;|&#xa0;)\s*<br\s*/?\s*>|<br\s*/?\s*>\s*(&nbsp;|&#160;|&#xa0;)', re.IGNORECASE),
    'empty_li': re.compile(r'<li>\s*</li>', re.IGNORECASE),
    # <br> before closing block tag: <div>text<br></div> -> <div>text</div>
    'br_before_close': re.compile(r'(<br\s*/?\s*>)+\s*</(div|p|span|li|td|th)>', re.IGNORECASE),
    # Block tag containing only <br>: <div><br></div> -> empty
    'br_only_block': re.compile(r'<(div|p|span)>\s*(<br\s*/?\s*>\s*)+</(div|p|span)>', re.IGNORECASE),
    # Meaningless single wrapper: <div>plain text</div> -> plain text (entire field, no nested HTML)
    'meaningless_wrapper': re.compile(r'^<(div|p|span)>([^<>]+)</\1>$', re.IGNORECASE),

    # === NEW: Deeply nested and redundant wrappers ===

    # Deeply nested identical tags: <div><div><div>X</div></div></div>
    # Match 2+ levels of same tag wrapping content
    'deeply_nested_same': re.compile(
        r'<(div|span|p)>\s*<\1>\s*(?:<\1>\s*)*(.+?)(?:\s*</\1>)+\s*</\1>\s*</\1>',
        re.IGNORECASE | re.DOTALL
    ),

    # Redundant nested identical inline tags: <b><b>text</b></b>, <i><i>text</i></i>
    'redundant_inline': re.compile(
        r'<(b|i|u|s|strong|em)>\s*<\1>(.+?)</\1>\s*</\1>',
        re.IGNORECASE | re.DOTALL
    ),

    # Block containing only another block: <div><span>text</span></div>
    # Only flag if no other content besides the inner block
    'wrapper_chain': re.compile(
        r'<(div|p)>\s*<(div|p|span)>(.+?)</\2>\s*</\1>',
        re.IGNORECASE | re.DOTALL
    ),

    # Empty attributes: class="", style="", id=""
    'empty_attribute': re.compile(
        r'\s+(class|style|id|href|src|alt|title)=(["\'])\2',
        re.IGNORECASE
    ),

    # Nested empty blocks: <div><div></div></div> or <div><span></span></div>
    'nested_empty_block': re.compile(
        r'<(div|p|span)>\s*<(div|p|span)>\s*</\2>\s*</\1>',
        re.IGNORECASE
    ),

    # Full field wrapped in multiple layers: entire content is just nested divs
    'full_nested_wrapper': re.compile(
        r'^(<(div|span|p)>\s*)+([^<]+|<(?!/?(?:div|span|p))[^>]*>[^<]*</[^>]+>)(</(?:div|span|p)>\s*)+$',
        re.IGNORECASE
    ),
}


class FieldIssue(TypedDict):
    field_name: str
    issue_type: str
    original: str
    position: int
    context: str


class CardIssue(TypedDict):
    note_id: int
    card_id: int
    word: str
    issues: list[FieldIssue]


def count_wrapper_depth(value: str) -> int:
    """
    Count how many levels of wrapper tags surround the actual content.

    Examples:
    - "<div>text</div>" -> 1
    - "<div><div>text</div></div>" -> 2
    - "<div><div><div>喚</div></div></div>" -> 3
    - "<div>text<span>more</span></div>" -> 0 (has sibling content)
    - "plain text" -> 0

    Returns the depth of unnecessary nesting (0 = no issue, 2+ = problem).
    """
    if not value or not value.strip():
        return 0

    # Pattern to match opening and closing block/span tags
    open_tag = re.compile(r'^(\s*)<(div|span|p)(\s+[^>]*)?>(.*)$', re.IGNORECASE | re.DOTALL)
    close_tag = re.compile(r'^(.*)</(div|span|p)>(\s*)$', re.IGNORECASE | re.DOTALL)

    depth = 0
    current = value.strip()

    while True:
        # Try to match opening tag at start
        open_match = open_tag.match(current)
        if not open_match:
            break

        tag_name = open_match.group(2).lower()
        inner = open_match.group(4)

        # Try to match corresponding closing tag at end
        close_match = close_tag.match(inner)
        if not close_match:
            break

        close_tag_name = close_match.group(2).lower()
        if close_tag_name != tag_name:
            break

        # Check if the inner content is just another wrapper or actual content
        inner_content = close_match.group(1).strip()

        # If inner content has other HTML siblings, stop (not a pure wrapper)
        # Count opening and closing tags for this tag type in inner content
        inner_opens = len(re.findall(rf'<{tag_name}[\s>]', inner_content, re.IGNORECASE))
        inner_closes = len(re.findall(rf'</{tag_name}>', inner_content, re.IGNORECASE))

        if inner_opens != inner_closes:
            break

        depth += 1
        current = inner_content

        # Safety limit
        if depth > 10:
            break

    return depth


def unwrap_nested_tags(value: str) -> str:
    """
    Remove unnecessary wrapper layers from content.

    "<div><div><div>喚</div></div></div>" -> "喚"
    """
    if not value:
        return value

    result = value.strip()
    max_iterations = 10

    for _ in range(max_iterations):
        # Try to unwrap one layer
        match = re.match(
            r'^<(div|span|p)(\s+[^>]*)?>\s*(.*?)\s*</\1>$',
            result,
            re.IGNORECASE | re.DOTALL
        )
        if not match:
            break

        inner = match.group(3).strip()

        # Check if inner still looks like a wrapper or has actual content structure
        # If inner is just text or another single wrapper, unwrap
        if inner and not re.match(r'^<(div|span|p)[\s>]', inner, re.IGNORECASE):
            # Inner is not a wrapper, check if we should keep this layer
            # Keep if inner contains meaningful HTML (lists, formatting, etc.)
            if re.search(r'<(ul|ol|li|table|tr|td|img|a|br)\b', inner, re.IGNORECASE):
                break
            # Otherwise unwrap
            result = inner
            break
        else:
            result = inner

    return result


def scan_field_issues(field_name: str, value: str) -> list[FieldIssue]:
    """Scan a single field for issues and return list of found issues."""
    issues: list[FieldIssue] = []

    if not value:
        return issues

    # === Space-related issues ===

    # Check for &nbsp; entities
    for match in PATTERNS['nbsp_entity'].finditer(value):
        # Skip if part of nbsp+br combo (will be caught separately)
        if PATTERNS['nbsp_br_combo'].search(value[max(0, match.start()-10):match.end()+10]):
            continue
        start = max(0, match.start() - 10)
        end = min(len(value), match.end() + 10)
        issues.append({
            'field_name': field_name,
            'issue_type': 'nbsp_entity',
            'original': match.group(),
            'position': match.start(),
            'context': value[start:end]
        })

    # Check for unicode non-breaking space (U+00A0)
    for match in PATTERNS['unicode_nbsp'].finditer(value):
        start = max(0, match.start() - 10)
        end = min(len(value), match.end() + 10)
        issues.append({
            'field_name': field_name,
            'issue_type': 'unicode_nbsp',
            'original': 'U+00A0',
            'position': match.start(),
            'context': value[start:end]
        })

    # Check for other weird unicode spaces
    for match in PATTERNS['other_unicode_space'].finditer(value):
        char = match.group()
        start = max(0, match.start() - 10)
        end = min(len(value), match.end() + 10)
        issues.append({
            'field_name': field_name,
            'issue_type': 'unicode_space',
            'original': f'U+{ord(char):04X}',
            'position': match.start(),
            'context': value[start:end]
        })

    # Check for multiple consecutive spaces
    for match in PATTERNS['multiple_spaces'].finditer(value):
        start = max(0, match.start() - 5)
        end = min(len(value), match.end() + 5)
        issues.append({
            'field_name': field_name,
            'issue_type': 'multiple_spaces',
            'original': f'{len(match.group())} spaces',
            'position': match.start(),
            'context': repr(value[start:end])
        })

    # Check for zero-width characters
    for match in PATTERNS['zero_width'].finditer(value):
        start = max(0, match.start() - 5)
        end = min(len(value), match.end() + 5)
        issues.append({
            'field_name': field_name,
            'issue_type': 'zero_width',
            'original': f'U+{ord(match.group()):04X}',
            'position': match.start(),
            'context': f'...{value[start:end]}...'
        })

    # Check for leading/trailing whitespace (text only, not HTML)
    stripped = value.strip()
    if value != stripped:
        leading = len(value) - len(value.lstrip())
        trailing = len(value) - len(value.rstrip())
        if leading > 0:
            issues.append({
                'field_name': field_name,
                'issue_type': 'leading_whitespace',
                'original': f'{leading} chars',
                'position': 0,
                'context': repr(value[:min(20, len(value))])
            })
        if trailing > 0:
            issues.append({
                'field_name': field_name,
                'issue_type': 'trailing_whitespace',
                'original': f'{trailing} chars',
                'position': len(value) - trailing,
                'context': repr(value[max(0, len(value)-20):])
            })

    # === HTML-related issues ===

    # Check for trailing <br> tags
    match = PATTERNS['trailing_br'].search(value)
    if match:
        issues.append({
            'field_name': field_name,
            'issue_type': 'trailing_br',
            'original': match.group().strip(),
            'position': match.start(),
            'context': value[max(0, match.start()-15):]
        })

    # Check for leading <br> tags
    match = PATTERNS['leading_br'].search(value)
    if match:
        issues.append({
            'field_name': field_name,
            'issue_type': 'leading_br',
            'original': match.group().strip(),
            'position': 0,
            'context': value[:min(30, len(value))]
        })

    # Check for excessive <br> tags (3+)
    for match in PATTERNS['excessive_br'].finditer(value):
        # Don't double-report if it's trailing/leading
        if match.end() == len(value) or match.start() == 0:
            continue
        br_count = len(PATTERNS['br_tag'].findall(match.group()))
        issues.append({
            'field_name': field_name,
            'issue_type': 'excessive_br',
            'original': f'{br_count} consecutive <br>',
            'position': match.start(),
            'context': value[max(0, match.start()-10):min(len(value), match.end()+10)]
        })

    # Check for empty tags
    for match in PATTERNS['empty_tag'].finditer(value):
        issues.append({
            'field_name': field_name,
            'issue_type': 'empty_tag',
            'original': match.group(),
            'position': match.start(),
            'context': value[max(0, match.start()-10):min(len(value), match.end()+10)]
        })

    # Check for whitespace-only tags
    for match in PATTERNS['whitespace_only_tag'].finditer(value):
        issues.append({
            'field_name': field_name,
            'issue_type': 'whitespace_tag',
            'original': match.group(),
            'position': match.start(),
            'context': value[max(0, match.start()-10):min(len(value), match.end()+10)]
        })

    # Check for &nbsp; + <br> combinations
    for match in PATTERNS['nbsp_br_combo'].finditer(value):
        issues.append({
            'field_name': field_name,
            'issue_type': 'nbsp_br_combo',
            'original': match.group(),
            'position': match.start(),
            'context': value[max(0, match.start()-10):min(len(value), match.end()+10)]
        })

    # Check for empty <li> tags
    for match in PATTERNS['empty_li'].finditer(value):
        issues.append({
            'field_name': field_name,
            'issue_type': 'empty_li',
            'original': match.group(),
            'position': match.start(),
            'context': value[max(0, match.start()-10):min(len(value), match.end()+10)]
        })

    # Check for <br> before closing block tag
    for match in PATTERNS['br_before_close'].finditer(value):
        issues.append({
            'field_name': field_name,
            'issue_type': 'br_before_close',
            'original': match.group(),
            'position': match.start(),
            'context': value[max(0, match.start()-15):min(len(value), match.end()+5)]
        })

    # Check for block tags containing only <br>
    for match in PATTERNS['br_only_block'].finditer(value):
        issues.append({
            'field_name': field_name,
            'issue_type': 'br_only_block',
            'original': match.group(),
            'position': match.start(),
            'context': value[max(0, match.start()-10):min(len(value), match.end()+10)]
        })

    # === NEW: Check for deeply nested and redundant wrappers ===

    # Check for deeply nested same tags: <div><div><div>X</div></div></div>
    nesting_depth = count_wrapper_depth(value)
    if nesting_depth >= 2:
        issues.append({
            'field_name': field_name,
            'issue_type': 'deeply_nested',
            'original': f'{nesting_depth} levels deep',
            'position': 0,
            'context': value[:min(60, len(value))]
        })

    # Check for redundant inline tags: <b><b>text</b></b>
    for match in PATTERNS['redundant_inline'].finditer(value):
        issues.append({
            'field_name': field_name,
            'issue_type': 'redundant_inline',
            'original': match.group(),
            'position': match.start(),
            'context': value[max(0, match.start()-5):min(len(value), match.end()+5)]
        })

    # Check for empty attributes: class="", style=""
    for match in PATTERNS['empty_attribute'].finditer(value):
        issues.append({
            'field_name': field_name,
            'issue_type': 'empty_attribute',
            'original': match.group().strip(),
            'position': match.start(),
            'context': value[max(0, match.start()-10):min(len(value), match.end()+10)]
        })

    # Check for nested empty blocks: <div><div></div></div>
    for match in PATTERNS['nested_empty_block'].finditer(value):
        issues.append({
            'field_name': field_name,
            'issue_type': 'nested_empty_block',
            'original': match.group(),
            'position': match.start(),
            'context': value[max(0, match.start()-5):min(len(value), match.end()+5)]
        })

    return issues


def clean_field(value: str) -> str:
    """Clean a field value by fixing all detected issues.

    HTML tags are preserved when used properly.
    Only problematic patterns are cleaned.
    Runs iteratively until no more changes (handles nested empty tags).
    """
    if not value:
        return value

    result = value
    max_iterations = 10  # Prevent infinite loops

    for _ in range(max_iterations):
        prev = result

        # === HTML cleaning (do first before space cleaning) ===

        # Remove <br> before closing block tags: <div>text<br></div> -> <div>text</div>
        result = PATTERNS['br_before_close'].sub(r'</\2>', result)

        # Remove block tags containing only <br>: <div><br></div> -> empty
        result = PATTERNS['br_only_block'].sub('', result)

        # Remove trailing <br> tags
        result = PATTERNS['trailing_br'].sub('', result)

        # Remove leading <br> tags
        result = PATTERNS['leading_br'].sub('', result)

        # Reduce excessive <br> (3+) to double <br>
        result = PATTERNS['excessive_br'].sub('<br><br>', result)

        # Remove empty tags (run multiple times per iteration for nested)
        result = PATTERNS['empty_tag'].sub('', result)

        # Remove whitespace-only tags
        result = PATTERNS['whitespace_only_tag'].sub(' ', result)

        # Clean &nbsp; + <br> combos (replace with just <br>)
        result = PATTERNS['nbsp_br_combo'].sub('<br>', result)

        # Remove empty <li> tags
        result = PATTERNS['empty_li'].sub('', result)

        # === NEW: Clean deeply nested and redundant wrappers ===

        # Remove redundant inline tags: <b><b>text</b></b> -> <b>text</b>
        result = PATTERNS['redundant_inline'].sub(r'<\1>\2</\1>', result)

        # Remove nested empty blocks: <div><div></div></div> -> empty
        result = PATTERNS['nested_empty_block'].sub('', result)

        # Remove empty attributes: class="" style=""
        result = PATTERNS['empty_attribute'].sub('', result)

        # If no changes this iteration, we're done
        if result == prev:
            break

    # === Unwrap deeply nested wrappers (after iteration loop) ===
    # This handles: <div><div><div>喚</div></div></div> -> 喚
    if count_wrapper_depth(result) >= 2:
        result = unwrap_nested_tags(result)

    # === Space cleaning (only once after HTML is clean) ===

    # Replace &nbsp; entities with regular space
    result = PATTERNS['nbsp_entity'].sub(' ', result)

    # Replace unicode non-breaking space with regular space
    result = PATTERNS['unicode_nbsp'].sub(' ', result)

    # Replace other weird unicode spaces with regular space
    result = PATTERNS['other_unicode_space'].sub(' ', result)

    # Remove zero-width characters
    result = PATTERNS['zero_width'].sub('', result)

    # Replace multiple spaces with single space
    result = PATTERNS['multiple_spaces'].sub(' ', result)

    # Strip leading/trailing whitespace
    result = result.strip()

    # Unwrap meaningless single wrapper: <div>plain text</div> -> plain text
    match = PATTERNS['meaningless_wrapper'].match(result)
    if match:
        result = match.group(2).strip()

    return result


def get_issue_description(issue_type: str) -> str:
    """Get human-readable description for issue type."""
    descriptions = {
        # Space-related
        'nbsp_entity': 'Non-breaking space entity (&nbsp;)',
        'unicode_nbsp': 'Unicode non-breaking space (U+00A0)',
        'unicode_space': 'Non-standard unicode space',
        'multiple_spaces': 'Multiple consecutive spaces',
        'zero_width': 'Zero-width invisible character',
        'leading_whitespace': 'Leading whitespace',
        'trailing_whitespace': 'Trailing whitespace',
        # HTML-related
        'trailing_br': 'Trailing <br> tag (nothing after)',
        'leading_br': 'Leading <br> tag (nothing before)',
        'excessive_br': 'Too many consecutive <br> tags',
        'empty_tag': 'Empty formatting tag',
        'whitespace_tag': 'Tag containing only whitespace',
        'nbsp_br_combo': 'Unnecessary &nbsp; with <br>',
        'empty_li': 'Empty list item',
        'br_before_close': '<br> before closing tag',
        'br_only_block': 'Block with only <br>',
        # Nested/wrapper issues
        'deeply_nested': 'Deeply nested wrapper tags',
        'redundant_inline': 'Redundant nested inline tags',
        'empty_attribute': 'Empty HTML attribute',
        'nested_empty_block': 'Nested empty block tags',
    }
    return descriptions.get(issue_type, issue_type)
