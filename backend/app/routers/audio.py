from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from pathlib import Path
import asyncio
import time
import json

from app.services.anki_service import anki_service
from app.services.tts_service import tts_service
from app.utils.audio_naming import generate_audio_filename, extract_audio_from_field, generate_audio_pattern, extract_index_from_audio

router = APIRouter(prefix="/api/audio", tags=["audio"])

# Track active streaming sessions for cancellation
active_streams: dict[str, bool] = {}

class GenerateRequest(BaseModel):
    deck_id: int
    note_id: int
    word: str
    index: int

class PreviewAudioRequest(BaseModel):
    deck_id: int
    note_id: int
    word: str
    index: int

class BatchGenerateRequest(BaseModel):
    regenerate_existing: bool = False

class HealthCheckResult(BaseModel):
    deck_id: int
    deck_name: str
    total_cards: int
    cards_with_audio: int
    cards_missing_audio: int
    cards_wrong_index: int
    orphaned_audio: int  # Audio files without cards
    issues: list[dict]

# Store batch job status
batch_jobs: dict[str, dict] = {}

class VoiceSettingsRequest(BaseModel):
    voice_id: str
    # Google settings
    speaking_rate: float = 0.9
    pitch: float = 0.0
    # Speech Actors settings
    style: str = "calm"

@router.get("/health")
async def check_tts_health():
    """Check if TTS service is configured"""
    return {"available": tts_service.is_available()}

@router.get("/voices")
async def get_voices():
    """Get available TTS voices and settings"""
    voices = tts_service.get_voices()
    # Get unique providers from available voices
    providers = list(set(v["provider"] for v in voices))
    return {
        "voices": voices,
        "providers": providers,
        "current": tts_service.get_current_voice(),
        # Google settings
        "speaking_rate": tts_service.speaking_rate,
        "pitch": tts_service.get_pitch(),
        # Speech Actors settings
        "style": tts_service.get_style(),
        "available_styles": tts_service.get_available_styles()
    }

@router.post("/voices")
async def set_voice(request: VoiceSettingsRequest):
    """Set TTS voice and all provider settings"""
    voice_ok = tts_service.set_voice(request.voice_id)
    if not voice_ok:
        raise HTTPException(400, f"Invalid voice: {request.voice_id}")

    # Apply Google settings
    tts_service.set_speaking_rate(request.speaking_rate)
    tts_service.set_pitch(request.pitch)
    # Apply Speech Actors settings
    tts_service.set_style(request.style)

    return {
        "voice": tts_service.get_current_voice(),
        "speaking_rate": tts_service.speaking_rate,
        "pitch": tts_service.get_pitch(),
        "style": tts_service.get_style()
    }

@router.get("/preview/{voice_id}")
async def preview_voice(voice_id: str):
    """Preview a voice with sample text"""
    if not tts_service.is_available():
        raise HTTPException(503, "Google TTS not configured")

    from fastapi.responses import Response

    # Save current voice and temporarily switch
    original_voice = tts_service.get_current_voice()
    if not tts_service.set_voice(voice_id):
        raise HTTPException(400, f"Invalid voice: {voice_id}")

    try:
        # Generate sample audio
        audio_data = await tts_service.generate_audio("你好，这是语音预览")
        # Restore original voice
        tts_service.set_voice(original_voice)
        return Response(content=audio_data, media_type="audio/mpeg")
    except Exception as e:
        tts_service.set_voice(original_voice)
        raise HTTPException(500, str(e))

@router.get("/play/{filename:path}")
async def play_audio(filename: str):
    """Serve audio file from Anki media folder"""
    media_path = Path(await anki_service.get_media_dir_path())
    file_path = media_path / filename

    if not file_path.exists():
        raise HTTPException(404, f"Audio file not found: {filename}")

    return FileResponse(
        file_path,
        media_type="audio/mpeg",
        filename=filename
    )

@router.post("/generate")
async def generate_single_audio(request: GenerateRequest):
    """Generate audio for a single card"""
    if not tts_service.is_available():
        raise HTTPException(503, "Google TTS not configured")

    decks = await anki_service.get_deck_names_and_ids()
    deck_name = next((name for name, id in decks.items() if id == request.deck_id), None)
    if not deck_name:
        raise HTTPException(404, "Deck not found")

    filename = generate_audio_filename(deck_name, request.index)
    media_path = await anki_service.get_media_dir_path()

    await tts_service.generate_and_save(request.word, filename, media_path)

    audio_field = f"[sound:{filename}]"
    await anki_service.update_note_fields(request.note_id, {"Audio": audio_field})

    return {"success": True, "filename": filename}

