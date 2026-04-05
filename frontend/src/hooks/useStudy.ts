import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { startStudy, answerCard, endSession, type EaseRating } from '../api/study';
import type { StudySession, StudyCard } from '../types';

export type StudyState = 'idle' | 'loading' | 'front' | 'back' | 'answering' | 'complete' | 'error';

interface UseStudyReturn {
  state: StudyState;
  session: StudySession | null;
  currentCard: StudyCard | null;
  currentIndex: number;
  totalCards: number;
  isLoading: boolean;
  error: string | null;
  start: () => void;
  flip: () => void;
  answer: (ease: EaseRating) => void;
  reset: () => void;
  updateCurrentCardFields: (fields: Record<string, { value: string; order: number }>) => void;
}

export function useStudy(deckId: number | null | undefined): UseStudyReturn {
  const [state, setState] = useState<StudyState>('idle');
  const [session, setSession] = useState<StudySession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Track last answered card to prevent double-answering race condition
  const lastAnsweredCardRef = useRef<number | null>(null);
  // Track session ID for cleanup (avoid stale closure issues)
  const sessionIdRef = useRef<string | null>(null);

  // Current card from session
  const currentCard = session?.cards[currentIndex] ?? null;
  const totalCards = session?.total_due ?? 0;

  // Start session mutation
  const startMutation = useMutation({
    mutationFn: startStudy,
    onMutate: () => {
      setState('loading');
      setError(null);
    },
    onSuccess: (data) => {
      setSession(data);
      setCurrentIndex(0);
      setReviewedCount(0);
      lastAnsweredCardRef.current = null;
      sessionIdRef.current = data.session_id; // Track for cleanup
      if (data.cards.length > 0) {
        setState('front');
      } else {
        setState('complete');
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to start study session');
      setState('error');
    },
  });

  // Answer card mutation
  const answerMutation = useMutation({
    mutationFn: ({ cardId, ease }: { cardId: number; ease: EaseRating }) =>
      answerCard(session!.session_id, cardId, ease),
    onMutate: () => {
      setState('answering');
    },
    onSuccess: (data) => {
      setReviewedCount((prev) => prev + 1);
      if (data.remaining > 0 && data.next_card) {
        // Update session with next card from backend response
        setSession((prev) => {
          if (!prev) return null;
          // Remove the answered card, keep the rest
          const newCards = prev.cards.slice(1);
          return { ...prev, cards: newCards };
        });
        setCurrentIndex(0);
        setState('front');
      } else {
        // No more cards
        setState('complete');
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to answer card');
      setState('back'); // Go back to allow retry
    },
  });

  // Start study session
  const start = useCallback(() => {
    // deckId can be null/undefined for "all decks" mode
    startMutation.mutate(deckId ?? undefined);
  }, [deckId, startMutation]);

  // Flip card to show answer
  const flip = useCallback(() => {
    if (state === 'front') {
      setState('back');
    }
  }, [state]);

  // Answer card with ease rating
  const answer = useCallback(
    (ease: EaseRating) => {
      // Prevent double-answering the same card (race condition protection)
      if (!currentCard || lastAnsweredCardRef.current === currentCard.card_id) {
        return;
      }
      if (state === 'back' && session) {
        lastAnsweredCardRef.current = currentCard.card_id;
        answerMutation.mutate({ cardId: currentCard.card_id, ease });
      }
    },
    [state, currentCard, session, answerMutation]
  );

  // Reset session
  const reset = useCallback(() => {
    if (sessionIdRef.current) {
      endSession(sessionIdRef.current).catch(() => {
        // Ignore errors on cleanup
      });
      sessionIdRef.current = null;
    }
    setSession(null);
    setCurrentIndex(0);
    setReviewedCount(0);
    setError(null);
    setState('idle');
    lastAnsweredCardRef.current = null;
  }, []);

  // Update current card fields (after editing)
  const updateCurrentCardFields = useCallback(
    (fields: Record<string, { value: string; order: number }>) => {
      setSession((prev) => {
        if (!prev || !prev.cards[currentIndex]) return prev;
        const updatedCards = [...prev.cards];
        updatedCards[currentIndex] = {
          ...updatedCards[currentIndex],
          fields,
        };
        return { ...prev, cards: updatedCards };
      });
    },
    [currentIndex]
  );

  // Cleanup on unmount only (not on session change)
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current).catch(() => {
          // Ignore errors on cleanup
        });
      }
    };
  }, []); // Empty deps = only on unmount

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in input, textarea, or contenteditable (rich text editor)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.target instanceof HTMLElement && e.target.isContentEditable) {
        return;
      }

      if (e.key === ' ' && state === 'front') {
        e.preventDefault();
        flip();
      }

      if (state === 'back' && !answerMutation.isPending) {
        if (e.key === '1') answer(1);
        if (e.key === '2') answer(2);
        if (e.key === '3') answer(3);
        if (e.key === '4') answer(4);
      }

      if (e.key === 'Escape') {
        reset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, flip, answer, reset, answerMutation.isPending]);

  return {
    state,
    session,
    currentCard,
    currentIndex: reviewedCount, // Use reviewedCount for progress display
    totalCards,
    isLoading: startMutation.isPending || answerMutation.isPending,
    error,
    start,
    flip,
    answer,
    reset,
    updateCurrentCardFields,
  };
}
