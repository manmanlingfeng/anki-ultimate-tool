import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAnkiHealth, useDeckTree } from '../hooks/useDecks';
import { useDueCounts } from '../hooks/useDueCounts';
import { syncAnki } from '../api/decks';
import { useToast } from '../components/Toast';
import { useDeleteCard, useDeckCards } from '../hooks/useCards';
import { useResizable } from '../hooks/useResizable';
import { DeckTree } from '../components/DeckTree';
import { CardList } from '../components/CardList';
import { CardFormModal } from '../components/CardFormModal';
import { CardDetailPanel } from '../components/CardDetailPanel';
import { DeckHealthPanel } from '../components/DeckHealthPanel';
import { DeckToolbar } from '../components/DeckToolbar';
import { StudyModal } from '../components/study';
import { SearchModal } from '../components/SearchModal';
import { expandDecks } from '../components/DeckNode';
import { fetchNote } from '../api/cards';
import type { Card, DeckNode } from '../types';
import { AlertCircle, RefreshCw, BookOpen, Search } from 'lucide-react';

function getDeckFromUrl(): {id: number; name: string; isLeaf: boolean} | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('deck');
  const name = params.get('name');
  const isLeaf = params.get('leaf') !== 'false'; // Default to true for backwards compatibility
  if (id && name) {
    return { id: parseInt(id, 10), name: decodeURIComponent(name), isLeaf };
  }
  return null;
}

function setDeckToUrl(deck: {id: number; name: string; isLeaf: boolean} | null) {
  const url = new URL(window.location.href);
  if (deck) {
    url.searchParams.set('deck', String(deck.id));
    url.searchParams.set('name', deck.name);
    url.searchParams.set('leaf', String(deck.isLeaf));
  } else {
    url.searchParams.delete('deck');
    url.searchParams.delete('name');
    url.searchParams.delete('leaf');
  }
  window.history.replaceState({}, '', url.toString());
}

