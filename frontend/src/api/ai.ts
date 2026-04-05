import { api } from './client';

// Types

// Dictionary types from zdic.net
export interface ZdicReading {
  pinyin: string;        // e.g., "háng"
  meaning: string;       // e.g., "row, profession"
  is_common: boolean;    // Common vs rare reading
}

export interface ZdicEntry {
  word: string;                    // Chinese character(s)
  readings: ZdicReading[];         // All valid readings
  url: string;                     // Link to zdic.net page
  is_polyphonic: boolean;          // True if multiple readings
}

export interface PinyinIssue {
  note_id: number;
  word: string;
  field_name: string;
  current_pinyin: string;
  suggested_pinyin: string;
  reason: string;
  confidence: number;
  // Dictionary reference from zdic.net
  zdic_entry?: ZdicEntry;
  is_polyphonic: boolean;
  all_valid_readings: string[];
}

export interface PinyinCheckResponse {
  total_checked: number;
  issues_found: number;
  issues: PinyinIssue[];
  estimated_cost: number;
  error?: string;  // Error message if API failed
}

export interface DeckPinyinResult {
  deck_id: number;
  deck_name: string;
  issues: PinyinIssue[];
}

export interface MultiDeckPinyinResult {
  total_decks: number;
  total_checked: number;
  issues_found: number;
  estimated_cost: number;
  error?: string;
  decks: DeckPinyinResult[];
}

export interface CostEstimate {
  card_count: number;
  estimated_tokens: number;
  estimated_cost: number;
}

export interface AIHealth {
  available: boolean;
  model: string | null;
  limit_reached?: boolean;
  usage_percent?: number;
}

export interface AIUsage {
  month: string;
  total_cost: number;
  total_requests: number;
  total_tokens: number;
  monthly_limit: number;
  remaining: number;
  limit_reached: boolean;
  usage_percent: number;
  last_request: string | null;
}

// API functions
export const checkAIHealth = async (): Promise<AIHealth> => {
  const { data } = await api.get('/ai/health');
  return data;
};

export const estimateCost = async (deckId: number): Promise<CostEstimate> => {
  const { data } = await api.get(`/ai/estimate/${deckId}`);
  return data;
};

export const checkPinyin = async (
  deckId: number,
  cardIds?: number[]
): Promise<PinyinCheckResponse> => {
  const { data } = await api.post('/ai/pinyin-check', {
    deck_id: deckId,
    card_ids: cardIds || null,
  }, { timeout: 120000 }); // 2 min timeout for large decks
  return data;
};

export const applySuggestion = async (
  noteId: number,
  fieldName: string,
  value: string
): Promise<{ success: boolean; note_id: number }> => {
  const { data } = await api.post('/ai/apply-suggestion', {
    note_id: noteId,
    field_name: fieldName,
    value,
  });
  return data;
};

export const checkPinyinAll = async (): Promise<MultiDeckPinyinResult> => {
  const { data } = await api.post('/ai/pinyin-check-all', {}, { timeout: 300000 }); // 5 min timeout
  return data;
};

export const estimateCostAll = async (): Promise<CostEstimate> => {
  const { data } = await api.get('/ai/estimate-all');
  return data;
};

export const getAIUsage = async (): Promise<AIUsage> => {
  const { data } = await api.get('/ai/usage');
  return data;
};

export const setAILimit = async (limit: number): Promise<{ success: boolean; new_limit: number }> => {
  const { data } = await api.post('/ai/usage/limit', { limit });
  return data;
};

// Scan mode types
export type ScanMode = 'all' | 'deck' | 'with_children' | 'children_only';

// Streaming endpoint URL for progressive pinyin check (all decks)
export const getPinyinCheckStreamUrl = (
  deckId?: number,
  mode: ScanMode = 'all'
): string => {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
  const params = new URLSearchParams();
  if (deckId) params.set('deck_id', deckId.toString());
  if (mode !== 'all') params.set('mode', mode);
  const query = params.toString();
  return `${baseUrl}/api/ai/pinyin-check-all-stream${query ? '?' + query : ''}`;
};

// Streaming endpoint URL for single deck pinyin check
export const getPinyinCheckDeckStreamUrl = (deckId: number): string => {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
  return `${baseUrl}/api/ai/pinyin-check-stream/${deckId}`;
};

// SSE Event types
export interface StreamStartEvent {
  total_decks: number;
  decks: Array<{ deck_id: number; deck_name: string; card_count: number }>;
}

export interface StreamProgressEvent {
  deck_id: number;
  deck_name: string;
  current: number;
  total: number;
}

export interface StreamResultEvent {
  deck_id: number;
  deck_name: string;
  issues: PinyinIssue[];
  cards_checked: number;
}

export interface StreamCompleteEvent {
  total_checked: number;
  issues_found: number;
  estimated_cost: number;
}

export interface StreamErrorEvent {
  message: string;
}

// Single deck stream event types
export interface DeckStreamStartEvent {
  total_cards: number;
  total_batches: number;
  deck_name: string;
}

export interface DeckStreamProgressEvent {
  batch: number;
  total_batches: number;
  cards_processed: number;
}

export interface DeckStreamResultEvent {
  issues: PinyinIssue[];
}

// Example generation types
export interface ExampleSentence {
  chinese: string;
  pinyin: string;
  sino: string;  // Sino-Vietnamese (Han-Viet)
  vietnamese: string;
}

export interface GenerateExamplesRequest {
  note_id: number;
  word: string;
  pinyin: string;
  definition: string;
}

export interface GenerateExamplesResponse {
  note_id: number;
  examples: ExampleSentence[];
  html: string;  // Pre-formatted HTML for RichTextEditor
  estimated_cost: number;
}

// Example generation API
export const generateExamples = async (
  request: GenerateExamplesRequest
): Promise<GenerateExamplesResponse> => {
  const { data } = await api.post('/ai/generate-examples', request, { timeout: 30000 });
  return data;
};

// Streaming endpoint URL for batch example generation
export const getExampleGeneratorStreamUrl = (
  deckId?: number,
  mode: ScanMode = 'all'
): string => {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
  const params = new URLSearchParams();
  if (deckId) params.set('deck_id', deckId.toString());
  if (mode !== 'all') params.set('mode', mode);
  const query = params.toString();
  return `${baseUrl}/api/ai/generate-examples-stream${query ? '?' + query : ''}`;
};

// Example generation SSE event types
export interface ExampleStreamStartEvent {
  total_cards: number;
  deck_name: string;
}

export interface ExampleStreamProgressEvent {
  current: number;
  total: number;
  word: string;
}

export interface ExampleStreamResultEvent {
  note_id: number;
  word: string;
  examples: ExampleSentence[];
  html: string;
}

export interface ExampleStreamCompleteEvent {
  total_processed: number;
  total_generated: number;
  estimated_cost: number;
  message?: string;
}

// Verify field types
export type OperationMode = 'fill_missing' | 'regenerate_all' | 'verify';

export interface VerifyResult {
  note_id: number;
  word: string;
  pinyin: string;
  field_type: string;
  is_correct: boolean;
  current_value: string;
  suggested_value?: string;
  reason?: string;
  confidence: number;
  issues?: string[];
}

export function getVerifyFieldStreamUrl(
  deckId: number | undefined,
  fieldType: string,
  mode: ScanMode
): string {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
  const base = `${baseUrl}/api/ai/verify-field-stream?field_type=${fieldType}`;
  if (mode === 'all') return `${base}&mode=all`;
  if (deckId) return `${base}&deck_id=${deckId}&mode=${mode}`;
  return base;
}
