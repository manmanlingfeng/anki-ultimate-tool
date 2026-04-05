# Brainstorm: Custom Study Mode via AnkiConnect

**Date:** 2026-01-12
**Status:** Agreed
**Participants:** User, Claude

---

## Problem Statement

User wants to implement Anki-like study functionality within the web app, allowing card review without switching to native Anki GUI.

## Requirements

1. Study cards with proper SRS scheduling (matching Anki's exact algorithm)
2. Support review cards only (queue=2, graduated cards)
3. Include session statistics and tracking
4. Include AI hints for difficult cards
5. Start with basic version, iterate

## Evaluated Approaches

### Option A: Remote Control Anki (Rejected)
- Use `guiDeckReview`, `guiAnswerCard` to control Anki's native reviewer
- **Pros:** Uses Anki's exact algorithm
- **Cons:** Requires Anki window visible/focused, poor UX

### Option B: Custom UI with guiAnswerCard (Rejected)
- Build custom card display but still use `guiAnswerCard`
- **Cons:** Anki must be in review mode, card must match current reviewer

### Option C: Custom UI with setDueDate (Selected) ✅
- Fetch due cards via `findCards`
- Display in custom web UI
- Calculate intervals using Anki's SM-2 algorithm
- Update via `setDueDate` + `setEaseFactors`
- **Pros:** Fully independent UI, exact SRS match possible
- **Cons:** More complex implementation

## Final Recommended Solution

### Architecture

```
Frontend (React)              Backend (FastAPI)           Anki
     │                              │                       │
     │── Start Study ──────────────>│                       │
     │                              │── findCards(query) ──>│
     │                              │<── card IDs ──────────│
     │                              │── cardsInfo(ids) ────>│
     │<── Session + Cards ──────────│<── card data ─────────│
     │                              │                       │
     │ [User studies cards]         │                       │
     │                              │                       │
     │── Answer(card, ease) ───────>│                       │
     │                              │ Calculate new ivl/ease│
     │                              │── setDueDate ────────>│
     │                              │── setEaseFactors ────>│
     │<── Next card ────────────────│<── OK ────────────────│
```

### Scope

| Card State | Support | Reason |
|------------|---------|--------|
| Review (queue=2) | ✅ | Main use case, clean implementation |
| New (queue=0) | ❌ | Learning steps complex, use native Anki |
| Learning (queue=1) | ❌ | State transitions complex |
| Relearning (queue=3) | ❌ | Lapse handling complex |

### SRS Algorithm (Anki SM-2 Compatible)

```python
def calculate_next_review(
    interval: int,      # Current interval in days
    factor: int,        # Ease factor (2500 = 250%)
    days_overdue: int,  # How late the review is
    ease: int           # 1=Again, 2=Hard, 3=Good, 4=Easy
) -> tuple[int, int]:   # (new_interval_days, new_factor)

    if ease == 1:  # Again - failed
        new_ivl = 1
        new_factor = max(1300, factor - 200)

    elif ease == 2:  # Hard
        new_ivl = max(interval + 1, int(interval * 1.2))
        new_factor = max(1300, factor - 150)

    elif ease == 3:  # Good
        delay_bonus = days_overdue // 2
        new_ivl = max(interval + 1, int((interval + delay_bonus) * factor / 1000))
        new_factor = factor

    else:  # ease == 4, Easy
        delay_bonus = days_overdue
        new_ivl = max(interval + 1, int((interval + delay_bonus) * factor / 1000 * 1.3))
        new_factor = min(factor + 150, 3000)  # Cap at 300%

    # Apply fuzz factor
    new_ivl = apply_fuzz(new_ivl)

    # Cap at max interval
    new_ivl = min(new_ivl, 36500)

    return new_ivl, new_factor


def apply_fuzz(ivl: int) -> int:
    """Add random variation to prevent card clustering"""
    import random

    if ivl < 2:
        return ivl
    elif ivl == 2:
        return random.randint(2, 3)
    elif ivl < 7:
        fuzz = max(1, int(ivl * 0.25))
    elif ivl < 30:
        fuzz = max(2, int(ivl * 0.15))
    else:
        fuzz = max(4, int(ivl * 0.05))

    return ivl + random.randint(-fuzz, fuzz)
```

### UI Design

```
┌─────────────────────────────────────────────────────────────────┐
│ Study: Chinese::HSK1                               12/47 cards  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 25%           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                           你好                                  │
│                                                                 │
│                                                                 │
│                      [Show Answer]                              │
│                      (or press Space)                           │
│                                                                 │
│   🔊 Play Audio    💡 AI Hint                                   │
├─────────────────────────────────────────────────────────────────┤
│   [1 Again]    [2 Hard]     [3 Good]     [4 Easy]              │
│      1d           3d           7d          14d                  │
└─────────────────────────────────────────────────────────────────┘

After revealing answer:
┌─────────────────────────────────────────────────────────────────┐
│                           你好                                  │
│                          nǐ hǎo                                │
│                                                                 │
│                          Hello                                  │
│                                                                 │
│   🔊 Play Audio                                                 │
├─────────────────────────────────────────────────────────────────┤
│   [1 Again]    [2 Hard]     [3 Good]     [4 Easy]              │
│      1d           3d           7d          14d                  │
└─────────────────────────────────────────────────────────────────┘
```

### Features

#### Phase 1: Core Study (MVP)
- [ ] Fetch due review cards for deck
- [ ] Card display with front/back flip
- [ ] Four answer buttons with interval preview
- [ ] SRS calculation matching Anki algorithm
- [ ] Update cards via setDueDate + setEaseFactors
- [ ] Session progress indicator
- [ ] Keyboard shortcuts (Space, 1-4)
- [ ] Audio playback for cards with audio

#### Phase 2: Statistics
- [ ] Cards reviewed today
- [ ] Review streak tracking
- [ ] Time spent studying
- [ ] Accuracy rate (Again vs other)
- [ ] Due forecast chart

#### Phase 3: AI Hints
- [ ] "Hint" button for difficult cards
- [ ] AI generates contextual hints without revealing answer
- [ ] Examples: mnemonics, related words, character breakdown

### API Design

```typescript
// Start study session
POST /api/study/start
Request: { deck_id: number }
Response: {
  session_id: string,
  cards: StudyCard[],
  total_due: number
}

// Answer card
POST /api/study/answer
Request: {
  session_id: string,
  card_id: number,
  ease: 1 | 2 | 3 | 4
}
Response: {
  new_interval: number,
  new_factor: number,
  next_card: StudyCard | null,
  remaining: number
}

// Get AI hint
POST /api/study/hint
Request: { card_id: number }
Response: { hint: string }

// Get study stats
GET /api/study/stats?deck_id={id}
Response: {
  due_today: number,
  reviewed_today: number,
  streak_days: number,
  accuracy_rate: number
}
```

### File Structure

```
backend/app/
├── routers/
│   └── study.py          # New study endpoints
├── services/
│   └── srs.py            # SRS algorithm implementation
└── models/
    └── study.py          # Pydantic models

frontend/src/
├── pages/
│   └── Study.tsx         # Study page (or modal)
├── components/study/
│   ├── StudyCard.tsx     # Card display component
│   ├── AnswerButtons.tsx # Rating buttons
│   ├── StudyProgress.tsx # Progress bar
│   ├── StudyStats.tsx    # Statistics display
│   └── AIHint.tsx        # AI hint component
├── hooks/
│   └── useStudy.ts       # Study session logic
└── api/
    └── study.ts          # API client functions
```

## Implementation Considerations

### Risks

| Risk | Mitigation |
|------|------------|
| SRS mismatch with native Anki | Extensive testing, compare with Anki's calculations |
| Card state corruption | Only modify review cards, validate before update |
| Session interruption | Auto-save progress, resume capability |
| Overdue calculation errors | Careful date handling, timezone awareness |

### Edge Cases

1. **Card becomes due during session** - Don't add mid-session, show on refresh
2. **Card modified in Anki during session** - Fetch fresh data before answering
3. **Network failure during answer** - Retry logic, local queue
4. **User closes mid-session** - Progress auto-saved

### Success Metrics

- User can complete study session without errors
- Intervals match what Anki would calculate (within fuzz range)
- Cards appear in Anki with correct due dates after study
- Session completes in reasonable time (<50ms per card update)

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Review cards only | Learning steps too complex, diminishing returns |
| Custom UI over Anki control | Better UX, no Anki window needed |
| Match exact Anki algorithm | User requirement, ensures consistency |
| Start with basic, add features | Iterative development, validate core first |

## Next Steps

1. Create implementation plan with `/plan:fast`
2. Implement backend SRS algorithm with tests
3. Build frontend study UI
4. Add statistics tracking
5. Integrate AI hints

## Sources

- [Anki SM-2 Algorithm](https://juliensobczak.com/inspect/2022/05/30/anki-srs/)
- [AnkiConnect API](https://git.sr.ht/~foosoft/anki-connect)
- [SM-2 Algorithm Explained](https://tegaru.app/en/blog/sm2-algorithm-explained)
- [RemNote Anki Algorithm Guide](https://help.remnote.com/en/articles/6026144-the-anki-sm-2-spaced-repetition-algorithm)
