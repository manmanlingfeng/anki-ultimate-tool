import { api } from './client';
import type { DeckNode } from '../types';

export const fetchDeckTree = async (): Promise<DeckNode[]> => {
  const { data } = await api.get('/anki/decks/tree');
  return data;
};

export const checkAnkiHealth = async (): Promise<boolean> => {
  try {
    await api.get('/anki/health');
    return true;
  } catch {
    return false;
  }
};

/**
 * Synchronize local Anki collection with AnkiWeb.
 * This can take several seconds depending on collection size.
 */
export const syncAnki = async (): Promise<void> => {
  await api.post('/anki/sync');
};

export const createDeck = async (deckName: string): Promise<number> => {
  const { data } = await api.post('/anki/decks', { deck_name: deckName });
  return data.deck_id;
};
