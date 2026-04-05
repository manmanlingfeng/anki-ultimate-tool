import { api } from './client';
import type { StudySession, IntervalPreview, AnswerResponse } from '../types';

export type EaseRating = 1 | 2 | 3 | 4;

export interface DeckDueCount {
  deck_id: number;
  deck_name: string;
  due_count: number;
}

export interface DueCountsResponse {
  total_due: number;
  decks: DeckDueCount[];
}

/**
 * Start a study session.
 * @param deckId - Deck ID to study, or null/undefined to study all decks
 */
export const startStudy = async (deckId?: number | null): Promise<StudySession> => {
  const { data } = await api.post('/study/start', { deck_id: deckId ?? null });
  return data;
};

export const answerCard = async (
  sessionId: string,
  cardId: number,
  ease: EaseRating
): Promise<AnswerResponse> => {
  const { data } = await api.post('/study/answer', {
    session_id: sessionId,
    card_id: cardId,
    ease,
  });
  return data;
};

export const previewIntervals = async (cardId: number): Promise<IntervalPreview> => {
  const { data } = await api.post('/study/preview', { card_id: cardId });
  return data;
};

export const getDueCount = async (deckId: number): Promise<number> => {
  const { data } = await api.get(`/study/due-count/${deckId}`);
  return data.due_count;
};

export const endSession = async (sessionId: string): Promise<void> => {
  await api.delete(`/study/session/${sessionId}`);
};

/**
 * Get due card counts for all decks.
 */
export const fetchDueCounts = async (): Promise<DueCountsResponse> => {
  const { data } = await api.get('/study/due-counts');
  return data;
};

/**
 * Format interval in days to human-readable string.
 */
export const formatInterval = (days: number): string => {
  if (days === 1) return '1d';
  if (days < 30) return `${days}d`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months}mo`;
  }
  const years = days / 365;
  if (years === Math.floor(years)) {
    return `${Math.floor(years)}y`;
  }
  return `${years.toFixed(1)}y`;
};
