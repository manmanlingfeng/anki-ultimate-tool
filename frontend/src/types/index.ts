export interface DeckNode {
  name: string;
  full_name: string;
  deck_id: number;
  total_cards: number;
  has_overflow: boolean;
  children: DeckNode[];
}

export interface CardField {
  value: string;
  order: number;
}

export interface Card {
  card_id: number;
  note_id: number;
  deck_name: string;
  fields: Record<string, CardField>;
  audio_file: string | null;
  audio_index: number;
}

export interface CreateCardInput {
  deck_name: string;
  word: string;
  pinyin: string;
  sino: string;
  definition: string;
  tip?: string;
  example?: string;
  simplified?: string;
  audio_filename?: string;
}

export interface UpdateCardInput {
  note_id: number;
  fields: Record<string, string>;
}

export interface HealthCheckResult {
  deck_id: number;
  deck_name: string;
  total_cards: number;
  cards_with_audio: number;
  cards_missing_audio: number;
  cards_wrong_index: number;
  orphaned_audio: number;
  issues: AudioIssue[];
}

export interface AudioIssue {
  type: 'missing' | 'wrong_index' | 'file_missing' | 'orphaned';
  card_id?: number;
  note_id?: number;
  index: number;
  word?: string;
  expected?: string;
  current?: string;
  filename?: string;
}

export interface BatchJobStatus {
  status: 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  errors: unknown[];
  error?: string;
}

// Study types
export interface StudyCard {
  card_id: number;
  note_id: number;
  deck_name: string;
  fields: Record<string, CardField>;
  audio_file: string | null;
  interval: number;
  factor: number;
  due: number;
  queue: number;  // 1=learning, 2=review
  days_overdue: number;
  next_reviews: string[];  // Anki's interval labels [Again, Hard, Good, Easy]
}

export interface StudySession {
  session_id: string;
  deck_name: string;
  cards: StudyCard[];
  total_due: number;
}

export interface IntervalPreview {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export interface AnswerResponse {
  new_interval: number;
  new_factor: number;
  next_card: StudyCard | null;
  remaining: number;
}
