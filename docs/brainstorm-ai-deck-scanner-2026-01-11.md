# Brainstorm: AI-Powered Deck Scanner

**Date:** 2026-01-11
**Status:** Approved
**Estimated Cost:** ~$0.03 per 2000 cards (Gemini Flash)

---

## Problem Statement

Current deck scanner uses regex patterns to detect formatting issues (nbsp, empty tags, etc.). User wants smarter AI-powered detection for:
- Content quality issues (wrong pinyin, bad translations)
- Semantic problems (duplicates, inconsistencies)
- Content generation (missing examples)

## Requirements

1. **Fast & cheap** - Use Gemini Flash API (~$0.10/1M tokens)
2. **Modular tasks** - Separate AI operations user can choose from
3. **Two-level UI** - Deck-level batch operations + card-level single actions
4. **Suggest fixes** - AI proposes corrections, user approves before applying
5. **Scope control** - Run on all cards, filtered cards, or selected cards

---

## Solution: Modular AI Tasks

### 5 AI Tasks

| # | Task | Description | Level |
|---|------|-------------|-------|
| 1 | **Pinyin Checker** | Verify pinyin matches Chinese chars, correct tones | Deck + Card |
| 2 | **Weird Char Scanner** | AI detection of unusual/wrong characters | Deck only |
| 3 | **Example Generator** | Generate example sentences for cards | Deck + Card |
| 4 | **Content Improver** | Suggest better definitions, tips | Card only |
| 5 | **Duplicate Detector** | Find semantically similar cards | Deck only |

---

## Architecture

### Backend Endpoints

```
POST /api/ai/pinyin-check
  - Input: { deck_id, card_ids? }
  - Output: [{ note_id, current, suggested, confidence }]

POST /api/ai/char-scan
  - Input: { deck_id, card_ids? }
  - Output: [{ note_id, field, issue, suggestion }]

POST /api/ai/generate-examples
  - Input: { deck_id, card_ids? } OR { note_id }
  - Output: [{ note_id, example, context }]

POST /api/ai/improve-content
  - Input: { note_id }
  - Output: { suggestions: [{ field, current, suggested, reason }] }

POST /api/ai/find-duplicates
  - Input: { deck_id }
  - Output: [{ note_ids, words, similarity, reason }]

POST /api/ai/apply-suggestion
  - Input: { note_id, field, value }
  - Output: { success }
```

### Gemini Integration

```python
# Backend service: app/services/ai_service.py

class AIService:
    def __init__(self):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        self.model = "gemini-2.0-flash"

    async def check_pinyin(self, cards: list[Card]) -> list[PinyinIssue]:
        # Batch cards, call Gemini with structured output
        pass

    async def generate_example(self, word: str, definition: str) -> str:
        # Single card example generation
        pass
```

### Cost Estimation

| Deck Size | Pinyin Check | Char Scan | Examples | Duplicates |
|-----------|-------------|-----------|----------|------------|
| 100 cards | $0.002 | $0.001 | $0.005 | $0.003 |
| 500 cards | $0.01 | $0.005 | $0.025 | $0.015 |
| 2000 cards | $0.03 | $0.02 | $0.10 | $0.05 |

---

## UI Design

### Deck Level: AI Tools Panel

Location: Below Audio Panel in main content area

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 AI Tools                                          [▼]  │
├─────────────────────────────────────────────────────────────┤
│  Scope: (●) All Cards  ( ) With Issues  ( ) Selected       │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ ✓ Pinyin     │ │ 🔍 Char      │ │ 📝 Generate  │        │
│  │   Checker    │ │   Scanner    │ │   Examples   │        │
│  │ [Run ~$0.02] │ │ [Run ~$0.01] │ │ [Run ~$0.05] │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                              │
│  ┌──────────────┐                                           │
│  │ 🔄 Find      │                                           │
│  │  Duplicates  │                                           │
│  │ [Run ~$0.02] │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### Card Level: AI Actions in Detail Panel

Location: CardDetailPanel sidebar

```
┌─────────────────────────────────────────────────────────────┐
│  AI Actions                                                  │
├─────────────────────────────────────────────────────────────┤
│  [✓ Check Pinyin]  [📝 Generate Example]  [💡 Improve]     │
└─────────────────────────────────────────────────────────────┘
```

### AI Results Modal

```
┌─────────────────────────────────────────────────────────────┐
│  Pinyin Check Results                               [X]     │
├─────────────────────────────────────────────────────────────┤
│  Found 5 issues                                             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐│
│  │ 你好                                                    ││
│  │ Current:   ní háo                                       ││
│  │ Suggested: nǐ hǎo                                       ││
│  │ Reason:    Wrong tones (你=3rd, 好=3rd)                 ││
│  │ Confidence: 95%                                         ││
│  │                            [Accept] [Edit] [Skip]       ││
│  └────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌────────────────────────────────────────────────────────┐│
│  │ 再见                                                    ││
│  │ ...                                                     ││
│  └────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│                    [Accept All (5)] [Close]                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Backend Foundation
- [ ] Add `google-generativeai` to requirements
- [ ] Create `AIService` class with Gemini client
- [ ] Implement batching logic (50 cards per request)
- [ ] Add structured JSON output parsing

### Phase 2: Pinyin Checker (MVP)
- [ ] Backend endpoint `/api/ai/pinyin-check`
- [ ] Prompt engineering for Chinese pinyin validation
- [ ] Frontend: AI Tools panel with Pinyin Checker
- [ ] Results modal with accept/reject

### Phase 3: Other Batch Tasks
- [ ] Weird Char Scanner
- [ ] Example Generator (batch mode)
- [ ] Duplicate Detector

### Phase 4: Card-Level Actions
- [ ] Add AI action buttons to CardDetailPanel
- [ ] Single-card Example Generator
- [ ] Content Improver

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| API rate limits | Scanning blocked | Implement backoff, batch wisely |
| Wrong AI suggestions | Bad data in cards | Always require user approval |
| Cost overrun | Unexpected bills | Show cost estimate, confirm before run |
| Gemini unavailable | Feature broken | Graceful fallback, clear error message |

---

## Success Metrics

1. **Accuracy**: >90% of AI pinyin corrections are correct
2. **Adoption**: Users run AI scan on >50% of deck reviews
3. **Cost efficiency**: Average cost <$0.05 per scan session
4. **User satisfaction**: AI suggestions accepted >70% of time

---

## Dependencies

- Gemini API key (user provides or project default)
- `google-generativeai` Python package
- Environment variable: `GEMINI_API_KEY`

---

## Next Steps

1. Create detailed implementation plan
2. Start with Phase 1 + 2 (Backend + Pinyin Checker MVP)
3. Test with real Chinese flashcard data
4. Iterate based on accuracy feedback
