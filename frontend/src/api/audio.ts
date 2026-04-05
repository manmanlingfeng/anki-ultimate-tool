import { api } from './client';
import type { HealthCheckResult, BatchJobStatus } from '../types';

export const checkTtsHealth = async (): Promise<boolean> => {
  const { data } = await api.get('/audio/health');
  return data.available;
};

export const runHealthCheck = async (deckId: number): Promise<HealthCheckResult> => {
  const { data } = await api.post(`/audio/check/${deckId}`);
  return data;
};

export const generateSingleAudio = async (
  deckId: number,
  noteId: number,
  word: string,
  index: number
): Promise<string> => {
  const { data } = await api.post('/audio/generate', {
    deck_id: deckId,
    note_id: noteId,
    word,
    index
  });
  return data.filename;
};

export interface PreviewAudioResult {
  filename: string;
  note_id: number;
}

export const generatePreviewAudio = async (
  deckId: number,
  noteId: number,
  word: string,
  index: number
): Promise<PreviewAudioResult> => {
  const { data } = await api.post('/audio/generate/preview', {
    deck_id: deckId,
    note_id: noteId,
    word,
    index
  });
  return { filename: data.filename, note_id: data.note_id };
};

export const applySingleAudio = async (noteId: number, filename: string): Promise<void> => {
  await api.post('/audio/apply/single', null, {
    params: { note_id: noteId, filename }
  });
};

export const discardAudioFile = async (filename: string): Promise<void> => {
  await api.post('/audio/discard', [filename]);
};

export const startBatchGenerate = async (
  deckId: number,
  regenerate: boolean = false
): Promise<string> => {
  const { data } = await api.post(`/audio/batch/${deckId}`, {
    regenerate_existing: regenerate
  });
  return data.job_id;
};

export const getBatchStatus = async (jobId: string): Promise<BatchJobStatus> => {
  const { data } = await api.get(`/audio/batch/${jobId}/status`);
  return data;
};

export const startAutoFix = async (deckId: number): Promise<string | null> => {
  const { data } = await api.post(`/audio/fix/${deckId}`);
  return data.job_id;
};

export interface Voice {
  id: string;
  name: string;
  gender: string;
  quality: string;
  provider: string;
}

export interface VoiceSettings {
  voices: Voice[];
  providers: string[];
  current: string;
  // Google settings
  speaking_rate: number;
  pitch: number;
  // Speech Actors settings
  style: string;
  available_styles: string[];
}

export interface VoiceSettingsUpdate {
  voice_id: string;
  // Google settings
  speaking_rate: number;
  pitch: number;
  // Speech Actors settings
  style: string;
}

export const getVoices = async (): Promise<VoiceSettings> => {
  const { data } = await api.get('/audio/voices');
  return data;
};

export const setVoice = async (settings: VoiceSettingsUpdate): Promise<void> => {
  await api.post('/audio/voices', settings);
};
