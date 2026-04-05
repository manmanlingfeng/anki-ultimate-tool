from pathlib import Path
from typing import Optional
import os
import httpx

# Google Cloud TTS voices
GOOGLE_VOICES = [
    {"id": "cmn-CN-Wavenet-A", "name": "Wavenet A", "gender": "Female", "quality": "high", "provider": "google"},
    {"id": "cmn-CN-Wavenet-B", "name": "Wavenet B", "gender": "Male", "quality": "high", "provider": "google"},
    {"id": "cmn-CN-Wavenet-C", "name": "Wavenet C", "gender": "Male", "quality": "high", "provider": "google"},
    {"id": "cmn-CN-Wavenet-D", "name": "Wavenet D", "gender": "Female", "quality": "high", "provider": "google"},
    {"id": "cmn-CN-Standard-A", "name": "Standard A", "gender": "Female", "quality": "standard", "provider": "google"},
    {"id": "cmn-CN-Standard-B", "name": "Standard B", "gender": "Male", "quality": "standard", "provider": "google"},
    {"id": "cmn-CN-Standard-C", "name": "Standard C", "gender": "Male", "quality": "standard", "provider": "google"},
    {"id": "cmn-CN-Standard-D", "name": "Standard D", "gender": "Female", "quality": "standard", "provider": "google"},
]

