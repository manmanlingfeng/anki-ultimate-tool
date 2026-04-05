import { useQuery } from '@tanstack/react-query';
import { getFieldStats } from '../api/fields';
import type { ScanMode } from '../api/ai';

export function useFieldStats(deckId: number | null, mode: ScanMode) {
  return useQuery({
    queryKey: ['fieldStats', deckId, mode],
    queryFn: () => getFieldStats(deckId || undefined, mode),
    enabled: mode === 'all' || deckId !== null,
    staleTime: 30000, // 30s cache
  });
}
