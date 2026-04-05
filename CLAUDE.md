# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

**Name:** Anki Ultimate Tool — Chinese Learning
**Type:** Web app thay thế UI Anki Desktop cho flashcard tiếng Trung, có AI field generation + TTS
**Stack:**
- Backend: FastAPI (Python 3.11+) trên cổng `3002`
- Frontend: React 19 + Vite + Tailwind 4 + TanStack Query trên cổng `5173`
- Anki: giao tiếp qua add-on `AnkiConnect` (http://localhost:8765)
- AI: Google Gemini (`google-genai`) + Google Cloud TTS

**Dev:** `./dev.sh` chạy backend + frontend song song. Yêu cầu Anki Desktop phải đang mở.

### Ràng buộc hardcoded (QUAN TRỌNG khi sửa code)

1. Root deck Anki **phải tên `Chinese`** — filter ở `backend/app/routers/anki.py:38`
2. Leaf deck phải có `Part` trong tên (vd `Chinese::HSK4::Part 1`) — `backend/app/utils/deck_filter.py`
3. Anki note model name **phải là `Chinese Vocabulary`** — `backend/app/routers/anki.py:204`
4. Field chuẩn: `Word`, `Pinyin`, `Sino`, `Definition`, `Tip`, `Example`, `Audio`, `Simplified`
   - Có fallback alias: `拼音`/`Reading`, `Han-Viet`/`Hán Việt`, `Meaning`/`Vietnamese`, `Examples`/`例句`

### Cấu trúc chính

```
backend/app/
├── routers/    # anki, ai, audio, dict, study, chat
├── services/   # ai_service, anki_service, tts_service, srs, field_service, dict_service, chat_service
├── models/     # Pydantic schemas
└── utils/      # deck_filter, field_cleaner, html_cleaner, audio_naming, examples_validator

frontend/src/
├── api/        # axios client + endpoints
├── components/ # editor/, scanner/, study/, ask-ai/, field-suggestion/, ...
├── hooks/      # React Query hooks (useCards, useDecks, useStudy, useFieldStats, ...)
└── pages/Dashboard.tsx
```

### Tính năng đã có

- CRUD card + rich text editor (TipTap)
- AI generate: Pinyin (zdic.net + Gemini fallback), Sino-Vietnamese, Definition, Examples, Simplified
- Global Scanner: field stats, batch fill/regenerate/verify, field issues detection
- Google Cloud TTS batch audio generation + health check
- Study Mode với thuật toán SM-2, update Anki qua `setDueDate` + `setEaseFactors`
- Ask AI chat streaming Gemini, history lưu `backend/data/card_chat_history.json`
- Monthly AI cost limit (default $1, env `AI_MONTHLY_LIMIT`)

**Chi tiết setup tài khoản Anki mới: xem `./README.md` (phần "Setup cho tài khoản Anki mới").**

## Role & Responsibilities

Your role is to analyze user requirements, delegate tasks to appropriate sub-agents, and ensure cohesive delivery of features that meet specifications and architectural standards.

## Workflows

- Primary workflow: `./.claude/rules/primary-workflow.md`
- Development rules: `./.claude/rules/development-rules.md`
- Orchestration protocols: `./.claude/rules/orchestration-protocol.md`
- Documentation management: `./.claude/rules/documentation-management.md`
- And other workflows: `./.claude/rules/*`

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT:** You must follow strictly the development rules in `./.claude/rules/development-rules.md` file.
**IMPORTANT:** Before you plan or proceed any implementation, always read the `./README.md` file first to get context.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
**IMPORTANT:** In reports, list any unresolved questions at the end, if any.

## Hook Response Protocol

### Privacy Block Hook (`@@PRIVACY_PROMPT@@`)

When a tool call is blocked by the privacy-block hook, the output contains a JSON marker between `@@PRIVACY_PROMPT_START@@` and `@@PRIVACY_PROMPT_END@@`. **You MUST use the `AskUserQuestion` tool** to get proper user approval.

**Required Flow:**

1. Parse the JSON from the hook output
2. Use `AskUserQuestion` with the question data from the JSON
3. Based on user's selection:
   - **"Yes, approve access"** → Use `bash cat "filepath"` to read the file (bash is auto-approved)
   - **"No, skip this file"** → Continue without accessing the file

**Example AskUserQuestion call:**
```json
{
  "questions": [{
    "question": "I need to read \".env\" which may contain sensitive data. Do you approve?",
    "header": "File Access",
    "options": [
      { "label": "Yes, approve access", "description": "Allow reading .env this time" },
      { "label": "No, skip this file", "description": "Continue without accessing this file" }
    ],
    "multiSelect": false
  }]
}
```

**IMPORTANT:** Always ask the user via `AskUserQuestion` first. Never try to work around the privacy block without explicit user approval.

## Python Scripts (Skills)

When running Python scripts from `.claude/skills/`, use the venv Python interpreter:
- **Linux/macOS:** `.claude/skills/.venv/bin/python3 scripts/xxx.py`
- **Windows:** `.claude\skills\.venv\Scripts\python.exe scripts\xxx.py`

This ensures packages installed by `install.sh` (google-genai, pypdf, etc.) are available.

**IMPORTANT:** When scripts of skills failed, don't stop, try to fix them directly.

## [IMPORTANT] Consider Modularization
- If a code file exceeds 200 lines of code, consider modularizing it
- Check existing modules before creating new
- Analyze logical separation boundaries (functions, classes, concerns)
- Use kebab-case naming with long descriptive names, it's fine if the file name is long because this ensures file names are self-documenting for LLM tools (Grep, Glob, Search)
- Write descriptive code comments
- After modularization, continue with main task
- When not to modularize: Markdown files, plain text files, bash scripts, configuration files, environment variables files, etc.

## Documentation Management

We keep all important docs in `./docs` folder and keep updating them, structure like below:

```
./docs
├── project-overview-pdr.md
├── code-standards.md
├── codebase-summary.md
├── design-guidelines.md
├── deployment-guide.md
├── system-architecture.md
└── project-roadmap.md
```

**IMPORTANT:** *MUST READ* and *MUST COMPLY* all *INSTRUCTIONS* in project `./CLAUDE.md`, especially *WORKFLOWS* section is *CRITICALLY IMPORTANT*, this rule is *MANDATORY. NON-NEGOTIABLE. NO EXCEPTIONS. MUST REMEMBER AT ALL TIMES!!!*