export function Dashboard() {
  const [selectedDeck, setSelectedDeck] = useState<{id: number; name: string; isLeaf: boolean} | null>(getDeckFromUrl);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showStudyModal, setShowStudyModal] = useState(false);
  const [showStudyAllModal, setShowStudyAllModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [treeKey, setTreeKey] = useState(0); // Force re-render of DeckTree when navigating
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [viewingCard, setViewingCard] = useState<{card: Card; index: number} | null>(null);
  // Pending navigation from search - processed in useEffect
  const [pendingNavigation, setPendingNavigation] = useState<{deckId: number; noteId: number; cardId: number} | null>(null);
  const { data: isHealthy } = useAnkiHealth();
  const { data: dueCounts } = useDueCounts();
  const { data: deckTree, refetch: refetchDecks } = useDeckTree();
  // For leaf decks, fetch only that deck's cards; for parent decks, include children
  const includeChildren = selectedDeck ? !selectedDeck.isLeaf : true;
  const { data: cardsData } = useDeckCards(selectedDeck?.id ?? null, includeChildren);
  // Flatten paginated cards data - memoized to prevent infinite effect loops
  const cards = useMemo(() => {
    return cardsData?.pages?.flatMap(page => page.cards) ?? [];
  }, [cardsData]);
  const deleteCard = useDeleteCard();

  // Auto-select first root deck on initial load (when no deck in URL)
  useEffect(() => {
    if (!selectedDeck && deckTree && deckTree.length > 0) {
      const rootDeck = deckTree[0];
      const isLeaf = rootDeck.children.length === 0;
      const deck = { id: rootDeck.deck_id, name: rootDeck.full_name, isLeaf };
      setSelectedDeck(deck);
      setDeckToUrl(deck);
    }
  }, [selectedDeck, deckTree]);
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();
  const [isRefreshingDecks, setIsRefreshingDecks] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<string>('');

  const handleRefreshDecks = useCallback(async () => {
    setIsRefreshingDecks(true);
    try {
      // Step 1: Sync with AnkiWeb
      setRefreshStatus('Syncing...');
      try {
        await syncAnki();
      } catch (err) {
        // Sync failed, but continue with local refresh
        console.warn('Sync failed:', err);
        showError('Sync failed, refreshing local data');
      }

      // Step 2: Refresh deck data
      setRefreshStatus('Refreshing...');
      await refetchDecks();

      // Step 3: Refresh due counts
      queryClient.invalidateQueries({ queryKey: ['due-counts'] });

      showSuccess('Synced and refreshed');
    } finally {
      setIsRefreshingDecks(false);
      setRefreshStatus('');
    }
  }, [refetchDecks, queryClient, showSuccess, showError]);

  const { width: sidebarWidth, isResizing, startResize } = useResizable({
    storageKey: 'sidebar-width',
    defaultWidth: 288,
    minWidth: 200,
    maxWidth: 500,
  });

  // Sync viewingCard with latest card data when cards update
  useEffect(() => {
    if (viewingCard && cards) {
      const updatedCard = cards.find(c => c.card_id === viewingCard.card.card_id);
      if (updatedCard) {
        const newIndex = cards.findIndex(c => c.card_id === viewingCard.card.card_id);
        setViewingCard({ card: updatedCard, index: newIndex });
      }
    }
  }, [cards]);

  const handleSelectDeck = (deckId: number, fullName: string, isLeaf: boolean = true) => {
    const deck = { id: deckId, name: fullName, isLeaf };
    setSelectedDeck(deck);
    setDeckToUrl(deck);
    setViewingCard(null);
  };

  const handleViewCard = (card: Card, index: number) => {
    setViewingCard({ card, index });
  };

  const handleAudioGenerated = () => {
    // Refresh the cards list to show updated audio status
    if (selectedDeck) {
      queryClient.invalidateQueries({ queryKey: ['cards', selectedDeck.id] });
    }
  };

  const handleEditCard = (card: Card) => {
    setEditingCard(card);
    setShowCardModal(true);
  };

  const handleDeleteCard = (noteId: number) => {
    if (confirm('Delete this card?')) {
      deleteCard.mutate(noteId);
      if (viewingCard?.card.note_id === noteId) {
        setViewingCard(null);
      }
    }
  };

  const handleAddNew = () => {
    setEditingCard(null);
    setShowCardModal(true);
  };

  const handleCloseModal = () => {
    setShowCardModal(false);
    setEditingCard(null);
  };

  // Handle search result selection - just store the target, navigation handled in useEffect
  const handleSearchSelectCard = useCallback((deckId: number, noteId: number, cardId: number) => {
    setPendingNavigation({ deckId, noteId, cardId });
  }, []);

  // Process pending navigation from search when deckTree is available
  useEffect(() => {
    if (!pendingNavigation || !deckTree) return;

    const { deckId, noteId, cardId } = pendingNavigation;

    // Clear pending navigation immediately to prevent re-runs
    setPendingNavigation(null);

    // Find deck and all ancestor IDs to expand tree path
    const findDeckWithPath = (
      nodes: DeckNode[],
      path: number[] = []
    ): { node: DeckNode; path: number[] } | null => {
      for (const node of nodes) {
        const currentPath = [...path, node.deck_id];
        if (node.deck_id === deckId) {
          return { node, path: currentPath };
        }
        if (node.children.length > 0) {
          const found = findDeckWithPath(node.children, currentPath);
          if (found) return found;
        }
      }
      return null;
    };

    const result = findDeckWithPath(deckTree);
    if (!result) {
      return;
    }

    const { node, path } = result;
    const isLeaf = node.children.length === 0;
    const deck = { id: deckId, name: node.full_name, isLeaf };

    // Expand all ancestor decks in the tree (writes to localStorage)
    expandDecks(path);

    // Update state - use setTimeout to ensure React has processed the localStorage changes
    // before remounting the tree with the new key
    setTimeout(() => {
      setTreeKey((k) => k + 1);
      setSelectedDeck(deck);
      setDeckToUrl(deck);

      // Fetch full card data and show in detail panel
      fetchNote(noteId)
        .then((noteData) => {
          // Extract audio filename from [sound:filename.mp3] format
          const audioMatch = noteData.fields.Audio?.value?.match(/\[sound:(.+?)\]/);
          const audioFile = audioMatch?.[1] || null;

          const card: Card = {
            card_id: cardId,
            note_id: noteId,
            deck_name: node.full_name,
            fields: noteData.fields,
            audio_file: audioFile,
            audio_index: 0,
          };
          setViewingCard({ card, index: -1 }); // index -1 indicates not from list
        })
        .catch(() => {
          // Failed to fetch card - silently ignore
        });
    }, 0);
  }, [pendingNavigation, deckTree]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K for search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearchModal(true);
      }
      // Cmd/Ctrl+N for new card
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        if (selectedDeck) {
          setEditingCard(null);
          setShowCardModal(true);
        }
      }
      if (e.key === 'Escape') {
        setShowCardModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDeck]);

  return (
    <div className="h-screen flex flex-col bg-[#1e1e2e]">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#313244] bg-[#181825]">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold tracking-widest"><span className="bg-gradient-to-r from-[#cba6f7] to-[#89b4fa] bg-clip-text text-transparent">Chiaki</span></h1>
          {/* Connection status indicator - subtle dot */}
          <div
            className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-[#a6e3a1]' : 'bg-[#f38ba8] animate-pulse'}`}
            title={isHealthy ? 'Anki Connected' : 'Anki Disconnected - Please open Anki'}
          />
          {!isHealthy && (
            <AlertCircle size={14} className="text-[#f38ba8]" />
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Search button */}
          <button
            onClick={() => setShowSearchModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#313244] text-[#a6adc8] text-sm rounded-lg hover:bg-[#45475a] transition-colors group"
          >
            <Search size={16} />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#181825] text-[#6c7086] text-xs rounded group-hover:bg-[#313244]">
              <span className="text-[10px]">⌘</span>K
            </kbd>
          </button>

          {/* Study All button */}
          {dueCounts && dueCounts.total_due > 0 && (
            <button
              onClick={() => setShowStudyAllModal(true)}
              className="px-3 py-1.5 bg-[#cba6f7]/20 text-[#cba6f7] text-sm rounded-lg hover:bg-[#cba6f7]/30 flex items-center gap-2 transition-colors"
            >
              <BookOpen size={16} />
              Study All
              <span className="bg-[#cba6f7]/30 px-1.5 py-0.5 rounded text-xs font-medium">
                {dueCounts.total_due}
              </span>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Secondary header row */}
        <div className="flex border-b border-[#313244] bg-[#181825] shrink-0">
          <div
            style={{ width: sidebarWidth }}
            className="px-4 py-2 flex items-center justify-between border-r border-[#313244] shrink-0"
          >
            <h2 className="font-bold text-sm text-[#bac2de]">
              {refreshStatus || 'Decks'}
            </h2>
            <button
              onClick={handleRefreshDecks}
              disabled={isRefreshingDecks}
              className="p-1 hover:bg-[#313244] rounded disabled:opacity-50"
              title="Sync with AnkiWeb and refresh"
            >
              <RefreshCw size={16} className={`text-[#a6adc8] ${isRefreshingDecks ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex-1 px-4 py-2 flex items-center justify-between">
            <h2 className="font-medium text-sm text-[#bac2de]">
              {selectedDeck?.name || 'Select a deck'}
            </h2>
            {selectedDeck && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowStudyModal(true)}
                  className="px-3 py-1 bg-[#cba6f7]/20 text-[#cba6f7] text-sm rounded hover:bg-[#cba6f7]/30 flex items-center gap-1 transition-colors"
                >
                  <BookOpen size={14} />
                  Study
                </button>
                <button
                  onClick={handleAddNew}
                  className="px-3 py-1 bg-[#a6e3a1]/20 text-[#a6e3a1] text-sm rounded hover:bg-[#a6e3a1]/30 flex items-center gap-1 transition-colors"
                >
                  + New Card
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">
          <aside
            style={{ width: sidebarWidth }}
            className="border-r border-[#313244] bg-[#181825] shrink-0 flex flex-col"
          >
            <div className="flex-1 overflow-auto">
              <DeckTree
                key={treeKey}
                selectedDeckId={selectedDeck?.id ?? null}
                onSelectDeck={handleSelectDeck}
              />
            </div>
            <DeckHealthPanel />
          </aside>

          {/* Resize handle */}
          <div
            onMouseDown={startResize}
            className={`w-1 cursor-col-resize hover:bg-[#89b4fa] transition-colors ${
              isResizing ? 'bg-[#89b4fa]' : 'bg-transparent'
            }`}
          />

          <main className="flex-1 min-w-0 flex">
            <div className="flex-1 min-w-0 flex flex-col bg-[#1e1e2e]">
              {/* Deck Toolbar - quick access to deck-level tools */}
              {selectedDeck && (
                <DeckToolbar deckId={selectedDeck.id} />
              )}

              {/* Card list area - always takes remaining space */}
              <div className="flex-1 relative">
                <div className="absolute inset-0 overflow-auto">
                {selectedDeck ? (
                  <CardList
                    deckId={selectedDeck.id}
                    includeChildren={includeChildren}
                    onEdit={handleEditCard}
                    onDelete={handleDeleteCard}
                    onView={handleViewCard}
                    selectedCardId={viewingCard?.card.card_id ?? null}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-[#6c7086]">
                    Select a deck to view cards
                  </div>
                )}
                </div>
              </div>
            </div>

            {viewingCard && selectedDeck && (
              <CardDetailPanel
                card={viewingCard.card}
                cardIndex={viewingCard.index}
                deckId={selectedDeck.id}
                onClose={() => setViewingCard(null)}
                onEdit={handleEditCard}
                onDelete={handleDeleteCard}
                onAudioGenerated={handleAudioGenerated}
              />
            )}
          </main>
        </div>
      </div>

      <CardFormModal
        isOpen={showCardModal}
        onClose={handleCloseModal}
        deckName={selectedDeck?.name || ''}
        deckId={selectedDeck?.id}
        editCard={editingCard}
      />

      {selectedDeck && (
        <StudyModal
          isOpen={showStudyModal}
          onClose={() => setShowStudyModal(false)}
          deckId={selectedDeck.id}
          deckName={selectedDeck.name}
        />
      )}

      {/* Study All Modal */}
      <StudyModal
        isOpen={showStudyAllModal}
        onClose={() => setShowStudyAllModal(false)}
        deckId={null}
        deckName="All Decks"
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectCard={handleSearchSelectCard}
      />
    </div>
  );
}
