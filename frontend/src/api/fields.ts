import { api } from './client';
import type { ScanMode } from './ai';

export interface FieldIssue {
  field_name: string;
  issue_type: string;
  original: string;
  position: number;
  context: string;
}

export interface CardIssue {
  note_id: number;
  card_id: number;
  word: string;
  pinyin: string;
  issues: FieldIssue[];
}

export interface ScanResult {
  total_cards: number;
  cards_with_issues: number;
  issues: CardIssue[];
}

export interface FixResult {
  fixed_cards: number;
  total_fields_fixed: number;
}

export interface SingleFixResult {
  fixed: boolean;
  fields_fixed: string[];
}

export interface FieldChange {
  field: string;
  original: string;
  cleaned: string;
}

export interface PreviewResult {
  note_id: number;
  word: string;
  has_changes: boolean;
  changes: FieldChange[];
}

export interface DeckHealthDetail {
  deck_id: number;
  deck_name: string;
  total_cards: number;
  cards_with_issues: CardIssue[];
  cards_without_audio: number;
}

export interface GlobalScanResult {
  total_decks: number;
  total_cards: number;
  cards_with_issues: number;
  cards_without_audio: number;
  decks: DeckHealthDetail[];
}

export const scanAllDecks = async (
  deckId?: number,
  mode: ScanMode = 'all'
): Promise<GlobalScanResult> => {
  const params = new URLSearchParams();
  if (deckId) params.set('deck_id', deckId.toString());
  if (mode !== 'all') params.set('mode', mode);
  const query = params.toString();
  const { data } = await api.get(`/anki/decks/scan-all${query ? '?' + query : ''}`, { timeout: 120000 });
  return data;
};

export const fixAllDecks = async (
  deckId?: number,
  mode: ScanMode = 'all'
): Promise<FixResult> => {
  const params = new URLSearchParams();
  if (deckId) params.set('deck_id', deckId.toString());
  if (mode !== 'all') params.set('mode', mode);
  const query = params.toString();
  const { data } = await api.post(`/anki/decks/fix-all${query ? '?' + query : ''}`, {}, { timeout: 120000 });
  return data;
};

export const scanDeckFields = async (deckId: number): Promise<ScanResult> => {
  const { data } = await api.get(`/anki/decks/${deckId}/scan`);
  return data;
};

export const fixDeckFields = async (deckId: number): Promise<FixResult> => {
  const { data } = await api.post(`/anki/decks/${deckId}/fix`);
  return data;
};

export const fixCardFields = async (noteId: number): Promise<SingleFixResult> => {
  const { data } = await api.post(`/anki/cards/${noteId}/fix`);
  return data;
};

export const previewCardFix = async (noteId: number): Promise<PreviewResult> => {
  const { data } = await api.get(`/anki/cards/${noteId}/preview`);
  return data;
};

export const getIssueTypeLabel = (issueType: string): string => {
  const labels: Record<string, string> = {
    // Space-related
    'nbsp_entity': '&nbsp;',
    'unicode_nbsp': 'NBSP (U+00A0)',
    'unicode_space': 'Unicode Space',
    'multiple_spaces': 'Multi Spaces',
    'zero_width': 'Zero-width',
    'leading_whitespace': 'Leading Space',
    'trailing_whitespace': 'Trailing Space',
    // HTML-related
    'trailing_br': 'Trailing <br>',
    'leading_br': 'Leading <br>',
    'excessive_br': 'Too many <br>',
    'empty_tag': 'Empty Tag',
    'whitespace_tag': 'Whitespace Tag',
    'nbsp_br_combo': '&nbsp;+<br>',
    'empty_li': 'Empty <li>',
    'br_before_close': '<br> before </tag>',
    'br_only_block': 'Only <br> block',
    // Nested/wrapper issues
    'deeply_nested': 'Nested Wrappers',
    'redundant_inline': 'Redundant Tags',
    'empty_attribute': 'Empty Attribute',
    'nested_empty_block': 'Nested Empty',
  };
  return labels[issueType] || issueType;
};

// Field suggestion types
export type FieldType = 'pinyin' | 'sino' | 'definition' | 'examples' | 'simplified';

export interface FieldSuggestionRequest {
  note_id: number;
  field_type: FieldType;
  word: string;
  pinyin?: string;
  definition?: string;
  preview_only?: boolean; // If true, don't apply the suggestion, just return it
}

export interface FieldSuggestionResponse {
  note_id: number;
  word: string;
  pinyin?: string;
  field_type: FieldType;
  suggestion: string;
  html?: string;
  source: 'dictionary' | 'ai' | 'local';
  confidence: number;
  cost?: number;
  alternatives?: string[];
  original_value?: string;
  is_already_simplified?: boolean;
}

export interface FieldStats {
  total: number;
  filled: number;
  missing: number;
}

export interface DeckFieldStats {
  deck_id: number | null;
  deck_name: string;
  pinyin: FieldStats;
  sino: FieldStats;
  definition: FieldStats;
  examples: FieldStats;
  simplified: FieldStats;
  audio: FieldStats;
}

export const suggestField = async (
  request: FieldSuggestionRequest
): Promise<FieldSuggestionResponse> => {
  const { data } = await api.post('/ai/suggest-field', request);
  return data;
};

export const applySuggestion = async (
  noteId: number,
  fieldName: string,
  value: string
): Promise<void> => {
  await api.post('/ai/apply-suggestion', {
    note_id: noteId,
    field_name: fieldName,
    value,
  });
};

export const getFieldStats = async (
  deckId?: number,
  mode?: ScanMode
): Promise<DeckFieldStats> => {
  const params = new URLSearchParams();
  if (deckId) params.set('deck_id', deckId.toString());
  if (mode) params.set('mode', mode);
  const { data } = await api.get(`/ai/field-stats?${params}`);
  return data;
};

export const getFillMissingStreamUrl = (
  deckId: number,
  fieldType: FieldType,
  mode: ScanMode,
  fillMode: 'missing' | 'all' = 'missing'
): string => {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
  return `${baseUrl}/api/ai/fill-missing-stream?deck_id=${deckId}&field_type=${fieldType}&mode=${mode}&fill_mode=${fillMode}`;
};
