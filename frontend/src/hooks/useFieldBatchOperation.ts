import { useState, useRef, useCallback } from 'react';
import { getFillMissingStreamUrl, type FieldType, type FieldSuggestionResponse } from '../api/fields';
import { applySuggestion, getVerifyFieldStreamUrl, type VerifyResult } from '../api/ai';
import type { ScanMode } from '../api/ai';
import { capitalizeFirst } from '../utils/html';

export interface BatchResult extends FieldSuggestionResponse {
  status: 'pending' | 'approved' | 'skipped';
}

export interface VerifyBatchResult extends VerifyResult {
  status: 'pending' | 'approved' | 'skipped';
}

export function useFieldBatchOperation(fieldType: FieldType) {
  const [results, setResults] = useState<BatchResult[]>([]);
  const [verifyResults, setVerifyResults] = useState<VerifyBatchResult[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, word: '' });
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startStream = useCallback((deckId: number, mode: ScanMode = 'with_children', fillMode: 'missing' | 'all' = 'missing') => {
    setResults([]);
    setProgress({ current: 0, total: 0, word: '' });
    setError(null);
    setIsStreaming(true);

    const url = getFillMissingStreamUrl(deckId, fieldType, mode, fillMode);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('start', (e) => {
      const data = JSON.parse(e.data);
      setProgress(p => ({ ...p, total: data.total }));
    });

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setProgress({ current: data.current, total: data.total, word: data.word });
    });

    eventSource.addEventListener('result', (e) => {
      const data: FieldSuggestionResponse = JSON.parse(e.data);
      setResults(prev => [...prev, { ...data, status: 'pending' }]);
    });

    eventSource.addEventListener('complete', () => {
      setIsStreaming(false);
      eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
      if (e instanceof MessageEvent && e.data) {
        setError(JSON.parse(e.data).message);
      } else {
        setError('Connection lost');
      }
      setIsStreaming(false);
      eventSource.close();
    });
  }, [fieldType]);

  const stopStream = useCallback(() => {
    eventSourceRef.current?.close();
    setIsStreaming(false);
  }, []);

  const approveResult = useCallback(async (index: number) => {
    const result = results[index];
    if (!result || result.status !== 'pending') return;

    const ankiFieldName = fieldType.charAt(0).toUpperCase() + fieldType.slice(1);
    const rawValue = result.html || result.suggestion;
    // Capitalize first letter except for pinyin
    const value = fieldType === 'pinyin' ? rawValue : capitalizeFirst(rawValue);
    await applySuggestion(result.note_id, ankiFieldName, value);

    setResults(prev => prev.map((r, i) =>
      i === index ? { ...r, status: 'approved' } : r
    ));
  }, [results, fieldType]);

  const skipResult = useCallback((index: number) => {
    setResults(prev => prev.map((r, i) =>
      i === index ? { ...r, status: 'skipped' } : r
    ));
  }, []);

  const approveAll = useCallback(async () => {
    const pending = results.filter(r => r.status === 'pending');
    const ankiFieldName = fieldType.charAt(0).toUpperCase() + fieldType.slice(1);

    for (const result of pending) {
      const rawValue = result.html || result.suggestion;
      // Capitalize first letter except for pinyin
      const value = fieldType === 'pinyin' ? rawValue : capitalizeFirst(rawValue);
      await applySuggestion(result.note_id, ankiFieldName, value);
      await new Promise(r => setTimeout(r, 50));
    }

    setResults(prev => prev.map(r =>
      r.status === 'pending' ? { ...r, status: 'approved' } : r
    ));
  }, [results, fieldType]);

  const startVerifyStream = useCallback((deckId: number, mode: ScanMode = 'with_children') => {
    setVerifyResults([]);
    setProgress({ current: 0, total: 0, word: '' });
    setError(null);
    setIsStreaming(true);

    const url = getVerifyFieldStreamUrl(deckId || undefined, fieldType, mode);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('start', (e) => {
      const data = JSON.parse(e.data);
      setProgress(p => ({ ...p, total: data.total }));
    });

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setProgress({ current: data.current, total: data.total, word: data.word });
    });

    eventSource.addEventListener('result', (e) => {
      const data: VerifyResult = JSON.parse(e.data);
      setVerifyResults(prev => [...prev, { ...data, status: 'pending' }]);
    });

    eventSource.addEventListener('complete', () => {
      setIsStreaming(false);
      eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
      if (e instanceof MessageEvent && e.data) {
        setError(JSON.parse(e.data).message);
      } else {
        setError('Connection lost');
      }
      setIsStreaming(false);
      eventSource.close();
    });
  }, [fieldType]);

  const approveVerifyResult = useCallback(async (index: number) => {
    const result = verifyResults[index];
    if (!result || result.status !== 'pending' || !result.suggested_value) return;

    const ankiFieldName = fieldType.charAt(0).toUpperCase() + fieldType.slice(1);
    const rawValue = result.suggested_value;
    // Capitalize first letter except for pinyin
    const value = fieldType === 'pinyin' ? rawValue : capitalizeFirst(rawValue);
    await applySuggestion(result.note_id, ankiFieldName, value);

    setVerifyResults(prev => prev.map((r, i) =>
      i === index ? { ...r, status: 'approved' } : r
    ));
  }, [verifyResults, fieldType]);

  const skipVerifyResult = useCallback((index: number) => {
    setVerifyResults(prev => prev.map((r, i) =>
      i === index ? { ...r, status: 'skipped' } : r
    ));
  }, []);

  const approveAllVerify = useCallback(async () => {
    const pendingResults = verifyResults
      .map((r, i) => ({ result: r, index: i }))
      .filter(({ result }) => result.status === 'pending' && !result.is_correct && result.suggested_value);

    const ankiFieldName = fieldType.charAt(0).toUpperCase() + fieldType.slice(1);

    for (const { result, index } of pendingResults) {
      try {
        const rawValue = result.suggested_value!;
        const value = fieldType === 'pinyin' ? rawValue : capitalizeFirst(rawValue);
        await applySuggestion(result.note_id, ankiFieldName, value);
        setVerifyResults(prev => prev.map((r, i) =>
          i === index ? { ...r, status: 'approved' } : r
        ));
      } catch (err) {
        console.error(`Failed to apply fix for ${result.word}:`, err);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }, [verifyResults, fieldType]);

  return {
    results,
    verifyResults,
    isStreaming,
    progress,
    error,
    startStream,
    stopStream,
    approveResult,
    skipResult,
    approveAll,
    startVerifyStream,
    approveVerifyResult,
    skipVerifyResult,
    approveAllVerify,
  };
}
