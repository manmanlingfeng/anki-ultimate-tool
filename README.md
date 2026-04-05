# Anki Ultimate Tool — Chinese Learning

Công cụ web cá nhân để quản lý flashcard tiếng Trung trong Anki Desktop, có thêm AI field generation (Gemini) và TTS audio (Google Cloud).

- **Backend:** FastAPI (Python 3.11+) trên cổng `3002`
- **Frontend:** React 19 + Vite + Tailwind 4 trên cổng `5173`
- **Anki:** giao tiếp qua add-on `AnkiConnect` (http://localhost:8765)

## Tính năng

### Quản lý card
- Deck tree phân cấp, CRUD card qua web UI
- Rich text editor (TipTap)
- Duplicate check, di chuyển card giữa deck, search toàn cục

### AI field generation (Gemini)
- **Pinyin**: tra từ điển zdic.net trước, AI fallback
- **Sino-Vietnamese**: đọc Hán Việt
- **Definition**: nghĩa tiếng Việt có ngữ cảnh
- **Examples**: 2 câu ví dụ có cấu trúc (Chinese + Pinyin + Sino + Vietnamese)
- **Simplified**: Traditional → Simplified (OpenCC + AI fallback)

### Global Scanner
- Stats fill rate từng deck, Field Issues detection
- Batch: Fill Missing / Regenerate All / Verify Existing
- Monthly AI cost limit (default $1)

### Audio TTS
- Google Cloud TTS với nhiều giọng Chinese
- Batch generate, health check, auto-fix mismatch

### Study Mode (SM-2)
- Review card graduated trực tiếp trên web
- Thuật toán SM-2 chính xác như Anki, update qua `setDueDate` + `setEaseFactors`

### Ask AI
- Chat hỏi đáp về từ/cụm tiếng Trung, streaming từ Gemini

## Setup cho tài khoản Anki mới

Đây là hướng dẫn từ đầu, áp dụng cho Anki account trống (chưa có deck/model Chinese nào).

### Bước 1: Cài Anki Desktop + AnkiConnect

1. Tải Anki Desktop: https://apps.ankiweb.net/
2. Mở Anki, vào **Tools → Add-ons → Get Add-ons**, nhập code: `2055492159`
3. Restart Anki. Giữ Anki luôn chạy khi dùng tool này.
4. Kiểm tra: mở http://localhost:8765 trên browser, thấy `AnkiConnect v.6` là OK.

### Bước 2: Tạo Note Type `Chinese Vocabulary`

Tool hardcode tên model là `Chinese Vocabulary` và bộ field cụ thể. Phải tạo đúng:

1. Trong Anki: **Tools → Manage Note Types → Add → Add: Basic → OK**
2. Đặt tên: `Chinese Vocabulary`
3. Chọn model vừa tạo → **Fields...**, thêm đủ các field (theo đúng thứ tự đề xuất):
   - `Word`
   - `Pinyin`
   - `Sino`
   - `Definition`
   - `Tip`
   - `Example`
   - `Audio`
   - `Simplified`
4. **Cards...** → chỉnh template Front/Back theo ý (tool không ép template, chỉ đọc field).

### Bước 3: Tạo deck tree gốc `Chinese`

Tool hardcode root deck name là `Chinese` và chỉ scan các sub-deck có chứa `Part` trong tên.

1. Trong Anki: **Create Deck → `Chinese`**
2. Tạo sub-deck theo pattern `Chinese::<chủ đề>::Part <số>`, ví dụ:
   - `Chinese::HSK4::Part 1`
   - `Chinese::HSK4::Part 2`
   - `Chinese::Daily::Part 1`
3. Các card thực tế phải nằm trong leaf deck (có `Part` trong tên). Deck cha chỉ để nhóm.

> Muốn tùy biến tên root hoặc bỏ ràng buộc `Part`? Sửa `backend/app/routers/anki.py` (dòng 38, 51) và `backend/app/utils/deck_filter.py`.

### Bước 4: Lấy API key Gemini (bắt buộc cho AI)

1. Vào https://aistudio.google.com/apikey
2. **Create API key** → copy key

### Bước 5: Setup Google Cloud TTS (tùy chọn, cho audio)

1. Tạo project tại https://console.cloud.google.com/
2. Enable **Cloud Text-to-Speech API**
3. **IAM & Admin → Service Accounts → Create Service Account**
4. Grant role `Cloud Text-to-Speech User`
5. **Keys → Add Key → JSON** → tải file JSON về máy, nhớ đường dẫn

### Bước 6: Cài backend

```bash
cd backend

# Tạo venv
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Cài deps
pip install -r requirements.txt

# Config env
cp .env.example .env
```

Sửa `backend/.env`:

```env
ANKI_CONNECT_URL=http://localhost:8765
GEMINI_API_KEY=<dán key từ bước 4>
GOOGLE_APPLICATION_CREDENTIALS=/đường/dẫn/đến/service-account.json
AI_MONTHLY_LIMIT=1.0
```

### Bước 7: Cài frontend

```bash
cd frontend
npm install
```

### Bước 8: Chạy

Đảm bảo **Anki Desktop đang mở**, rồi:

```bash
# Từ thư mục gốc
./dev.sh
```

Hoặc chạy thủ công 2 terminal:

```bash
# Terminal 1: backend
cd backend && source .venv/bin/activate
uvicorn main:app --reload --port 3002

# Terminal 2: frontend
cd frontend && npm run dev
```

Mở http://localhost:5173

### Bước 9: Tạo card đầu tiên

1. Trong web UI, click vào leaf deck (có `Part`) ở deck tree
2. Click **New Card** (hoặc `Ctrl+N`)
3. Điền `Word` (ví dụ: `你好`), các trường còn lại có thể để AI sinh
4. Click nút AI bên cạnh Pinyin/Sino/Definition/Examples để auto-fill

## Environment variables

| Variable | Required | Default | Mô tả |
|----------|----------|---------|-------|
| `ANKI_CONNECT_URL` | No | `http://localhost:8765` | URL AnkiConnect |
| `GEMINI_API_KEY` | Yes | — | Key Gemini cho AI |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | — | Path JSON service account GCP cho TTS |
| `AI_MONTHLY_LIMIT` | No | `1.0` | Giới hạn chi phí AI/tháng (USD) |
| `VITE_API_URL` | No | `http://localhost:3002` | URL backend (frontend build time) |

## Cấu trúc project

```
anki-ultimate-tool/
├── backend/               # FastAPI
│   ├── app/
│   │   ├── models/        # Pydantic models
│   │   ├── routers/       # anki, ai, audio, dict, study, chat
│   │   ├── services/      # Business logic (ai, anki, tts, srs, ...)
│   │   └── utils/         # deck_filter, field_cleaner, ...
│   ├── data/              # Cache (zdic_cache.json, chat history)
│   └── main.py
├── frontend/              # React 19 + Vite + Tailwind 4
│   └── src/
│       ├── api/           # API client
│       ├── components/    # UI (editor, scanner, study, ask-ai, ...)
│       ├── hooks/         # React Query hooks
│       └── pages/
├── docs/                  # Brainstorms, plans
├── plans/                 # Implementation reports
├── scripts/               # Shell scripts tiện ích
└── dev.sh                 # Chạy backend + frontend song song
```

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` / `Cmd+N` | New card |
| `Escape` | Close modal |

## Troubleshooting

### "Anki is not running or AnkiConnect not installed"
- Đảm bảo Anki Desktop đang mở
- Check add-on AnkiConnect đã cài và không bị disable
- Thử truy cập http://localhost:8765 trong browser

### "AI service not configured"
- Check `GEMINI_API_KEY` trong `backend/.env`
- Verify key tại https://aistudio.google.com/

### Deck tree trống
- Check root deck tên đúng `Chinese` (phân biệt hoa thường)
- Leaf deck phải có `Part` trong tên

### "Google TTS not configured"
- Check `GOOGLE_APPLICATION_CREDENTIALS` trỏ đúng file JSON
- Verify service account có quyền Cloud Text-to-Speech API

### AI usage limit exceeded
- Mặc định $1/tháng, tăng qua `AI_MONTHLY_LIMIT` trong `.env` hoặc Settings trong UI

## Tech stack

### Backend
- FastAPI + Uvicorn
- google-genai (Gemini)
- google-cloud-texttospeech
- opencc-python-reimplemented (Traditional → Simplified)
- beautifulsoup4 + lxml (zdic.net scraping)
- httpx (async HTTP)

### Frontend
- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4
- TanStack Query 5
- TipTap 3 (rich text editor)
- Axios, Lucide icons

## License

MIT
