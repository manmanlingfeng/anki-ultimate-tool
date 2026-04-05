import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { suggestField, type FieldType, type FieldSuggestionResponse } from '../api/fields';
import { applySuggestion } from '../api/ai';

interface UseFieldSuggestionOptions {
  noteId: number;
  fieldType: FieldType;
  word: string;
  pinyin?: string;
  definition?: string;
  fieldName?: string;
}

export function useFieldSuggestion(options: UseFieldSuggestionOptions) {
  const { noteId, fieldType, word, pinyin, definition, fieldName } = options;
  const queryClient = useQueryClient();

  const [suggestion, setSuggestion] = useState<FieldSuggestionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await suggestField({
        note_id: noteId,
        field_type: fieldType,
        word,
        pinyin,
        definition,
      });
      setSuggestion(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suggestion failed');
    } finally {
      setIsLoading(false);
    }
  }, [noteId, fieldType, word, pinyin, definition]);

  const apply = useCallback(async () => {
    if (!suggestion) return;

    const ankiFieldName = fieldName || fieldType.charAt(0).toUpperCase() + fieldType.slice(1);
    const value = suggestion.html || suggestion.suggestion;

    await applySuggestion(noteId, ankiFieldName, value);
    queryClient.invalidateQueries({ queryKey: ['cards'] });
  }, [suggestion, noteId, fieldName, fieldType, queryClient]);

  const reset = useCallback(() => {
    setSuggestion(null);
    setError(null);
  }, []);

  return {
    suggestion: suggestion?.suggestion ?? null,
    html: suggestion?.html ?? null,
    source: suggestion?.source ?? null,
    confidence: suggestion?.confidence ?? 0,
    alternatives: suggestion?.alternatives ?? [],
    estimatedCost: suggestion?.cost ?? null,
    isLoading,
    error,
    generate,
    apply,
    reset,
  };
}
