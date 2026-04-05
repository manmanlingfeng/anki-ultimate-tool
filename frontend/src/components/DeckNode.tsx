import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, AlertTriangle } from 'lucide-react';
import type { DeckNode as DeckNodeType } from '../types';

export const EXPANDED_DECKS_KEY = 'anki-tool-expanded-decks';

export function getExpandedDecks(): Record<number, boolean> {
  try {
    const saved = localStorage.getItem(EXPANDED_DECKS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function setExpandedDeck(deckId: number, expanded: boolean) {
  const current = getExpandedDecks();
  current[deckId] = expanded;
  localStorage.setItem(EXPANDED_DECKS_KEY, JSON.stringify(current));
}

// Expand multiple decks at once (for navigation)
export function expandDecks(deckIds: number[]) {
  const current = getExpandedDecks();
  for (const id of deckIds) {
    current[id] = true;
  }
  localStorage.setItem(EXPANDED_DECKS_KEY, JSON.stringify(current));
}

interface Props {
  node: DeckNodeType;
  level: number;
  selectedDeckId: number | null;
  onSelect: (deckId: number, fullName: string, isLeaf: boolean) => void;
  dueCountMap?: Map<number, number>;
}

// Recursively calculate total due count for a node and its children
function getTotalDueCount(node: DeckNodeType, dueCountMap?: Map<number, number>): number {
  if (!dueCountMap) return 0;

  // Get this node's direct due count
  const ownCount = dueCountMap.get(node.deck_id) ?? 0;

  // Add children's due counts
  const childrenCount = node.children.reduce(
    (sum, child) => sum + getTotalDueCount(child, dueCountMap),
    0
  );

  return ownCount + childrenCount;
}

export function DeckNode({ node, level, selectedDeckId, onSelect, dueCountMap }: Props) {
  const [expanded, setExpanded] = useState(() => {
    const saved = getExpandedDecks()[node.deck_id];
    return saved !== undefined ? saved : level < 2;
  });
  const hasChildren = node.children.length > 0;
  const isLeaf = node.full_name.includes('Part');
  const isSelected = node.deck_id === selectedDeckId;

  // For leaf nodes, show direct due count; for parents, show total of all children
  const dueCount = isLeaf
    ? (dueCountMap?.get(node.deck_id) ?? 0)
    : getTotalDueCount(node, dueCountMap);

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-[#313244] transition-colors ${
          isSelected ? 'bg-blue-100 dark:bg-[#cba6f7]/15' : ''
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) {
            const newExpanded = !expanded;
            setExpanded(newExpanded);
            setExpandedDeck(node.deck_id, newExpanded);
          }
          // All decks are selectable - pass isLeaf to determine card fetch mode
          onSelect(node.deck_id, node.full_name, isLeaf);
        }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown size={16} className="dark:text-[#a6adc8]" /> : <ChevronRight size={16} className="dark:text-[#a6adc8]" />
        ) : (
          <span className="w-4" />
        )}
        <Folder size={16} className="text-yellow-600 dark:text-[#f9e2af]" />
        <span className="flex-1 text-sm truncate dark:text-[#cdd6f4]">{node.name}</span>
        {/* Due count badge - show for all decks with due cards */}
        {dueCount > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-[#cba6f7]/20 dark:text-[#cba6f7] font-medium">
            {dueCount}
          </span>
        )}
        {/* Total cards and overflow warning - only for leaf decks */}
        {isLeaf && (
          <>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              node.has_overflow ? 'bg-red-100 text-red-700 dark:bg-[#f38ba8]/20 dark:text-[#f38ba8]' : 'bg-gray-100 dark:bg-[#313244] dark:text-[#a6adc8]'
            }`}>
              {node.total_cards}
            </span>
            {node.has_overflow && (
              <AlertTriangle size={14} className="text-red-500 dark:text-[#f38ba8]" />
            )}
          </>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <DeckNode
              key={child.deck_id}
              node={child}
              level={level + 1}
              selectedDeckId={selectedDeckId}
              onSelect={onSelect}
              dueCountMap={dueCountMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}