@router.post("/generate/preview")
async def generate_preview_audio(request: PreviewAudioRequest):
    """Generate audio for preview without applying to card"""
    if not tts_service.is_available():
        raise HTTPException(503, "TTS not configured")

    decks = await anki_service.get_deck_names_and_ids()
    deck_name = next((name for name, id in decks.items() if id == request.deck_id), None)
    if not deck_name:
        raise HTTPException(404, "Deck not found")

    filename = generate_audio_filename(deck_name, request.index)
    media_path = await anki_service.get_media_dir_path()

    await tts_service.generate_and_save(request.word, filename, media_path)

    return {"success": True, "filename": filename, "note_id": request.note_id}

@router.post("/apply/single")
async def apply_single_audio(note_id: int, filename: str):
    """Apply a single audio file to a card"""
    try:
        await anki_service.update_note_fields(
            note_id,
            {"Audio": f"[sound:{filename}]"}
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/check/{deck_id}")
async def health_check(deck_id: int) -> HealthCheckResult:
    """Check audio health for a deck"""
    decks = await anki_service.get_deck_names_and_ids()
    deck_name = next((name for name, id in decks.items() if id == deck_id), None)
    if not deck_name:
        raise HTTPException(404, "Deck not found")

    card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
    card_ids.sort()

    # Get audio pattern for this deck
    audio_pattern = generate_audio_pattern(deck_name)

    if not card_ids:
        # Check for orphaned audio even if no cards
        orphaned_count = 0
        orphaned_issues = []
        if audio_pattern:
            media_files = await anki_service.get_media_files_names(audio_pattern)
            orphaned_count = len(media_files)
            for filename in media_files:
                idx = extract_index_from_audio(filename)
                orphaned_issues.append({
                    "type": "orphaned",
                    "filename": filename,
                    "index": idx
                })

        return HealthCheckResult(
            deck_id=deck_id,
            deck_name=deck_name,
            total_cards=0,
            cards_with_audio=0,
            cards_missing_audio=0,
            cards_wrong_index=0,
            orphaned_audio=orphaned_count,
            issues=orphaned_issues
        )

    cards_info = await anki_service.get_cards_info(card_ids)
    media_path = Path(await anki_service.get_media_dir_path())

    issues = []
    cards_with_audio = 0
    cards_missing_audio = 0
    cards_wrong_index = 0

    # Track audio indices used by cards
    card_audio_indices: set[int] = set()

    for idx, card in enumerate(cards_info):
        word = card["fields"].get("Word", {}).get("value", "")
        audio_field = card["fields"].get("Audio", {}).get("value", "")
        audio_file = extract_audio_from_field(audio_field)
        expected_filename = generate_audio_filename(deck_name, idx)

        # Track the index this card uses
        if audio_file:
            audio_idx = extract_index_from_audio(audio_file)
            if audio_idx is not None:
                card_audio_indices.add(audio_idx)

        if not audio_file:
            cards_missing_audio += 1
            issues.append({
                "type": "missing",
                "card_id": card["cardId"],
                "note_id": card["note"],
                "index": idx,
                "word": word,
                "expected": expected_filename
            })
        elif audio_file != expected_filename:
            cards_wrong_index += 1
            issues.append({
                "type": "wrong_index",
                "card_id": card["cardId"],
                "note_id": card["note"],
                "index": idx,
                "word": word,
                "current": audio_file,
                "expected": expected_filename
            })
        elif not (media_path / audio_file).exists():
            cards_missing_audio += 1
            issues.append({
                "type": "file_missing",
                "card_id": card["cardId"],
                "note_id": card["note"],
                "index": idx,
                "word": word,
                "filename": audio_file
            })
        else:
            cards_with_audio += 1

    # Check for orphaned audio files (audio files without cards)
    orphaned_count = 0
    if audio_pattern:
        media_files = await anki_service.get_media_files_names(audio_pattern)
        for filename in media_files:
            audio_idx = extract_index_from_audio(filename)
            if audio_idx is not None and audio_idx not in card_audio_indices:
                orphaned_count += 1
                issues.append({
                    "type": "orphaned",
                    "filename": filename,
                    "index": audio_idx
                })

    return HealthCheckResult(
        deck_id=deck_id,
        deck_name=deck_name,
        total_cards=len(cards_info),
        cards_with_audio=cards_with_audio,
        cards_missing_audio=cards_missing_audio,
        cards_wrong_index=cards_wrong_index,
        orphaned_audio=orphaned_count,
        issues=issues
    )

@router.post("/batch/{deck_id}")
async def batch_generate(deck_id: int, request: BatchGenerateRequest, background_tasks: BackgroundTasks):
    """Start batch audio generation"""
    if not tts_service.is_available():
        raise HTTPException(503, "Google TTS not configured")

    job_id = f"batch_{deck_id}_{int(time.time())}"
    batch_jobs[job_id] = {
        "status": "running",
        "progress": 0,
        "total": 0,
        "errors": []
    }

    background_tasks.add_task(run_batch_generate, job_id, deck_id, request.regenerate_existing)

    return {"job_id": job_id}

async def run_batch_generate(job_id: str, deck_id: int, regenerate: bool):
    """Background task for batch generation"""
    try:
        decks = await anki_service.get_deck_names_and_ids()
        deck_name = next((name for name, id in decks.items() if id == deck_id), None)

        card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
        card_ids.sort()
        cards_info = await anki_service.get_cards_info(card_ids)
        media_path = await anki_service.get_media_dir_path()

        batch_jobs[job_id]["total"] = len(cards_info)

        for idx, card in enumerate(cards_info):
            try:
                word = card["fields"].get("Word", {}).get("value", "")
                audio_field = card["fields"].get("Audio", {}).get("value", "")
                current_audio = extract_audio_from_field(audio_field)
                expected_filename = generate_audio_filename(deck_name, idx)

                if current_audio == expected_filename and not regenerate:
                    if Path(media_path, current_audio).exists():
                        batch_jobs[job_id]["progress"] = idx + 1
                        continue

                await tts_service.generate_and_save(word, expected_filename, media_path)

                await anki_service.update_note_fields(
                    card["note"],
                    {"Audio": f"[sound:{expected_filename}]"}
                )

                batch_jobs[job_id]["progress"] = idx + 1
                await asyncio.sleep(0.1)

            except Exception as e:
                batch_jobs[job_id]["errors"].append({
                    "index": idx,
                    "word": word,
                    "error": str(e)
                })

        batch_jobs[job_id]["status"] = "completed"

    except Exception as e:
        batch_jobs[job_id]["status"] = "failed"
        batch_jobs[job_id]["error"] = str(e)

@router.get("/batch/{job_id}/status")
async def get_batch_status(job_id: str):
    """Get batch job status"""
    if job_id not in batch_jobs:
        raise HTTPException(404, "Job not found")
    return batch_jobs[job_id]

@router.post("/fix/{deck_id}")
async def auto_fix_audio(deck_id: int, background_tasks: BackgroundTasks):
    """Fix all audio issues in deck"""
    if not tts_service.is_available():
        raise HTTPException(503, "Google TTS not configured")

    health = await health_check(deck_id)

    if not health.issues:
        return {"message": "No issues to fix", "job_id": None}

    job_id = f"fix_{deck_id}_{int(time.time())}"
    batch_jobs[job_id] = {
        "status": "running",
        "progress": 0,
        "total": len(health.issues),
        "errors": []
    }

    background_tasks.add_task(run_fix_audio, job_id, health)

    return {"job_id": job_id}

async def run_fix_audio(job_id: str, health: HealthCheckResult):
    """Background task to fix audio issues"""
    media_path = await anki_service.get_media_dir_path()

    for idx, issue in enumerate(health.issues):
        try:
            word = issue["word"]
            expected = issue["expected"]

            await tts_service.generate_and_save(word, expected, media_path)

            await anki_service.update_note_fields(
                issue["note_id"],
                {"Audio": f"[sound:{expected}]"}
            )

            batch_jobs[job_id]["progress"] = idx + 1
            await asyncio.sleep(0.1)

        except Exception as e:
            batch_jobs[job_id]["errors"].append({
                "issue": issue,
                "error": str(e)
            })

    batch_jobs[job_id]["status"] = "completed"


# === SSE Streaming Audio Generation with Preview ===

class ApplyAudioRequest(BaseModel):
    """Request to apply approved audio to cards"""
    items: list[dict]  # [{note_id, filename}, ...]


@router.get("/stream/{deck_id}")
async def stream_audio_generation(deck_id: int, request: Request, regenerate: bool = False):
    """
    SSE endpoint for streaming audio generation with preview.
    Generates audio files but doesn't update card fields until approved.
    """
    if not tts_service.is_available():
        raise HTTPException(503, "TTS not configured")

    stream_id = f"audio_{deck_id}_{int(time.time())}"
    active_streams[stream_id] = True

    async def generate():
        try:
            # Get deck info
            decks = await anki_service.get_deck_names_and_ids()
            deck_name = next((name for name, id in decks.items() if id == deck_id), None)
            if not deck_name:
                yield f"event: error\ndata: {json.dumps({'message': 'Deck not found'})}\n\n"
                return

            # Get cards
            card_ids = await anki_service.find_cards(f'deck:"{deck_name}"')
            card_ids.sort()
            cards_info = await anki_service.get_cards_info(card_ids)
            media_path = await anki_service.get_media_dir_path()

            # Filter cards that need audio
            cards_to_process = []
            for idx, card in enumerate(cards_info):
                word = card["fields"].get("Word", {}).get("value", "")
                if not word:
                    continue

                audio_field = card["fields"].get("Audio", {}).get("value", "")
                current_audio = extract_audio_from_field(audio_field)
                expected_filename = generate_audio_filename(deck_name, idx)

                # Skip if already has correct audio and not regenerating
                if not regenerate and current_audio == expected_filename:
                    if Path(media_path, current_audio).exists():
                        continue

                cards_to_process.append({
                    "idx": idx,
                    "card": card,
                    "word": word,
                    "expected_filename": expected_filename
                })

            total = len(cards_to_process)
            yield f"event: start\ndata: {json.dumps({'total_cards': total, 'stream_id': stream_id})}\n\n"

            if total == 0:
                yield f"event: complete\ndata: {json.dumps({'total_generated': 0})}\n\n"
                return

            generated_count = 0
            for i, item in enumerate(cards_to_process):
                # Check if stream was cancelled
                if not active_streams.get(stream_id, False):
                    yield f"event: stopped\ndata: {json.dumps({'generated': generated_count})}\n\n"
                    return

                # Send progress
                yield f"event: progress\ndata: {json.dumps({'current': i + 1, 'total': total, 'word': item['word']})}\n\n"

                try:
                    # Generate audio file (but don't update card yet)
                    await tts_service.generate_and_save(
                        item["word"],
                        item["expected_filename"],
                        media_path
                    )

                    # Send result with audio info for preview
                    yield f"event: result\ndata: {json.dumps({'note_id': item['card']['note'], 'word': item['word'], 'filename': item['expected_filename'], 'index': item['idx']})}\n\n"

                    generated_count += 1
                    await asyncio.sleep(0.1)  # Small delay between requests

                except Exception as e:
                    yield f"event: item_error\ndata: {json.dumps({'word': item['word'], 'error': str(e)})}\n\n"

            yield f"event: complete\ndata: {json.dumps({'total_generated': generated_count})}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
        finally:
            # Cleanup
            if stream_id in active_streams:
                del active_streams[stream_id]

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/stream/{stream_id}/stop")
async def stop_audio_stream(stream_id: str):
    """Stop an active audio generation stream"""
    if stream_id in active_streams:
        active_streams[stream_id] = False
        return {"status": "stopping"}
    return {"status": "not_found"}


@router.post("/apply")
async def apply_audio_to_cards(request: ApplyAudioRequest):
    """Apply approved audio files to card fields"""
    applied = 0
    errors = []

    for item in request.items:
        try:
            note_id = item.get("note_id")
            filename = item.get("filename")

            if not note_id or not filename:
                continue

            await anki_service.update_note_fields(
                note_id,
                {"Audio": f"[sound:{filename}]"}
            )
            applied += 1
            await asyncio.sleep(0.05)  # Small delay

        except Exception as e:
            errors.append({"note_id": item.get("note_id"), "error": str(e)})

    return {"applied": applied, "errors": errors}


@router.post("/discard")
async def discard_audio_files(filenames: list[str]):
    """Delete audio files that were rejected (optional cleanup)"""
    try:
        media_path = Path(await anki_service.get_media_dir_path())
        deleted = 0

        for filename in filenames:
            file_path = media_path / filename
            if file_path.exists():
                file_path.unlink()
                deleted += 1

        return {"deleted": deleted}
    except Exception as e:
        raise HTTPException(500, str(e))