# Speech Actors voices (Azure Neural voices)
SPEECHACTORS_VOICES = [
    # Female voices
    {"id": "zh-CN-XiaoxiaoNeural", "name": "Xiaoxiao", "gender": "Female", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-XiaoyiNeural", "name": "Xiaoyi", "gender": "Female", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-XiaohanNeural", "name": "Xiaohan", "gender": "Female", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-XiaomengNeural", "name": "Xiaomeng", "gender": "Female", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-XiaomoNeural", "name": "Xiaomo", "gender": "Female", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-XiaoqiuNeural", "name": "Xiaoqiu", "gender": "Female", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-XiaorouNeural", "name": "Xiaorou", "gender": "Female", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-XiaoruiNeural", "name": "Xiaorui", "gender": "Female", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-XiaoshuangNeural", "name": "Xiaoshuang", "gender": "Female", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-XiaoyanNeural", "name": "Xiaoyan", "gender": "Female", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-XiaoyouNeural", "name": "Xiaoyou", "gender": "Female", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-XiaozhenNeural", "name": "Xiaozhen", "gender": "Female", "quality": "neural", "provider": "speechactors"},
    # Male voices
    {"id": "zh-CN-YunxiNeural", "name": "Yunxi", "gender": "Male", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-YunjianNeural", "name": "Yunjian", "gender": "Male", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-YunyangNeural", "name": "Yunyang", "gender": "Male", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-YunfengNeural", "name": "Yunfeng", "gender": "Male", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-YunhaoNeural", "name": "Yunhao", "gender": "Male", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-YunjieNeural", "name": "Yunjie", "gender": "Male", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-YunxiaNeural", "name": "Yunxia", "gender": "Male", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-YunyeNeural", "name": "Yunye", "gender": "Male", "quality": "neural", "provider": "speechactors"},
    {"id": "zh-CN-YunzeNeural", "name": "Yunze", "gender": "Male", "quality": "neural", "provider": "speechactors"},
]

# Speech Actors available styles
SPEECHACTORS_STYLES = [
    "calm", "cheerful", "sad", "angry", "fearful",
    "friendly", "hopeful", "shouting", "unfriendly", "whispering"
]

class TTSService:
    def __init__(self):
        self.google_client = None
        self.speechactors_api_key = os.getenv("SPEECH_ACTORS_API_KEY")
        self.voice = os.getenv("TTS_VOICE", "zh-CN-YunzeNeural")
        # Google settings
        self.speaking_rate = float(os.getenv("TTS_SPEAKING_RATE", "0.9"))
        self.pitch = float(os.getenv("TTS_PITCH", "0.0"))
        # Speech Actors settings
        self.style = os.getenv("TTS_STYLE", "calm")
        self._init_google_client()

    def _init_google_client(self):
        """Initialize Google TTS client"""
        try:
            credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            if credentials_path and Path(credentials_path).exists():
                from google.cloud import texttospeech
                self.google_client = texttospeech.TextToSpeechClient()
            else:
                print("Warning: Google credentials not configured")
        except Exception as e:
            print(f"Warning: Failed to init Google TTS client: {e}")

    def _get_all_voices(self) -> list:
        """Get all available voices from all providers"""
        voices = []
        # Add Google voices if configured
        if self.google_client:
            voices.extend(GOOGLE_VOICES)
        # Add Speech Actors voices if configured
        if self.speechactors_api_key:
            voices.extend(SPEECHACTORS_VOICES)
        return voices

    def _get_voice_provider(self, voice_id: str) -> Optional[str]:
        """Get the provider for a voice ID"""
        for v in GOOGLE_VOICES + SPEECHACTORS_VOICES:
            if v["id"] == voice_id:
                return v["provider"]
        return None

    def is_available(self) -> bool:
        """Check if any TTS service is available"""
        return self.google_client is not None or self.speechactors_api_key is not None

    def get_voices(self) -> list:
        """Get available Chinese voices"""
        return self._get_all_voices()

    def get_current_voice(self) -> str:
        """Get currently selected voice"""
        return self.voice

    def set_voice(self, voice_id: str) -> bool:
        """Set the voice to use for TTS"""
        all_voices = self._get_all_voices()
        valid_ids = [v["id"] for v in all_voices]
        if voice_id in valid_ids:
            self.voice = voice_id
            return True
        return False

    def set_speaking_rate(self, rate: float) -> bool:
        """Set speaking rate (0.25 to 4.0)"""
        if 0.25 <= rate <= 4.0:
            self.speaking_rate = rate
            return True
        return False

    def set_pitch(self, pitch: float) -> bool:
        """Set pitch (-20.0 to 20.0 semitones)"""
        if -20.0 <= pitch <= 20.0:
            self.pitch = pitch
            return True
        return False

    def get_pitch(self) -> float:
        """Get current pitch"""
        return self.pitch

    def set_style(self, style: str) -> bool:
        """Set Speech Actors style"""
        if style in SPEECHACTORS_STYLES:
            self.style = style
            return True
        return False

    def get_style(self) -> str:
        """Get current Speech Actors style"""
        return self.style

    def get_available_styles(self) -> list:
        """Get available Speech Actors styles"""
        return SPEECHACTORS_STYLES

    async def _generate_google_audio(self, text: str) -> bytes:
        """Generate audio using Google Cloud TTS"""
        if not self.google_client:
            raise Exception("Google TTS not configured")

        from google.cloud import texttospeech

        synthesis_input = texttospeech.SynthesisInput(text=text)

        voice = texttospeech.VoiceSelectionParams(
            language_code="cmn-CN",
            name=self.voice,
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=self.speaking_rate,
            pitch=self.pitch
        )

        response = self.google_client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config
        )

        return response.audio_content

    async def _generate_speechactors_audio(self, text: str) -> bytes:
        """Generate audio using Speech Actors API"""
        if not self.speechactors_api_key:
            raise Exception("Speech Actors API key not configured")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.speechactors.com/v1/generate",
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.speechactors_api_key}",
                },
                json={
                    "locale": "zh-CN",
                    "vid": self.voice,
                    "style": self.style,
                    "text": text,
                },
                timeout=30.0
            )
            response.raise_for_status()
            return response.content

    async def generate_audio(self, text: str) -> bytes:
        """Generate audio for Chinese text using appropriate provider"""
        provider = self._get_voice_provider(self.voice)

        if provider == "speechactors":
            return await self._generate_speechactors_audio(text)
        elif provider == "google":
            return await self._generate_google_audio(text)
        else:
            raise Exception(f"Unknown voice provider for voice: {self.voice}")

    async def generate_and_save(
        self,
        text: str,
        filename: str,
        media_path: str
    ) -> str:
        """Generate audio and save to Anki media folder"""
        audio_data = await self.generate_audio(text)

        filepath = Path(media_path) / filename
        filepath.write_bytes(audio_data)

        return str(filepath)

tts_service = TTSService()
