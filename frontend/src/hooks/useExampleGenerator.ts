import { useState, useRef, useCallback } from 'react';
import {
  applySuggestion,
  getExampleGeneratorStreamUrl,
  type ScanMode,
  type ExampleSentence,
  type ExampleStreamStartEvent,
  type ExampleStreamProgressEvent,
  type ExampleStreamResultEvent,
  type ExampleStreamCompleteEvent,
} from '../api/ai';

export interface ExampleResult {
  note_id: number;
  word: string;
  pinyin: string;
  examples: ExampleSentence[];
  html: string;
  status: 'pending' | 'approved' | 'skipped';
}

export interface UseExampleGeneratorReturn {
  results: ExampleResult[];
  isStreaming: boolean;
  progress: { current: number; total: number; word: string };
  currentIndex: number;
  estimatedCost: number;
  error: string | null;
  startStream: (deckId?: number, mode?: ScanMode) => void;
  stopStream: () => void;
  approveResult: (index: number) => Promise<void>;
  skipResult: (index: number) => void;
  approveAll: () => Promise<void>;
  skipAll: () => void;
  goToNext: () => void;
  goToPrev: () => void;
  setCurrentIndex: (index: number) => void;
  reset: () => void;
}

export function useExampleGenerator(): UseExampleGeneratorReturn {
  const [results, setResults] = useState<ExampleResult[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, word: '' });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    setResults([]);
    setProgress({ current: 0, total: 0, word: '' });
    setCurrentIndex(0);
    setEstimatedCost(0);
    setError(null);
  }, []);

  const startStream = useCallback((deckId?: number, mode: ScanMode = 'all') => {
    // Reset state
    reset();
    setIsStreaming(true);

    const eventSource = new EventSource(getExampleGeneratorStreamUrl(deckId, mode));
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('start', (e) => {
      const data: ExampleStreamStartEvent = JSON.parse(e.data);
      setProgress({ current: 0, total: data.total_cards, word: '' });
    });

    eventSource.addEventListener('progress', (e) => {
      const data: ExampleStreamProgressEvent = JSON.parse(e.data);
      setProgress(prev => ({
        current: data.current,
        total: data.total || prev.total,
        word: data.word,
      }));
    });

    eventSource.addEventListener('result', (e) => {
      const data: ExampleStreamResultEvent = JSON.parse(e.data);
      // Only add results that have examples
      if (data.examples && data.examples.length > 0) {
        setResults(prev => [...prev, {
          note_id: data.note_id,
          word: data.word,
          pinyin: data.examples[0]?.pinyin || '', // Use pinyin from first example
          examples: data.examples,
          html: data.html,
          status: 'pending',
        }]);
      }
    });

    eventSource.addEventListener('complete', (e) => {
      const data: ExampleStreamCompleteEvent = JSON.parse(e.data);
      setEstimatedCost(data.estimated_cost);
      setIsStreaming(false);
      eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
      // Check if it's a message event with data
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
  }, [reset]);

  const stopStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const approveResult = useCallback(async (index: number) => {
    const result = results[index];
    if (!result || result.status !== 'pending') return;

    try {
      await applySuggestion(result.note_id, 'Example', result.html);
      setResults(prev => prev.map((r, i) =>
        i === index ? { ...r, status: 'approved' } : r
      ));
    } catch (err) {
      console.error(`Failed to apply example for ${result.word}:`, err);
      setError(`Failed to apply example for "${result.word}": ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw err; // Re-throw so caller knows it failed
    }
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

    let failedCount = 0;
    for (const { result, index } of pendingResults) {
      try {
        await applySuggestion(result.note_id, 'Example', result.html);
        setResults(prev => prev.map((r, i) =>
          i === index ? { ...r, status: 'approved' } : r
        ));
      } catch (err) {
        console.error(`Failed to apply example for ${result.word}:`, err);
        failedCount++;
        // Continue with next card instead of stopping
      }
      // Small delay to prevent overwhelming Anki-Connect
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (failedCount > 0) {
      setError(`Failed to apply ${failedCount} examples. Check console for details.`);
    }
  }, [results]);

  const skipAll = useCallback(() => {
    setResults(prev => prev.map(r =>
      r.status === 'pending' ? { ...r, status: 'skipped' } : r
    ));
  }, []);

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
    estimatedCost,
    error,
    startStream,
    stopStream,
    approveResult,
    skipResult,
    approveAll,
    skipAll,
    goToNext,
    goToPrev,
    setCurrentIndex,
    reset,
  };
}
