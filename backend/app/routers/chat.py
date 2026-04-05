"""
Chat router for Ask AI feature.
Handles streaming chat responses and conversation history.
"""

import json
from typing import Optional, AsyncGenerator
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.chat_service import chat_service
from app.services.chat_prompts import PRESET_QUESTIONS, get_presets_for_word
from app.models.chat import ChatMessage


router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatHistoryResponse(BaseModel):
    """Response containing chat history for a card."""
    note_id: int
    word: str
    messages: list[dict]


class PresetQuestionResponse(BaseModel):
    """Single preset question."""
    id: str
    label: str
    card_type: str


@router.get("/health")
async def check_health():
    """Check if chat service is available."""
    return {
        "available": chat_service.is_available(),
        "model": "gemini-2.0-flash" if chat_service.is_available() else None
    }


@router.get("/presets")
async def get_presets(word: Optional[str] = None):
    """Get preset questions. If word provided, filter by word type."""
    if word:
        presets = get_presets_for_word(word)
    else:
        presets = PRESET_QUESTIONS
    return {"presets": presets}


@router.get("/history/{note_id}")
async def get_history(note_id: int):
    """Get chat history for a specific card."""
    history = chat_service.get_history(note_id)
    if not history:
        return {"note_id": note_id, "word": "", "messages": []}

    return {
        "note_id": history.note_id,
        "word": history.word,
        "messages": [
            {
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat()
            }
            for msg in history.messages
        ]
    }


@router.delete("/history/{note_id}")
async def clear_history(note_id: int):
    """Clear chat history for a specific card."""
    success = chat_service.clear_history(note_id)
    return {"success": success, "note_id": note_id}


@router.get("/ask-stream")
async def ask_stream(
    note_id: int = Query(..., description="Card note ID"),
    word: str = Query(..., description="Chinese word"),
    question: str = Query(..., description="User question or preset ID"),
    pinyin: Optional[str] = Query(None, description="Pinyin of the word"),
    definition: Optional[str] = Query(None, description="Definition of the word"),
    display_text: Optional[str] = Query(None, description="Display text for history (preset label)"),
):
    """
    Stream AI response for a question about a card.

    Events:
    - start: {"note_id": int} - Stream started
    - chunk: {"content": str} - Text chunk from AI
    - complete: {"note_id": int} - Stream finished
    - error: {"message": str} - Error occurred
    """
    async def generate_events() -> AsyncGenerator[str, None]:
        if not chat_service.is_available():
            yield f"event: error\ndata: {json.dumps({'message': 'AI service not configured. Set GEMINI_API_KEY.'})}\n\n"
            return

        # Send start event
        yield f"event: start\ndata: {json.dumps({'note_id': note_id})}\n\n"

        # Save user question to history (use display_text if provided for better readability)
        chat_service.save_message(note_id, word, "user", display_text or question)

        # Get existing history for multi-turn context
        history = chat_service.get_history(note_id)
        # Exclude the last message (current question) from context
        history_messages = history.messages[:-1] if history else []

        # Collect full response for saving
        full_response = ""

        try:
            # Stream response chunks
            async for chunk in chat_service.stream_response(
                word=word,
                pinyin=pinyin,
                definition=definition,
                question=question,
                history=history_messages
            ):
                full_response += chunk
                yield f"event: chunk\ndata: {json.dumps({'content': chunk})}\n\n"

            # Save assistant response to history
            if full_response:
                chat_service.save_message(note_id, word, "assistant", full_response)

            # Send complete event
            yield f"event: complete\ndata: {json.dumps({'note_id': note_id})}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
