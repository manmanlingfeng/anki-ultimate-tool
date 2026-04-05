"""
AI prompts for Ask AI chat feature.
System prompts and preset question templates in Vietnamese.
"""

# System prompt for chat conversations
CHAT_SYSTEM_PROMPT = """Bạn là trợ lý học tiếng Trung cho người Việt Nam.
Bạn giúp giải thích từ vựng, ngữ pháp, và cách ghi nhớ từ Hán ngữ.

Thông tin về từ đang thảo luận:
- Từ: {word}
- Pinyin: {pinyin}
- Nghĩa: {definition}

Hướng dẫn trả lời:
1. Trả lời bằng tiếng Việt
2. Sử dụng từ Hán Việt khi cần thiết
3. Ngắn gọn nhưng đầy đủ
4. Đưa ví dụ khi hữu ích
5. Với từ đơn: giải thích bộ thủ, cách viết, mẹo nhớ
6. Với cụm từ: giải thích cấu tạo, ngữ pháp, ngữ cảnh văn hóa
7. Dùng markdown để định dạng dễ đọc"""


# Preset question prompts for different card types
PRESET_PROMPTS = {
    # For single characters (1-2 chars)
    "radical": """Phân tích bộ thủ (radicals) của từ "{word}":
- Liệt kê các bộ thủ tạo nên từ này
- Giải thích ý nghĩa của từng bộ thủ
- Cho biết cách bộ thủ góp phần vào nghĩa của từ
- Nếu có, đề cập đến cách viết (thứ tự nét)""",

    "mnemonic": """Đề xuất mẹo ghi nhớ cho từ "{word}":
- Dựa trên hình dạng chữ
- Dựa trên bộ thủ
- Liên hệ với từ Hán Việt
- Câu chuyện hoặc hình ảnh dễ nhớ
- Mẹo nhớ âm đọc (nếu khó)""",

    "compounds": """Liệt kê các từ ghép phổ biến chứa "{word}":
- Cho ít nhất 5-8 từ ghép thông dụng
- Kèm pinyin và nghĩa tiếng Việt
- Sắp xếp theo độ phổ biến
- Ghi chú cách dùng nếu đặc biệt""",

    "similar": """Phân biệt "{word}" với các từ gần nghĩa hoặc dễ nhầm:
- Liệt kê 2-3 từ hay bị nhầm
- So sánh nghĩa và cách dùng
- Cho ví dụ câu để phân biệt
- Ghi chú ngữ cảnh sử dụng khác nhau""",

    # For phrases (3+ chars)
    "structure": """Phân tích cấu tạo ngữ pháp của "{word}":
- Loại từ của từng thành phần
- Cấu trúc ngữ pháp (S-V-O, bổ ngữ, định ngữ, v.v.)
- So sánh với cấu trúc tiếng Việt tương đương
- Ghi chú về thứ tự từ nếu khác tiếng Việt""",

    "meaning": """Giải thích nguồn gốc nghĩa của "{word}":
- Nghĩa đen của từng chữ
- Cách ghép lại tạo nghĩa bóng/nghĩa hoàn chỉnh
- Quá trình chuyển nghĩa (nếu có)
- Các nghĩa mở rộng trong ngữ cảnh khác""",

    "origin": """Nguồn gốc và điển cố của "{word}":
- Xuất xứ lịch sử (nếu có)
- Điển cố, thành ngữ liên quan
- Câu chuyện hoặc sự kiện gốc
- Cách sử dụng trong văn học/đời sống hiện đại""",

    "usage": """Cách sử dụng "{word}" trong câu:
- Các mẫu câu phổ biến
- Ngữ cảnh thích hợp (trang trọng/thân mật)
- Các từ thường đi kèm (collocation)
- Lưu ý khi sử dụng (dễ sai ở đâu)""",
}


# Preset questions configuration
# card_type: "single_char" for 1-2 chars, "phrase" for 3+ chars, "all" for both
PRESET_QUESTIONS = [
    # Single character questions
    {"id": "radical", "label": "Bộ thủ nào tạo thành từ này?", "card_type": "single_char"},
    {"id": "mnemonic", "label": "Mẹo ghi nhớ từ này", "card_type": "all"},
    {"id": "compounds", "label": "Từ ghép phổ biến với từ này", "card_type": "single_char"},
    {"id": "similar", "label": "Phân biệt với từ gần nghĩa", "card_type": "all"},
    # Phrase questions
    {"id": "structure", "label": "Phân tích cấu tạo cụm từ", "card_type": "phrase"},
    {"id": "meaning", "label": "Tại sao kết hợp này có nghĩa như vậy?", "card_type": "phrase"},
    {"id": "origin", "label": "Nguồn gốc/điển cố", "card_type": "phrase"},
    {"id": "usage", "label": "Cách dùng trong câu", "card_type": "all"},
]


def get_preset_prompt(preset_id: str, word: str) -> str | None:
    """Get the prompt template for a preset question."""
    template = PRESET_PROMPTS.get(preset_id)
    if template:
        return template.format(word=word)
    return None


def get_presets_for_word(word: str) -> list[dict]:
    """Get applicable preset questions based on word length."""
    word_type = "single_char" if len(word) <= 2 else "phrase"
    return [
        q for q in PRESET_QUESTIONS
        if q["card_type"] == "all" or q["card_type"] == word_type
    ]
