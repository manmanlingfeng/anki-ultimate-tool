import { useQuery } from '@tanstack/react-query';
import { fetchDueCounts, type DueCountsResponse } from '../api/study';

export function useDueCounts() {
  return useQuery<DueCountsResponse>({
    queryKey: ['due-counts'],
    queryFn: fetchDueCounts,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refresh every minute
  });
}

/**
 * Get due count for a specific deck from the due counts response.
 */
export function getDueCountForDeck(
  dueCounts: DueCountsResponse | undefined,
  deckId: number
): number {
  if (!dueCounts) return 0;
  const deck = dueCounts.decks.find((d) => d.deck_id === deckId);
  return deck?.due_count ?? 0;
}
