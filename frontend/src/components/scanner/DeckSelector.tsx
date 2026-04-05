import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDeckTree } from '../../api/decks';
import type { DeckNode } from '../../types';
import type { ScanMode } from '../../api/ai';
import { ChevronDown, ChevronRight, Check, Minus, Loader2 } from 'lucide-react';

interface DeckSelectorProps {
  scanMode: ScanMode;
  selectedDeckId: number | null;
  selectedDeckIds?: number[];
  onModeChange: (mode: ScanMode) => void;
  onDeckChange: (deckId: number | null) => void;
  onDeckIdsChange?: (deckIds: number[]) => void;
}

interface TreeNodeProps {
  node: DeckNode;
  depth: number;
  selectedIds: Set<number>;
  expandedIds: Set<number>;
  onToggleSelect: (node: DeckNode, withChildren: boolean) => void;
  onToggleExpand: (deckId: number) => void;
  isAllSelected: boolean;
}

// Get all deck IDs from a node and its children
function getAllDeckIds(node: DeckNode): number[] {
  const ids = [node.deck_id];
  for (const child of node.children) {
    ids.push(...getAllDeckIds(child));
  }
  return ids;
}

// Check selection state for a node
function getSelectionState(
  node: DeckNode,
  selectedIds: Set<number>
): 'none' | 'partial' | 'all' {
  const allIds = getAllDeckIds(node);
  const selectedCount = allIds.filter((id) => selectedIds.has(id)).length;

  if (selectedCount === 0) return 'none';
  if (selectedCount === allIds.length) return 'all';
  return 'partial';
}

