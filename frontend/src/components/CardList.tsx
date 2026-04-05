import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useDeckCards } from '../hooks/useCards';
import type { Card } from '../types';
import { Volume2, VolumeX, Edit2, Trash2, Loader2 } from 'lucide-react';
import { HtmlContent } from './HtmlContent';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface Props {
  deckId: number;
  includeChildren?: boolean;
  onEdit: (card: Card) => void;
  onDelete: (noteId: number) => void;
  onView: (card: Card, index: number) => void;
  selectedCardId: number | null;
}

export function CardList({ deckId, includeChildren = true, onEdit, onDelete, onView, selectedCardId }: Props) {
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useDeckCards(deckId, includeChildren);

  // Flatten paginated data into single array
  const cards = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.cards);
  }, [data]);

  const total = data?.pages[0]?.total ?? 0;

  const audioRef = useRef<HTMLAudioElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  // Infinite scroll with Intersection Observer
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [target] = entries;
    if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '100px',
      threshold: 0.1
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [handleObserver]);

  const playAudio = (card: Card) => {
    if (!card.audio_file || !audioRef.current) return;
    // Add timestamp to bust browser cache after regeneration
    // eslint-disable-next-line react-hooks/purity -- this is called on click, not during render
    const audioUrl = `${API_BASE}/api/audio/play/${encodeURIComponent(card.audio_file)}?t=${Date.now()}`;
    audioRef.current.src = audioUrl;
    audioRef.current.play();
    setPlayingId(card.card_id);
  };

  const handleAudioEnded = () => {
    setPlayingId(null);
  };

  // Skeleton row for loading state
  const SkeletonRow = () => (
    <tr className="animate-pulse">
      <td className="px-3 py-2"><div className="h-4 w-6 bg-gray-200 dark:bg-[#313244] rounded" /></td>
      <td className="px-3 py-2"><div className="h-5 w-12 bg-gray-200 dark:bg-[#313244] rounded" /></td>
      <td className="px-3 py-2"><div className="h-4 w-16 bg-gray-200 dark:bg-[#313244] rounded" /></td>
      <td className="px-3 py-2"><div className="h-4 w-10 bg-gray-200 dark:bg-[#313244] rounded" /></td>
      <td className="px-3 py-2"><div className="h-4 w-32 bg-gray-200 dark:bg-[#313244] rounded" /></td>
      <td className="px-3 py-2"><div className="h-4 w-4 bg-gray-200 dark:bg-[#313244] rounded" /></td>
      <td className="px-3 py-2"><div className="h-4 w-12 bg-gray-200 dark:bg-[#313244] rounded" /></td>
    </tr>
  );

  return (
    <div>
      {!isLoading && !cards?.length ? (
        <div className="p-8 text-center text-gray-500 dark:text-[#6c7086]">
          No cards in this deck
        </div>
      ) : (
        <>
          {/* Card count header */}
          {total > 0 && (
            <div className="px-3 py-1.5 text-xs text-[#6c7086] bg-[#181825] border-b border-[#313244]">
              Showing {cards.length} of {total} cards
            </div>
          )}
          <table className="w-full min-w-[850px]">
            <thead className="bg-gray-50 dark:bg-[#181825] sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-[#a6adc8] w-12">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-[#a6adc8] min-w-[80px]">Word</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-[#a6adc8] min-w-[100px]">Pinyin</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-[#a6adc8] min-w-[80px]">Sino</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-[#a6adc8] min-w-[200px]">Definition</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-[#a6adc8] w-16">Audio</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-[#a6adc8] w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#313244]">
              {isLoading ? (
                // Show skeleton rows while loading
                Array.from({ length: 8 }).map((_, idx) => (
                  <SkeletonRow key={idx} />
                ))
              ) : cards?.map((card, idx) => (
                <tr
                  key={card.card_id}
                  className={`hover:bg-gray-50 dark:hover:bg-[#313244]/50 cursor-pointer transition-colors ${selectedCardId === card.card_id ? 'bg-blue-50 dark:bg-[#cba6f7]/10' : ''}`}
                  onClick={() => onView(card, idx)}
                >
                  <td className="px-3 py-2 text-sm text-gray-500 dark:text-[#6c7086]">{idx}</td>
                  <td className="px-3 py-2 text-lg font-medium dark:text-[#cdd6f4]">{card.fields.Word?.value}</td>
                  <td className="px-3 py-2 text-sm dark:text-[#94e2d5]">{card.fields.Pinyin?.value}</td>
                  <td className="px-3 py-2 text-sm dark:text-[#a6adc8]">
                    <HtmlContent html={card.fields.Sino?.value || ''} inline />
                  </td>
                  <td className="px-3 py-2 text-sm max-w-xs truncate dark:text-[#bac2de]">
                    <HtmlContent html={card.fields.Definition?.value || ''} />
                  </td>
                  <td className="px-3 py-2">
                    {card.audio_file ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); playAudio(card); }}
                        className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-[#313244] ${playingId === card.card_id ? 'animate-pulse' : ''}`}
                        title="Play audio"
                      >
                        <Volume2 size={16} className="text-green-600 dark:text-[#a6e3a1]" />
                      </button>
                    ) : (
                      <VolumeX size={16} className="text-gray-400 dark:text-[#6c7086]" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); onEdit(card); }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-[#313244] rounded dark:text-[#a6adc8]"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(card.note_id); }}
                        className="p-1 hover:bg-red-100 dark:hover:bg-[#f38ba8]/20 rounded text-red-600 dark:text-[#f38ba8]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Infinite scroll sentinel */}
          <div ref={loadMoreRef} className="py-4 flex justify-center">
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-[#6c7086]">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Loading more...</span>
              </div>
            )}
            {!hasNextPage && cards.length > 0 && (
              <span className="text-xs text-[#6c7086]">All {total} cards loaded</span>
            )}
          </div>
        </>
      )}
      <audio ref={audioRef} onEnded={handleAudioEnded} className="hidden" />
    </div>
  );
}
