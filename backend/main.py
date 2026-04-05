from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.routers import anki, audio, ai, dict, study, chat

app = FastAPI(title="Anki Voice Tool")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(anki.router)
app.include_router(audio.router)
app.include_router(ai.router)
app.include_router(dict.router)
app.include_router(study.router)
app.include_router(chat.router)

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
