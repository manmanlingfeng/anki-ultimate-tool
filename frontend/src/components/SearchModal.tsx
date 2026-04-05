import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  X,
  Loader2,
  Volume2,
  ChevronDown,
  ChevronRight,
  Filter,
  Layers,
  Check,
  Minus,
} from 'lucide-react';
import { searchCards, type SearchResult, type SearchableField } from '../api/cards';
import { useDeckTree } from '../hooks/useDecks';
import { DuplicateCardPreviewModal } from './DuplicateCardPreviewModal';
import { CardFormModal } from './CardFormModal';
import type { DeckNode, Card } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectCard: (deckId: number, noteId: number, cardId: number) => void;
}

const SEARCHABLE_FIELDS: { value: SearchableField; label: string }[] = [
  { value: 'Word', label: 'Word' },
  { value: 'Pinyin', label: 'Pinyin' },
  { value: 'Definition', label: 'Definition' },
  { value: 'Example', label: 'Example' },
  { value: 'Sino', label: 'Sino' },
  { value: 'Simplified', label: 'Simplified' },
];

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

// Tree node component for deck selection
interface TreeNodeProps {
  node: DeckNode;
  depth: number;
  selectedIds: Set<number>;
  expandedIds: Set<number>;
  onToggleSelect: (node: DeckNode) => void;
  onToggleExpand: (deckId: number) => void;
}

