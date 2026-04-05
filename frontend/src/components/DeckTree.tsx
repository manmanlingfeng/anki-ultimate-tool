import { useDeckTree } from '../hooks/useDecks';
import { useDueCounts } from '../hooks/useDueCounts';
import { DeckNode } from './DeckNode';

interface Props {
  selectedDeckId: number | null;
  onSelectDeck: (deckId: number, fullName: string, isLeaf: boolean) => void;
}

// Skeleton item for loading state
function SkeletonDeckItem({ level, hasChildren }: { level: number; hasChildren: boolean }) {
  return (
    <div className="animate-pulse" style={{ paddingLeft: `${level * 16 + 8}px` }}>
      <div className="flex items-center gap-2 py-1.5 pr-2">
        {hasChildren && <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded" />}
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded flex-1" style={{ maxWidth: `${120 - level * 20}px` }} />
      </div>
    </div>
  );
}

export function DeckTree({ selectedDeckId, onSelectDeck }: Props) {
  const { data: decks, isLoading, error, refetch } = useDeckTree();
  const { data: dueCounts } = useDueCounts();

  // Build a map of deck_id -> due_count for quick lookup
  const dueCountMap = new Map<number, number>();
  if (dueCounts) {
    for (const deck of dueCounts.decks) {
      dueCountMap.set(deck.deck_id, deck.due_count);
    }
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 text-sm">
        Failed to load decks. Is Anki running?
        <button onClick={() => refetch()} className="ml-2 underline">
          Retry
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-2">
        <SkeletonDeckItem level={0} hasChildren={true} />
        <SkeletonDeckItem level={1} hasChildren={true} />
        <SkeletonDeckItem level={2} hasChildren={false} />
        <SkeletonDeckItem level={2} hasChildren={false} />
        <SkeletonDeckItem level={1} hasChildren={true} />
        <SkeletonDeckItem level={2} hasChildren={false} />
        <SkeletonDeckItem level={0} hasChildren={true} />
        <SkeletonDeckItem level={1} hasChildren={false} />
      </div>
    );
  }

  return (
    <div className="py-2">
      {decks?.map((deck) => (
        <DeckNode
          key={deck.deck_id}
          node={deck}
          level={0}
          selectedDeckId={selectedDeckId}
          onSelect={onSelectDeck}
          dueCountMap={dueCountMap}
        />
      ))}
    </div>
  );
}
