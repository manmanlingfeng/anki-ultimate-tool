"""
Dictionary service for zdic.net lookups.
Provides pinyin verification from authoritative Chinese dictionary.
"""
import asyncio
import json
import re
import time
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import httpx
from bs4 import BeautifulSoup

from app.models.dict import ZdicEntry, ZdicReading

# Cache settings
DATA_DIR = Path(__file__).parent.parent.parent / "data"
CACHE_FILE = DATA_DIR / "zdic_cache.json"
CACHE_TTL_DAYS = 30
MAX_CACHE_SIZE = 10000

# Rate limiting
MIN_REQUEST_INTERVAL = 0.5  # seconds between requests
_last_request_time = 0.0


class DictService:
    """Service for looking up pinyin from zdic.net."""

    BASE_URL = "https://www.zdic.net/hans"

    def __init__(self):
        self._memory_cache: dict[str, dict] = {}
        self._load_disk_cache()

    def _load_disk_cache(self):
        """Load cache from disk."""
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if CACHE_FILE.exists():
            try:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Filter out expired entries
                    cutoff = (datetime.now() - timedelta(days=CACHE_TTL_DAYS)).isoformat()
                    self._memory_cache = {
                        k: v for k, v in data.items()
                        if v.get("cached_at", "") > cutoff
                    }
            except (json.JSONDecodeError, IOError):
                self._memory_cache = {}

    def _save_disk_cache(self):
        """Save cache to disk."""
        try:
            # Limit cache size
            if len(self._memory_cache) > MAX_CACHE_SIZE:
                # Keep most recently cached entries
                sorted_items = sorted(
                    self._memory_cache.items(),
                    key=lambda x: x[1].get("cached_at", ""),
                    reverse=True
                )
                self._memory_cache = dict(sorted_items[:MAX_CACHE_SIZE])

            DATA_DIR.mkdir(parents=True, exist_ok=True)
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(self._memory_cache, f, ensure_ascii=False, indent=2)
        except IOError as e:
            print(f"[Dict] Failed to save cache: {e}")

    def _get_cached(self, word: str) -> Optional[ZdicEntry]:
        """Get entry from cache if exists and not expired."""
        if word in self._memory_cache:
            cached = self._memory_cache[word]
            cached_at = cached.get("cached_at", "")
            cutoff = (datetime.now() - timedelta(days=CACHE_TTL_DAYS)).isoformat()
            if cached_at > cutoff:
                entry_data = cached.get("entry")
                if entry_data:
                    return ZdicEntry(**entry_data)
        return None

    def _set_cached(self, word: str, entry: Optional[ZdicEntry]):
        """Store entry in cache."""
        self._memory_cache[word] = {
            "entry": entry.model_dump() if entry else None,
            "cached_at": datetime.now().isoformat()
        }
        # Save periodically (every 10 new entries)
        if len(self._memory_cache) % 10 == 0:
            self._save_disk_cache()

    async def _rate_limit(self):
        """Ensure we don't hit zdic.net too fast."""
        global _last_request_time
        now = time.time()
        elapsed = now - _last_request_time
        if elapsed < MIN_REQUEST_INTERVAL:
            await asyncio.sleep(MIN_REQUEST_INTERVAL - elapsed)
        _last_request_time = time.time()

    async def lookup(self, word: str) -> Optional[ZdicEntry]:
        """
        Look up a word or character in zdic.net.

        Args:
            word: Chinese character(s) to look up

        Returns:
            ZdicEntry with all readings, or None if not found
        """
        if not word or not word.strip():
            return None

        word = word.strip()

        # Check cache first
        cached = self._get_cached(word)
        if cached is not None:
            return cached

        # Rate limit
        await self._rate_limit()

        # Fetch from zdic.net with proper headers
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }
        try:
            url = f"{self.BASE_URL}/{quote(word)}"
            async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
                response = await client.get(url, follow_redirects=True)

                if response.status_code != 200:
                    self._set_cached(word, None)
                    return None

                entry = self._parse_zdic_page(word, response.text, url)
                self._set_cached(word, entry)
                return entry

        except Exception as e:
            print(f"[Dict] Error looking up '{word}': {e}")
            return None

    def _extract_pinyin_from_text(self, text: str) -> Optional[str]:
        """Extract pinyin from text that may contain Zhuyin notation."""
        if not text:
            return None
        # zdic.net format: "bāoㄅㄠˉ" - pinyin followed by Zhuyin
        # Extract just the Latin pinyin part with tone marks
        match = re.match(r"([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+)", text.strip())
        if match:
            return match.group(1)
        return None

    def _parse_zdic_page(self, word: str, html: str, url: str) -> Optional[ZdicEntry]:
        """Parse zdic.net HTML to extract pinyin readings."""
        try:
            soup = BeautifulSoup(html, "html.parser")
            readings: list[ZdicReading] = []
            seen_pinyin: set[str] = set()

            # Method 1: Look for dicpy class elements (most reliable)
            # zdic.net uses this class for pinyin display
            dicpy_elements = soup.find_all(class_="dicpy")
            for elem in dicpy_elements:
                text = elem.get_text(strip=True)
                pinyin = self._extract_pinyin_from_text(text)
                if pinyin and pinyin not in seen_pinyin and self._is_valid_pinyin(pinyin):
                    seen_pinyin.add(pinyin)
                    readings.append(ZdicReading(
                        pinyin=pinyin,
                        meaning="",
                        is_common=True
                    ))

            # Method 2: Look for z_py class if dicpy not found
            if not readings:
                z_py_elem = soup.find(class_="z_py")
                if z_py_elem:
                    text = z_py_elem.get_text(strip=True)
                    # May contain multiple pinyin separated by spaces
                    for part in text.split():
                        pinyin = self._extract_pinyin_from_text(part)
                        if pinyin and pinyin not in seen_pinyin and self._is_valid_pinyin(pinyin):
                            seen_pinyin.add(pinyin)
                            readings.append(ZdicReading(
                                pinyin=pinyin,
                                meaning="",
                                is_common=True
                            ))

            # Try to get meanings for each reading
            meanings_by_pinyin = self._extract_meanings(soup)
            for reading in readings:
                if reading.pinyin in meanings_by_pinyin:
                    reading.meaning = meanings_by_pinyin[reading.pinyin]

            if not readings:
                return None

            return ZdicEntry(
                word=word,
                readings=readings,
                url=url,
                is_polyphonic=len(readings) > 1
            )

        except Exception as e:
            print(f"[Dict] Error parsing page for '{word}': {e}")
            return None

    def _is_valid_pinyin(self, text: str) -> bool:
        """Check if text looks like valid pinyin."""
        # Pinyin should contain letters and possibly tone marks
        # Should not be too long or contain Chinese characters
        if not text or len(text) > 10:
            return False
        # Check for Chinese characters
        if re.search(r"[\u4e00-\u9fff]", text):
            return False
        # Should have at least one vowel
        if not re.search(r"[aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]", text, re.IGNORECASE):
            return False
        return True

    def _extract_meanings(self, soup: BeautifulSoup) -> dict[str, str]:
        """Extract meanings for each pinyin reading."""
        meanings: dict[str, str] = {}

        # Look for definition blocks
        # zdic.net typically has sections per reading for polyphonic characters
        def_sections = soup.find_all("div", class_="content")

        for section in def_sections:
            text = section.get_text()

            # Try to find pinyin heading followed by definitions
            # Pattern: [háng] 1. definition 2. definition
            match = re.search(r"\[([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+)\]([^[\]]+)", text)
            if match:
                py = match.group(1)
                defs = match.group(2).strip()
                # Get first definition, truncate if too long
                first_def = defs.split("。")[0][:50]
                if first_def:
                    meanings[py] = first_def

        return meanings

    async def lookup_with_fallback(self, word: str) -> Optional[ZdicEntry]:
        """
        Look up a word with fallback to individual character lookup.
        For compound words, if the full word isn't found, look up the last character
        (usually the character with potential pinyin issues like 包, 心, etc.)
        """
        # First try the full word
        entry = await self.lookup(word)
        if entry:
            return entry

        # If word is multiple characters and not found, try looking up key characters
        if len(word) > 1:
            # Look up the last character (often the one with varying pinyin)
            last_char = word[-1]
            char_entry = await self.lookup(last_char)
            if char_entry:
                # Create a new entry for the word using the character's readings
                return ZdicEntry(
                    word=word,
                    readings=char_entry.readings,
                    url=char_entry.url,
                    is_polyphonic=char_entry.is_polyphonic
                )

        return None

    async def lookup_batch(self, words: list[str]) -> dict[str, Optional[ZdicEntry]]:
        """
        Look up multiple words, with caching and rate limiting.
        Uses fallback to individual character lookup for compound words.

        Args:
            words: List of Chinese words to look up

        Returns:
            Dict mapping word -> ZdicEntry (or None if not found)
        """
        results: dict[str, Optional[ZdicEntry]] = {}

        # First, check cache for all words
        uncached_words = []
        for word in words:
            cached = self._get_cached(word)
            if cached is not None:
                results[word] = cached
            elif word in self._memory_cache:
                # Cached as None (not found)
                results[word] = None
            else:
                uncached_words.append(word)

        # Fetch uncached words with fallback
        for word in uncached_words:
            entry = await self.lookup_with_fallback(word)
            results[word] = entry

        return results

    def save_cache(self):
        """Force save cache to disk."""
        self._save_disk_cache()


# Singleton instance
dict_service = DictService()
