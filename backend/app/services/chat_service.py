"""
Chat service for Ask AI feature.
Handles streaming responses and conversation history management.
"""

import os
import json
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator

from app.models.chat import ChatMessage, ChatHistory, ChatHistoryStore
from app.services.chat_prompts import CHAT_SYSTEM_PROMPT, get_preset_prompt

try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    try:
        import google.generativeai as genai
        types = genai.types
        GENAI_AVAILABLE = True
    except ImportError:
        GENAI_AVAILABLE = False
        genai = None
        types = None


class ChatService:
    """Service for handling AI chat conversations about flashcards."""

    MODEL_NAME = "gemini-2.0-flash"
    # Use path relative to this file's location (backend/app/services/)
    HISTORY_FILE = Path(__file__).parent.parent.parent / "data" / "card_chat_history.json"

    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.client = None
        self._init_client()
        self._ensure_history_file()

    def _init_client(self):
        """Initialize Gemini client if API key configured."""
        if not GENAI_AVAILABLE:
            return
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"Warning: Failed to initialize Gemini client: {e}")

    def _ensure_history_file(self):
        """Ensure the history file and directory exist."""
        self.HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not self.HISTORY_FILE.exists():
            self._save_store(ChatHistoryStore())

    def _load_store(self) -> ChatHistoryStore:
        """Load chat history store from file."""
        try:
            with open(self.HISTORY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Convert histories dict back to ChatHistory objects
                histories = {}
                for note_id, hist_data in data.get("histories", {}).items():
                    histories[note_id] = ChatHistory(
                        note_id=hist_data["note_id"],
                        word=hist_data["word"],
                        messages=[
                            ChatMessage(**msg) for msg in hist_data["messages"]
                        ],
                        updated_at=datetime.fromisoformat(hist_data["updated_at"])
                    )
                return ChatHistoryStore(version=data.get("version", 1), histories=histories)
        except (FileNotFoundError, json.JSONDecodeError):
            return ChatHistoryStore()

    def _save_store(self, store: ChatHistoryStore):
        """Save chat history store to file."""
        data = {
            "version": store.version,
            "histories": {
                note_id: {
                    "note_id": hist.note_id,
                    "word": hist.word,
                    "messages": [
                        {
                            "role": msg.role,
                            "content": msg.content,
                            "timestamp": msg.timestamp.isoformat()
                        }
                        for msg in hist.messages
                    ],
                    "updated_at": hist.updated_at.isoformat()
                }
                for note_id, hist in store.histories.items()
            }
        }
        with open(self.HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def is_available(self) -> bool:
        """Check if AI service is configured and ready."""
        return self.client is not None

    def get_history(self, note_id: int) -> ChatHistory | None:
        """Get chat history for a specific card."""
        store = self._load_store()
        return store.histories.get(str(note_id))

    def save_message(
        self,
        note_id: int,
        word: str,
        role: str,
        content: str
    ) -> ChatHistory:
        """Save a message to the history."""
        store = self._load_store()
        note_key = str(note_id)
        now = datetime.now()

        message = ChatMessage(role=role, content=content, timestamp=now)

        if note_key in store.histories:
            store.histories[note_key].messages.append(message)
            store.histories[note_key].updated_at = now
        else:
            store.histories[note_key] = ChatHistory(
                note_id=note_id,
                word=word,
                messages=[message],
                updated_at=now
            )

        self._save_store(store)
        return store.histories[note_key]

    def clear_history(self, note_id: int) -> bool:
        """Clear chat history for a specific card."""
        store = self._load_store()
        note_key = str(note_id)

        if note_key in store.histories:
            del store.histories[note_key]
            self._save_store(store)
            return True
        return False

    def _build_contents(
        self,
        word: str,
        pinyin: str | None,
        definition: str | None,
        question: str,
        history: list[ChatMessage] | None = None
    ) -> list:
        """Build contents array for Gemini chat API using proper types.Content objects."""
        # System prompt with card context
        system_content = CHAT_SYSTEM_PROMPT.format(
            word=word,
            pinyin=pinyin or "(không có)",
            definition=definition or "(không có)"
        )

        contents = []

        # Add system context as first user message
        contents.append(types.Content(
            role="user",
            parts=[types.Part(text=system_content)]
        ))
        contents.append(types.Content(
            role="model",
            parts=[types.Part(text="Tôi hiểu. Tôi sẽ giúp bạn học từ này.")]
        ))

        # Add conversation history for multi-turn context
        if history:
            for msg in history:
                role = "user" if msg.role == "user" else "model"
                contents.append(types.Content(
                    role=role,
                    parts=[types.Part(text=msg.content)]
                ))

        # Add current question
        contents.append(types.Content(
            role="user",
            parts=[types.Part(text=question)]
        ))

        return contents

    async def stream_response(
        self,
        word: str,
        pinyin: str | None,
        definition: str | None,
        question: str,
        history: list[ChatMessage] | None = None
    ) -> AsyncGenerator[str, None]:
        """Stream AI response for a question."""
        if not self.client:
            yield "Lỗi: Chưa cấu hình API key cho Gemini."
            return

        if not types:
            yield "Lỗi: google-genai library not available."
            return

        # Check if this is a preset question and expand it
        expanded_question = get_preset_prompt(question, word) or question

        contents = self._build_contents(word, pinyin, definition, expanded_question, history)

        try:
            # Use streaming API - must await the stream first
            response_stream = await self.client.aio.models.generate_content_stream(
                model=self.MODEL_NAME,
                contents=contents,
                config=types.GenerateContentConfig(
                    temperature=0.7,  # Slightly creative for explanations
                )
            )

            async for chunk in response_stream:
                if chunk.text:
                    yield chunk.text

        except Exception as e:
            yield f"\n\nLỗi: {str(e)}"


# Singleton instance
chat_service = ChatService()