// Tree node component
function TreeNode({
  node,
  depth,
  selectedIds,
  expandedIds,
  onToggleSelect,
  onToggleExpand,
  isAllSelected,
}: TreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.deck_id);
  const selectionState = getSelectionState(node, selectedIds);

  return (
    <div>
      {/* Node row */}
      <div
        className={`flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer transition-colors ${
          isAllSelected
            ? 'opacity-40 cursor-not-allowed'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Expand/collapse button */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.deck_id);
            }}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            disabled={isAllSelected}
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-gray-500" />
            ) : (
              <ChevronRight size={14} className="text-gray-500" />
            )}
          </button>
        ) : (
          <span className="w-5" /> // Spacer for alignment
        )}

        {/* Checkbox */}
        <button
          onClick={() => !isAllSelected && onToggleSelect(node, true)}
          disabled={isAllSelected}
          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            selectionState === 'all'
              ? 'bg-purple-600 border-purple-600'
              : selectionState === 'partial'
              ? 'bg-purple-600 border-purple-600'
              : 'border-gray-400 dark:border-gray-500 hover:border-purple-500'
          }`}
        >
          {selectionState === 'all' && <Check size={12} className="text-white" />}
          {selectionState === 'partial' && <Minus size={12} className="text-white" />}
        </button>

        {/* Label */}
        <span
          className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate ml-1"
          onClick={() => !isAllSelected && onToggleSelect(node, true)}
        >
          {node.name}
        </span>

        {/* Card count */}
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
          {node.total_cards}
        </span>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="relative">
          {/* Tree line */}
          <div
            className="absolute left-0 top-0 bottom-2 border-l border-gray-300 dark:border-gray-600"
            style={{ marginLeft: `${depth * 16 + 18}px` }}
          />
          {node.children.map((child) => (
            <div key={child.deck_id} className="relative">
              {/* Horizontal connector */}
              <div
                className="absolute border-t border-gray-300 dark:border-gray-600"
                style={{
                  left: `${depth * 16 + 18}px`,
                  top: '14px',
                  width: '8px',
                }}
              />
              <TreeNode
                node={child}
                depth={depth + 1}
                selectedIds={selectedIds}
                expandedIds={expandedIds}
                onToggleSelect={onToggleSelect}
                onToggleExpand={onToggleExpand}
                isAllSelected={isAllSelected}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeckSelector({
  scanMode,
  selectedDeckId: _selectedDeckId,
  selectedDeckIds = [],
  onModeChange,
  onDeckChange,
  onDeckIdsChange,
}: DeckSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<number>>(
    new Set(selectedDeckIds)
  );
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: deckTree, isLoading } = useQuery({
    queryKey: ['deckTree'],
    queryFn: fetchDeckTree,
  });

  // Sync local state with props
  useEffect(() => {
    setLocalSelectedIds(new Set(selectedDeckIds));
  }, [selectedDeckIds]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-expand first level on load
  useEffect(() => {
    if (deckTree && expandedIds.size === 0) {
      const firstLevel = new Set(deckTree.map((n) => n.deck_id));
      setExpandedIds(firstLevel);
    }
  }, [deckTree]);

  const isAllSelected = scanMode === 'all';

  const handleToggleAll = useCallback(() => {
    if (isAllSelected) {
      // Switch to deck mode, keep previous selection or select nothing
      onModeChange('deck');
    } else {
      // Switch to all mode
      onModeChange('all');
      onDeckChange(null);
      setLocalSelectedIds(new Set());
      onDeckIdsChange?.([]);
    }
  }, [isAllSelected, onModeChange, onDeckChange, onDeckIdsChange]);

  const handleToggleExpand = useCallback((deckId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(deckId)) {
        next.delete(deckId);
      } else {
        next.add(deckId);
      }
      return next;
    });
  }, []);

  const handleToggleSelect = useCallback(
    (node: DeckNode, withChildren: boolean) => {
      const allIds = withChildren ? getAllDeckIds(node) : [node.deck_id];
      const currentState = getSelectionState(node, localSelectedIds);

      setLocalSelectedIds((prev) => {
        const next = new Set(prev);

        if (currentState === 'all') {
          // Deselect all
          allIds.forEach((id) => next.delete(id));
        } else {
          // Select all
          allIds.forEach((id) => next.add(id));
        }

        // Update parent state
        onModeChange('deck');
        onDeckIdsChange?.(Array.from(next));

        // For backward compatibility, set first selected as primary
        if (next.size > 0) {
          onDeckChange(Array.from(next)[0]);
        } else {
          onDeckChange(null);
        }

        return next;
      });
    },
    [localSelectedIds, onModeChange, onDeckChange, onDeckIdsChange]
  );

  // Build summary text
  const summaryText = useMemo(() => {
    if (isAllSelected) return 'All Decks';
    if (localSelectedIds.size === 0) return 'Select decks...';
    if (localSelectedIds.size === 1) {
      // Find the deck name
      const findName = (nodes: DeckNode[]): string | null => {
        for (const node of nodes) {
          if (localSelectedIds.has(node.deck_id)) return node.name;
          const found = findName(node.children);
          if (found) return found;
        }
        return null;
      };
      return findName(deckTree || []) || '1 deck selected';
    }
    return `${localSelectedIds.size} decks selected`;
  }, [isAllSelected, localSelectedIds, deckTree]);

  return (
    <div className="relative space-y-1.5" ref={dropdownRef}>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Scan scope
      </label>

      {/* Dropdown trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
      >
        {isLoading ? (
          <span className="flex items-center gap-2 text-gray-500">
            <Loader2 size={14} className="animate-spin" />
            Loading decks...
          </span>
        ) : (
          <span className="truncate">{summaryText}</span>
        )}
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown panel */}
      {isOpen && deckTree && (
        <div className="absolute left-0 right-0 z-50 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-80 overflow-auto">
          {/* All Decks option */}
          <div
            onClick={handleToggleAll}
            className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-gray-200 dark:border-gray-700 ${
              isAllSelected
                ? 'bg-purple-50 dark:bg-purple-900/20'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                isAllSelected
                  ? 'bg-purple-600 border-purple-600'
                  : 'border-gray-400 dark:border-gray-500'
              }`}
            >
              {isAllSelected && <Check size={12} className="text-white" />}
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              All Decks
            </span>
          </div>

          {/* Tree view */}
          <div className="py-1">
            {deckTree.map((node) => (
              <TreeNode
                key={node.deck_id}
                node={node}
                depth={0}
                selectedIds={localSelectedIds}
                expandedIds={expandedIds}
                onToggleSelect={handleToggleSelect}
                onToggleExpand={handleToggleExpand}
                isAllSelected={isAllSelected}
              />
            ))}
          </div>
        </div>
      )}

      {/* Helper text */}
      {!isOpen && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {isAllSelected
            ? 'Scan every deck in your collection'
            : localSelectedIds.size > 0
            ? `Will scan ${localSelectedIds.size} deck${localSelectedIds.size > 1 ? 's' : ''} and their contents`
            : 'Click to select decks to scan'}
        </p>
      )}
    </div>
  );
}
