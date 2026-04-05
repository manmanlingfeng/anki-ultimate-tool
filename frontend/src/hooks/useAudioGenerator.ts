import { useState, useRef, useCallback } from 'react';
import { api } from '../api/client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

// SSE Event types
interface AudioStreamStartEvent {
  total_cards: number;
  stream_id: string;
}

interface AudioStreamProgressEvent {
  current: number;
  total: number;
  word: string;
}

interface AudioStreamResultEvent {
  note_id: number;
  word: string;
  filename: string;
  index: number;
}

interface AudioStreamCompleteEvent {
  total_generated: number;
}

export interface AudioResult {
  note_id: number;
  word: string;
  filename: string;
  index: number;
  status: 'pending' | 'approved' | 'skipped';
}

export interface UseAudioGeneratorReturn {
  results: AudioResult[];
  isStreaming: boolean;
  progress: { current: number; total: number; word: string };
  currentIndex: number;
  streamId: string | null;
  error: string | null;
  startStream: (deckId: number, regenerate?: boolean) => void;
  stopStream: () => void;
  approveResult: (index: number) => Promise<void>;
  skipResult: (index: number) => void;
  approveAll: () => Promise<void>;
  skipAll: () => void;
  discardRejected: () => Promise<void>;
  goToNext: () => void;
  goToPrev: () => void;
  setCurrentIndex: (index: number) => void;
  reset: () => void;
}

export function useAudioGenerator(): UseAudioGeneratorReturn {
  const [results, setResults] = useState<AudioResult[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, word: '' });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    setResults([]);
    setProgress({ current: 0, total: 0, word: '' });
    setCurrentIndex(0);
    setStreamId(null);
    setError(null);
  }, []);

  const startStream = useCallback((deckId: number, regenerate: boolean = false) => {
    // Reset state
    reset();
    setIsStreaming(true);

    const url = `${API_BASE}/api/audio/stream/${deckId}?regenerate=${regenerate}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('start', (e) => {
      const data: AudioStreamStartEvent = JSON.parse(e.data);
      setProgress({ current: 0, total: data.total_cards, word: '' });
      setStreamId(data.stream_id);
    });

    eventSource.addEventListener('progress', (e) => {
      const data: AudioStreamProgressEvent = JSON.parse(e.data);
      setProgress({
        current: data.current,
        total: data.total,
        word: data.word,
      });
    });

    eventSource.addEventListener('result', (e) => {
      const data: AudioStreamResultEvent = JSON.parse(e.data);
      setResults(prev => [...prev, {
        note_id: data.note_id,
        word: data.word,
        filename: data.filename,
        index: data.index,
        status: 'pending',
      }]);
    });

    eventSource.addEventListener('complete', (e) => {
      const data: AudioStreamCompleteEvent = JSON.parse(e.data);
      console.log(`Audio generation complete: ${data.total_generated} files`);
      setIsStreaming(false);
      eventSource.close();
    });

    eventSource.addEventListener('stopped', () => {
      setIsStreaming(false);
      eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
      const event = e as MessageEvent;
      if (event.data) {
        try {
          const data = JSON.parse(event.data);
          setError(data.message || 'Stream error');
        } catch {
          setError('Connection error');
        }
      } else {
        setError('Connection lost');
      }
      setIsStreaming(false);
      eventSource.close();
    });

    eventSource.addEventListener('item_error', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      console.warn(`Error generating audio for "${data.word}": ${data.error}`);
    });
  }, [reset]);

  const stopStream = useCallback(async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Also notify backend to stop
    if (streamId) {
      try {
        await api.post(`/api/audio/stream/${streamId}/stop`);
      } catch {
        // Ignore errors
      }
    }

    setIsStreaming(false);
  }, [streamId]);

  const approveResult = useCallback(async (index: number) => {
    const result = results[index];
    if (!result || result.status !== 'pending') return;

    // Apply audio to card
    await api.post('/api/audio/apply', {
      items: [{ note_id: result.note_id, filename: result.filename }]
    });

    setResults(prev => prev.map((r, i) =>
      i === index ? { ...r, status: 'approved' } : r
    ));
  }, [results]);

  const skipResult = useCallback((index: number) => {
    setResults(prev => prev.map((r, i) =>
      i === index ? { ...r, status: 'skipped' } : r
    ));
  }, []);

  const approveAll = useCallback(async () => {
    const pendingResults = results
      .map((r, i) => ({ result: r, index: i }))
      .filter(({ result }) => result.status === 'pending');

    if (pendingResults.length === 0) return;

    // Batch apply all pending
    const items = pendingResults.map(({ result }) => ({
      note_id: result.note_id,
      filename: result.filename
    }));

    await api.post('/api/audio/apply', { items });

    // Update all to approved
    setResults(prev => prev.map(r =>
      r.status === 'pending' ? { ...r, status: 'approved' } : r
    ));
  }, [results]);

  const skipAll = useCallback(() => {
    setResults(prev => prev.map(r =>
      r.status === 'pending' ? { ...r, status: 'skipped' } : r
    ));
  }, []);

  const discardRejected = useCallback(async () => {
    const skippedFiles = results
      .filter(r => r.status === 'skipped')
      .map(r => r.filename);

    if (skippedFiles.length > 0) {
      try {
        await api.post('/api/audio/discard', skippedFiles);
      } catch {
        // Ignore errors
      }
    }
  }, [results]);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => Math.min(prev + 1, results.length - 1));
  }, [results.length]);

  const goToPrev = useCallback(() => {
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  }, []);

  return {
    results,
    isStreaming,
    progress,
    currentIndex,
    streamId,
    error,
    startStream,
    stopStream,
    approveResult,
    skipResult,
    approveAll,
    skipAll,
    discardRejected,
    goToNext,
    goToPrev,
    setCurrentIndex,
    reset,
  };
}