function DeckTreeNode({
  node,
  depth,
  selectedIds,
  expandedIds,
  onToggleSelect,
  onToggleExpand,
}: TreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.deck_id);
  const selectionState = getSelectionState(node, selectedIds);

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1.5 px-2 rounded cursor-pointer hover:bg-[#313244] transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Expand/collapse button */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.deck_id);
            }}
            className="p-0.5 hover:bg-[#45475a] rounded"
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-[#6c7086]" />
            ) : (
              <ChevronRight size={14} className="text-[#6c7086]" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        {/* Checkbox */}
        <button
          onClick={() => onToggleSelect(node)}
          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            selectionState === 'all'
              ? 'bg-[#89b4fa] border-[#89b4fa]'
              : selectionState === 'partial'
              ? 'bg-[#89b4fa] border-[#89b4fa]'
              : 'border-[#6c7086] hover:border-[#89b4fa]'
          }`}
        >
          {selectionState === 'all' && <Check size={10} className="text-[#1e1e2e]" />}
          {selectionState === 'partial' && <Minus size={10} className="text-[#1e1e2e]" />}
        </button>

        {/* Label */}
        <span
          className="flex-1 text-sm text-[#cdd6f4] truncate ml-1"
          onClick={() => onToggleSelect(node)}
        >
          {node.name}
        </span>

        {/* Card count */}
        <span className="text-xs text-[#6c7086] ml-2">
          {node.total_cards}
        </span>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="relative">
          <div
            className="absolute left-0 top-0 bottom-2 border-l border-[#45475a]"
            style={{ marginLeft: `${depth * 16 + 18}px` }}
          />
          {node.children.map((child) => (
            <div key={child.deck_id} className="relative">
              <div
                className="absolute border-t border-[#45475a]"
                style={{
                  left: `${depth * 16 + 18}px`,
                  top: '14px',
                  width: '8px',
                }}
              />
              <DeckTreeNode
                node={child}
                depth={depth + 1}
                selectedIds={selectedIds}
                expandedIds={expandedIds}
                onToggleSelect={onToggleSelect}
                onToggleExpand={onToggleExpand}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Highlight matching text
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-[#f9e2af]/30 text-[#f9e2af] rounded px-0.5">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

export function SearchModal({ isOpen, onClose, onSelectCard }: Props) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedFields, setSelectedFields] = useState<SearchableField[]>(['Word', 'Pinyin', 'Definition']);
  const [selectedDeckIds, setSelectedDeckIds] = useState<Set<number>>(new Set());
  const [expandedDeckIds, setExpandedDeckIds] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showDeckDropdown, setShowDeckDropdown] = useState(false);
  const [previewingResult, setPreviewingResult] = useState<SearchResult | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: deckTree } = useDeckTree();

  // Auto-expand first level on load
  useEffect(() => {
    if (deckTree && expandedDeckIds.size === 0) {
      const firstLevel = new Set(deckTree.map((n: DeckNode) => n.deck_id));
      setExpandedDeckIds(firstLevel);
    }
  }, [deckTree]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDeckDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search query - convert Set to array for API
  const selectedDeckIdsArray = Array.from(selectedDeckIds);
  const { data: searchResponse, isLoading } = useQuery({
    queryKey: ['search', debouncedQuery, selectedDeckIdsArray, selectedFields],
    queryFn: () => searchCards({
      query: debouncedQuery,
      deckIds: selectedDeckIdsArray.length > 0 ? selectedDeckIdsArray : undefined,
      fields: selectedFields,
      limit: 50,
    }),
    enabled: debouncedQuery.length >= 1,
  });

  const handlePreviewCard = useCallback((result: SearchResult) => {
    setPreviewingResult(result);
  }, []);

  const handleGoToCard = useCallback(() => {
    if (previewingResult) {
      onSelectCard(previewingResult.deck_id, previewingResult.note_id, previewingResult.card_id);
      setPreviewingResult(null);
      onClose();
    }
  }, [previewingResult, onSelectCard, onClose]);

  const handleEditCard = useCallback((card: Card) => {
    setEditingCard(card);
    setShowEditModal(true);
    setPreviewingResult(null); // Close preview modal
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setShowEditModal(false);
    setEditingCard(null);
    // Refresh search results to reflect any changes
    queryClient.invalidateQueries({ queryKey: ['search'] });
  }, [queryClient]);

  const toggleField = (field: SearchableField) => {
    setSelectedFields(prev =>
      prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  const handleToggleDeck = useCallback((node: DeckNode) => {
    const allIds = getAllDeckIds(node);
    const currentState = getSelectionState(node, selectedDeckIds);

    setSelectedDeckIds(prev => {
      const next = new Set(prev);
      if (currentState === 'all') {
        // Deselect all
        allIds.forEach(id => next.delete(id));
      } else {
        // Select all
        allIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [selectedDeckIds]);

  const handleToggleExpand = useCallback((deckId: number) => {
    setExpandedDeckIds(prev => {
      const next = new Set(prev);
      if (next.has(deckId)) {
        next.delete(deckId);
      } else {
        next.add(deckId);
      }
      return next;
    });
  }, []);

  const clearDeckFilter = () => {
    setSelectedDeckIds(new Set());
  };

  // Get summary text for deck selection
  const getDeckSummary = useCallback((): string => {
    if (selectedDeckIds.size === 0) return 'All Decks';
    if (selectedDeckIds.size === 1 && deckTree) {
      const findName = (nodes: DeckNode[]): string | null => {
        for (const node of nodes) {
          if (selectedDeckIds.has(node.deck_id)) return node.full_name;
          const found = findName(node.children);
          if (found) return found;
        }
        return null;
      };
      const name = findName(deckTree);
      if (name) {
        // Show short name for display
        return name.split('::').pop() || name;
      }
    }
    return `${selectedDeckIds.size} decks`;
  }, [selectedDeckIds, deckTree]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const results = searchResponse?.results || [];

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[10vh] z-50"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e2e] rounded-xl w-full max-w-2xl mx-4 shadow-2xl border border-[#313244] flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="p-4 border-b border-[#313244]">
          {/* Search Input */}
          <div className="relative">
            <Search
              size={20}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6c7086]"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards..."
              className="w-full pl-12 pr-12 py-3 bg-[#181825] border border-[#45475a] rounded-lg text-[#cdd6f4] placeholder-[#6c7086] focus:outline-none focus:border-[#cba6f7] focus:ring-1 focus:ring-[#cba6f7]/50 text-lg"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-[#313244] rounded"
              >
                <X size={16} className="text-[#6c7086]" />
              </button>
            )}
          </div>

          {/* Filter Toggle & Deck Selection */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                showFilters || selectedFields.length !== 3
                  ? 'bg-[#cba6f7]/20 text-[#cba6f7]'
                  : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
              }`}
            >
              <Filter size={14} />
              Fields
              {selectedFields.length !== 3 && (
                <span className="bg-[#cba6f7]/30 px-1.5 rounded text-xs">
                  {selectedFields.length}
                </span>
              )}
            </button>

            {/* Deck Selector */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDeckDropdown(!showDeckDropdown)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedDeckIds.size > 0
                    ? 'bg-[#89b4fa]/20 text-[#89b4fa]'
                    : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
                }`}
              >
                <Layers size={14} />
                {getDeckSummary()}
                <ChevronDown size={14} className={`transition-transform ${showDeckDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showDeckDropdown && deckTree && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-[#1e1e2e] border border-[#45475a] rounded-lg shadow-xl min-w-[320px] max-h-[350px] overflow-auto">
                  {/* Clear selection option */}
                  {selectedDeckIds.size > 0 && (
                    <button
                      onClick={clearDeckFilter}
                      className="w-full text-left px-3 py-2 text-sm text-[#f38ba8] hover:bg-[#313244] border-b border-[#313244] flex items-center gap-2"
                    >
                      <X size={14} />
                      Clear selection ({selectedDeckIds.size})
                    </button>
                  )}

                  {/* All Decks option */}
                  <div
                    onClick={clearDeckFilter}
                    className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-[#313244] ${
                      selectedDeckIds.size === 0
                        ? 'bg-[#89b4fa]/10'
                        : 'hover:bg-[#313244]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        selectedDeckIds.size === 0
                          ? 'bg-[#89b4fa] border-[#89b4fa]'
                          : 'border-[#6c7086]'
                      }`}
                    >
                      {selectedDeckIds.size === 0 && <Check size={10} className="text-[#1e1e2e]" />}
                    </div>
                    <span className="text-sm font-medium text-[#cdd6f4]">
                      All Decks
                    </span>
                  </div>

                  {/* Tree view */}
                  <div className="py-1">
                    {deckTree.map((node: DeckNode) => (
                      <DeckTreeNode
                        key={node.deck_id}
                        node={node}
                        depth={0}
                        selectedIds={selectedDeckIds}
                        expandedIds={expandedDeckIds}
                        onToggleSelect={handleToggleDeck}
                        onToggleExpand={handleToggleExpand}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Keyboard hint */}
            <div className="ml-auto text-xs text-[#6c7086]">
              <kbd className="px-1.5 py-0.5 bg-[#313244] rounded text-[#a6adc8]">Esc</kbd>
              {' '}to close
            </div>
          </div>

          {/* Field Filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[#313244]">
              {SEARCHABLE_FIELDS.map((field) => {
                const isSelected = selectedFields.includes(field.value);
                return (
                  <button
                    key={field.value}
                    onClick={() => toggleField(field.value)}
                    className={`px-3 py-1 text-sm rounded-full transition-colors ${
                      isSelected
                        ? 'bg-[#cba6f7]/20 text-[#cba6f7] border border-[#cba6f7]/30'
                        : 'bg-[#313244] text-[#6c7086] border border-transparent hover:text-[#a6adc8]'
                    }`}
                  >
                    {field.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {isLoading && debouncedQuery ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[#cba6f7]" />
            </div>
          ) : !debouncedQuery ? (
            <div className="text-center py-12 text-[#6c7086]">
              <Search size={40} className="mx-auto mb-3 opacity-50" />
              <p>Type to search across your cards</p>
              <p className="text-sm mt-1">Search in Word, Pinyin, Definition, and more</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-[#6c7086]">
              <p>No cards found for "{debouncedQuery}"</p>
              <p className="text-sm mt-1">Try different keywords or adjust filters</p>
            </div>
          ) : (
            <div className="divide-y divide-[#313244]">
              {results.map((result) => {
                // Format deck name: show hierarchy with separator
                const deckParts = result.deck_name.split('::');
                const formattedDeckName = deckParts.length > 1
                  ? deckParts.slice(1).join(' › ') // Skip "Chinese" prefix, use › separator
                  : result.deck_name;
                return (
                  <button
                    key={`${result.note_id}-${result.matched_field}`}
                    onClick={() => handlePreviewCard(result)}
                    className="w-full text-left p-4 hover:bg-[#313244]/50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Word and Pinyin */}
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg text-[#cdd6f4] font-medium">
                            {highlightMatch(result.word, debouncedQuery)}
                          </span>
                          <span className="text-sm text-[#94e2d5]">
                            {highlightMatch(result.pinyin, debouncedQuery)}
                          </span>
                          {result.has_audio && (
                            <Volume2 size={14} className="text-[#a6e3a1]" />
                          )}
                        </div>

                        {/* Definition or Matched Value */}
                        <p className="text-sm text-[#a6adc8] mt-1 line-clamp-2">
                          {result.matched_field === 'Word' || result.matched_field === 'Pinyin'
                            ? result.definition
                            : highlightMatch(result.matched_value, debouncedQuery)}
                        </p>

                        {/* Metadata */}
                        <div className="flex items-center gap-2 mt-2 text-xs flex-wrap">
                          <span className="px-2 py-0.5 bg-[#313244] text-[#a6adc8] rounded">
                            {formattedDeckName}
                          </span>
                          {result.matched_field !== 'Word' && (
                            <span className="px-2 py-0.5 bg-[#cba6f7]/10 text-[#cba6f7] rounded">
                              matched in {result.matched_field}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Arrow indicator */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[#6c7086]">
                        →
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-[#313244] text-xs text-[#6c7086] flex justify-between">
            <span>{searchResponse?.total} result{searchResponse?.total !== 1 ? 's' : ''}</span>
            <span>Searched in: {searchResponse?.fields_searched.join(', ')}</span>
          </div>
        )}
      </div>

      {/* Card Preview Modal */}
      {previewingResult && (
        <DuplicateCardPreviewModal
          isOpen={true}
          noteId={previewingResult.note_id}
          cardId={previewingResult.card_id}
          deckName={previewingResult.deck_name}
          onClose={() => setPreviewingResult(null)}
          onGoToCard={handleGoToCard}
          onEdit={handleEditCard}
        />
      )}

      {/* Edit Card Modal */}
      {editingCard && (
        <CardFormModal
          isOpen={showEditModal}
          onClose={handleCloseEditModal}
          deckName={editingCard.deck_name}
          editCard={editingCard}
        />
      )}
    </div>
  );
}
