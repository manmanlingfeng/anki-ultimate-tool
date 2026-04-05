"""
AI prompts for field generation.
Prompts for: Pinyin, Sino-Vietnamese, Definition, Examples, Simplified.
"""

SINO_PROMPT = """Generate the Sino-Vietnamese (Han-Viet) reading for this Chinese word.

Word: {word}
Pinyin: {pinyin}

Return JSON only:
{{
  "sino": "hàn việt reading with tone marks",
  "confidence": 0.9
}}

Rules:
- Use standard Han-Viet pronunciations
- Separate each character with space
- Include Vietnamese tone marks
- If polyphonic, provide the most common reading"""

DEFINITION_PROMPT = """Provide a Vietnamese definition for this Chinese word.

Word: {word}
Pinyin: {pinyin}

Return JSON only:
{{
  "definition": "Vietnamese definition",
  "confidence": 0.9
}}

Rules:
- Keep definition concise (1-2 sentences)
- Use natural Vietnamese
- Include common usage context if helpful
- Target vocabulary learning context"""

SIMPLIFIED_PROMPT = """Convert this Traditional Chinese to Simplified Chinese.

Traditional: {word}

Return JSON only:
{{
  "simplified": "简体字",
  "is_same": false
}}

Note: Return is_same=true if already simplified or no conversion needed."""

PINYIN_PROMPT = """Generate accurate pinyin with tone marks for this Chinese word.

Word: {word}

Return JSON only:
{{
  "pinyin": "pīn yīn with tone marks",
  "confidence": 0.9
}}

Rules:
- Include proper tone marks (ā á ǎ à)
- Separate each syllable with space
- Use most common pronunciation if polyphonic"""

EXAMPLES_PROMPT = """Generate EXACTLY 2 example sentences for the Chinese word "{word}" ({pinyin}).

Definition: {definition}

STRICT FORMAT - Each example MUST have exactly 4 lines:
1. Chinese sentence (8-15 characters, natural everyday usage)
2. Pinyin with tone marks (EVERY syllable separated by space)
3. Sino-Vietnamese / Hán Việt reading (each character's Han-Viet, separated by spaces)
4. Vietnamese translation (natural, not word-for-word)

EXAMPLE OUTPUT FORMAT:
我家住在一层。
Wǒ jiā zhù zài yī céng.
Ngã gia trụ tại nhất tầng.
Nhà tôi ở tầng một.

蛋糕有一层奶油。
Dàn gāo yǒu yī céng nǎi yóu.
Đản cao hữu nhất tầng nãi du.
Bánh kem có một lớp kem.

Return JSON format:
{{
  "examples": [
    {{
      "chinese": "Chinese sentence here",
      "pinyin": "Pīn yīn with proper spacing",
      "sino": "Hán Việt reading",
      "vietnamese": "Vietnamese translation"
    }},
    {{
      "chinese": "Second Chinese sentence",
      "pinyin": "Second pinyin",
      "sino": "Second Hán Việt",
      "vietnamese": "Second Vietnamese"
    }}
  ]
}}

CRITICAL REQUIREMENTS:
- MUST generate EXACTLY 2 examples (not 1, not 3)
- Each example MUST have all 4 fields filled
- The target word "{word}" MUST appear in EACH sentence
- Pinyin: space between EVERY syllable (e.g., "Wǒ jiā" not "Wǒjiā")
- Sino: standard Han-Viet pronunciation for each Chinese character
- Vietnamese: natural translation, appropriate for Vietnamese learners
- Use simple, practical HSK 2-4 level vocabulary"""

# ============================================================================
# Verification Prompts
# ============================================================================

VERIFY_SINO_PROMPT = """You are a Chinese-Vietnamese language expert. Verify the Sino-Vietnamese (Han-Viet) reading.

Chinese word: {word}
Pinyin: {pinyin}
Current Sino-Vietnamese: {current_value}

Check:
1. Each character has correct Han-Viet reading
2. Vietnamese diacritics are correct
3. Spacing is proper

If correct, return: {{"is_correct": true, "confidence": 0.95}}

If incorrect, return:
{{
  "is_correct": false,
  "suggested_value": "correct sino-vietnamese here",
  "reason": "Brief explanation of error",
  "confidence": 0.9
}}"""

VERIFY_DEFINITION_PROMPT = """You are a Chinese-Vietnamese language expert. Verify the Vietnamese definition.

Chinese word: {word}
Pinyin: {pinyin}
Current definition: {current_value}

Check:
1. Definition accurately captures the word's meaning
2. Vietnamese is natural and grammatically correct
3. No significant meanings are missing

If correct, return: {{"is_correct": true, "confidence": 0.95}}

If incorrect, return:
{{
  "is_correct": false,
  "suggested_value": "better definition here",
  "reason": "Brief explanation",
  "confidence": 0.85
}}"""

VERIFY_EXAMPLES_PROMPT = """Verify the STRUCTURE of example sentences for a Chinese word.

Chinese word: {word}
Pinyin: {pinyin}
Current examples (HTML): {current_value}

REQUIRED STRUCTURE - Must have EXACTLY 2 examples, each with 4 parts:
1. Chinese sentence (must contain "{word}")
2. Pinyin line
3. Sino-Vietnamese / Hán Việt line
4. Vietnamese translation line

ONLY CHECK STRUCTURE - Mark as correct if:
- Has 2 examples (not 1, not 3+)
- Each example has all 4 parts present (not missing any line)
- Target word "{word}" appears in each Chinese sentence

DO NOT flag issues about:
- "Naturalness" of Chinese, Vietnamese, or translations
- "Accuracy" of Sino-Vietnamese readings
- Style preferences or minor improvements
- Tone mark formatting in pinyin

If structure is correct (2 examples, 4 parts each, target word present), return:
{{"is_correct": true, "confidence": 0.95}}

ONLY flag as incorrect if:
- Missing examples (has 0 or 1 instead of 2)
- Missing parts (example lacks Chinese/Pinyin/Sino/Vietnamese line)
- Target word "{word}" not in a Chinese sentence
- Completely gibberish/nonsensical content

If structure is broken, return:
{{
  "is_correct": false,
  "issues": ["Missing second example", "First example lacks Sino-Vietnamese line"],
  "reason": "Structural problems only",
  "confidence": 0.9,
  "corrected_examples": [...]
}}"""

VERIFY_SIMPLIFIED_PROMPT = """You are a Chinese language expert. Verify simplified Chinese conversion.

Traditional Chinese: {word}
Current simplified: {current_value}

Check:
1. All traditional characters correctly converted to simplified
2. No missing or extra characters

If correct, return: {{"is_correct": true, "confidence": 0.98}}

If incorrect, return:
{{
  "is_correct": false,
  "suggested_value": "correct simplified",
  "reason": "Brief explanation",
  "confidence": 0.95
}}"""
