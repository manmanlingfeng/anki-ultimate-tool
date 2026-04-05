/**
 * Chat API for Ask AI feature.
 * Handles streaming chat responses and conversation history.
 */

import { api } from './client';

// Types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatHistory {
  note_id: number;
  word: string;
  messages: ChatMessage[];
}

export interface PresetQuestion {
  id: string;
  label: string;
  card_type: 'single_char' | 'phrase' | 'all';
}

export interface ChatHealthResponse {
  available: boolean;
  model: string | null;
}

// SSE Event types
export interface ChatStreamStartEvent {
  note_id: number;
}

export interface ChatStreamChunkEvent {
  content: string;
}

export interface ChatStreamCompleteEvent {
  note_id: number;
}

export interface ChatStreamErrorEvent {
  message: string;
}

// API functions

/**
 * Check if chat service is available.
 */
export const checkChatHealth = async (): Promise<ChatHealthResponse> => {
  const { data } = await api.get('/chat/health');
  return data;
};

/**
 * Get preset questions for a word.
 */
export const getPresets = async (word?: string): Promise<{ presets: PresetQuestion[] }> => {
  const params = word ? { word } : {};
  const { data } = await api.get('/chat/presets', { params });
  return data;
};

/**
 * Get chat history for a card.
 */
export const getChatHistory = async (noteId: number): Promise<ChatHistory> => {
  const { data } = await api.get(`/chat/history/${noteId}`);
  return data;
};

/**
 * Clear chat history for a card.
 */
export const clearChatHistory = async (noteId: number): Promise<{ success: boolean }> => {
  const { data } = await api.delete(`/chat/history/${noteId}`);
  return data;
};

/**
 * Build URL for SSE chat stream.
 */
export const getChatStreamUrl = (params: {
  noteId: number;
  word: string;
  question: string;
  pinyin?: string;
  definition?: string;
  displayText?: string;
}): string => {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
  const searchParams = new URLSearchParams();

  searchParams.set('note_id', params.noteId.toString());
  searchParams.set('word', params.word);
  searchParams.set('question', params.question);

  if (params.pinyin) {
    searchParams.set('pinyin', params.pinyin);
  }
  if (params.definition) {
    searchParams.set('definition', params.definition);
  }
  if (params.displayText) {
    searchParams.set('display_text', params.displayText);
  }

  return `${baseUrl}/api/chat/ask-stream?${searchParams.toString()}`;
};
