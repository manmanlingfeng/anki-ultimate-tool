import { api } from './client';
import type { Card, CreateCardInput, UpdateCardInput } from '../types';

export interface NoteData {
  note_id: number;
  fields: Record<string, { value: string; order: number }>;
  tags?: string[];
}

export const fetchNote = async (noteId: number): Promise<NoteData> => {
  const { data } = await api.get(`/anki/notes/${noteId}`);
  return data;
};

// Paginated response from backend
export interface DeckCardsResponse {
  cards: Card[];
  total: number;
  has_more: boolean;
}

export interface FetchDeckCardsParams {
  deckId: number;
  includeChildren?: boolean;
  limit?: number;
  offset?: number;
}

export const fetchDeckCards = async ({
  deckId,
  includeChildren = true,
  limit = 50,
  offset = 0
}: FetchDeckCardsParams): Promise<DeckCardsResponse> => {
  const { data } = await api.get(`/anki/decks/${deckId}/cards`, {
    params: { include_children: includeChildren, limit, offset }
  });
  return data;
};

export const createCard = async (input: CreateCardInput): Promise<number> => {
  const { data } = await api.post('/anki/cards', input);
  return data.note_id;
};

export const updateCard = async (input: UpdateCardInput): Promise<void> => {
  await api.put(`/anki/cards/${input.note_id}`, input);
};

export const deleteCard = async (noteId: number): Promise<void> => {
  await api.delete(`/anki/cards/${noteId}`);
};

export const moveCards = async (cardIds: number[], targetDeck: string): Promise<void> => {
  await api.post('/anki/cards/move', { card_ids: cardIds, target_deck: targetDeck });
};

export interface DuplicateMatch {
  note_id: number;
  deck_name: string;
  word: string;
  pinyin: string;
}

export interface DuplicateCheckResult {
  exists: boolean;
  matches: DuplicateMatch[];
}

export const checkDuplicateWord = async (word: string, deckId?: number): Promise<DuplicateCheckResult> => {
  const params = new URLSearchParams({ word });
  if (deckId) {
    params.append('deck_id', String(deckId));
  }
  const { data } = await api.get(`/anki/cards/check-duplicate?${params}`);
  return data;
};

// Search types
export type SearchableField = 'Word' | 'Pinyin' | 'Definition' | 'Example' | 'Sino' | 'Simplified';

export interface SearchResult {
  note_id: number;
  card_id: number;
  deck_id: number;
  deck_name: string;
  word: string;
  pinyin: string;
  definition: string;
  matched_field: SearchableField;
  matched_value: string;
  has_audio: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  fields_searched: SearchableField[];
}

export interface SearchParams {
  query: string;
  deckIds?: number[];
  fields?: SearchableField[];
  limit?: number;
}

export const searchCards = async (params: SearchParams): Promise<SearchResponse> => {
  const urlParams = new URLSearchParams({ query: params.query });

  if (params.deckIds && params.deckIds.length > 0) {
    urlParams.append('deck_ids', params.deckIds.join(','));
  }

  if (params.fields && params.fields.length > 0) {
    urlParams.append('fields', params.fields.join(','));
  }

  if (params.limit) {
    urlParams.append('limit', String(params.limit));
  }

  const { data } = await api.get(`/anki/cards/search?${urlParams}`);
  return data;
};
