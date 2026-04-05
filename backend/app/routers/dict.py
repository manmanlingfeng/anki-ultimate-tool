"""
Dictionary lookup endpoints using zdic.net.
"""
from fastapi import APIRouter
from urllib.parse import unquote

from app.services.dict_service import dict_service
from app.models.dict import DictLookupResponse, ZdicEntry

router = APIRouter(prefix="/api/dict", tags=["dictionary"])


@router.get("/lookup/{word}")
async def lookup_word(word: str) -> DictLookupResponse:
    """
    Look up a Chinese word in zdic.net dictionary.

    Returns pinyin readings with meanings.
    For polyphonic characters (多音字), returns all valid readings.
    """
    # URL decode the word
    word = unquote(word)

    try:
        entry = await dict_service.lookup(word)

        if entry:
            return DictLookupResponse(
                word=word,
                entry=entry,
                cached=word in dict_service._memory_cache
            )
        else:
            return DictLookupResponse(
                word=word,
                entry=None,
                error="Word not found in dictionary"
            )
    except Exception as e:
        return DictLookupResponse(
            word=word,
            entry=None,
            error=f"Lookup failed: {str(e)}"
        )


@router.post("/lookup-batch")
async def lookup_batch(words: list[str]) -> dict[str, DictLookupResponse]:
    """
    Look up multiple words in batch.
    More efficient than individual lookups due to caching.
    """
    results = await dict_service.lookup_batch(words)

    return {
        word: DictLookupResponse(
            word=word,
            entry=entry,
            cached=True  # After lookup, all are cached
        )
        for word, entry in results.items()
    }


@router.get("/cache/stats")
async def cache_stats():
    """Get dictionary cache statistics."""
    return {
        "cached_entries": len(dict_service._memory_cache),
        "max_size": 10000,
        "ttl_days": 30
    }


@router.post("/cache/save")
async def save_cache():
    """Force save cache to disk."""
    dict_service.save_cache()
    return {"success": True}
