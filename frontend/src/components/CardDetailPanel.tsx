import { useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Edit2, Trash2, Volume2, GripVertical, MessageCircle } from 'lucide-react';
import type { Card } from '../types';
import { HtmlContent } from './HtmlContent';
import { CardToolbar } from './CardToolbar';
import { AskAIModal } from './AskAIModal';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';
const MIN_WIDTH = 360;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 480;

interface Props {
  card: Card;
  cardIndex: number;
  deckId: number;
  onClose: () => void;
  onEdit: (card: Card) => void;
  onDelete: (noteId: number) => void;
  onAudioGenerated?: () => void;
}

export function CardDetailPanel({ card, cardIndex, deckId, onClose, onEdit, onDelete, onAudioGenerated }: Props) {
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAskAI, setShowAskAI] = useState(false);

  const playAudio = () => {
    if (!card.audio_file || !audioRef.current) return;
    // Add timestamp to bust browser cache after regeneration
    const audioUrl = `${API_BASE}/api/audio/play/${encodeURIComponent(card.audio_file)}?t=${Date.now()}`;
    audioRef.current.src = audioUrl;
    audioRef.current.play();
    setIsPlaying(true);
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width]);

  return (
    <div
      className="border-l border-gray-200 dark:border-[#313244] bg-gradient-to-b from-white to-gray-50 dark:from-[#181825] dark:to-[#11111b] flex flex-col h-full relative shadow-lg"
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-[#89b4fa] group flex items-center"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute -left-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={12} className="text-gray-400 dark:text-[#6c7086]" />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-[#313244] bg-white/80 dark:bg-[#181825]/80 backdrop-blur">
        <h3 className="font-semibold text-gray-800 dark:text-[#cdd6f4]">Card Details</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-gray-100 dark:hover:bg-[#313244] rounded-lg transition-colors"
          aria-label="Close panel"
        >
          <X size={20} className="text-gray-500 dark:text-[#a6adc8]" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5 space-y-5">
        {/* Word - Hero section */}
        <div className="text-center pb-4 border-b border-gray-200 dark:border-[#313244]">
          <p className="text-4xl text-gray-900 dark:text-[#cdd6f4] mb-2">
            {card.fields.Word?.value}
          </p>
          <p className="text-lg text-blue-600 dark:text-[#94e2d5] font-medium">
            {card.fields.Pinyin?.value}
          </p>
          {card.fields.Sino?.value && (
            <div className="text-sm text-gray-500 dark:text-[#a6adc8] mt-1">
              <HtmlContent html={card.fields.Sino?.value} inline />
            </div>
          )}
          {/* Play Audio button - only if audio exists */}
          {card.audio_file && (
            <div className="mt-3">
              <button
                onClick={playAudio}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  isPlaying
                    ? 'bg-green-100 dark:bg-[#a6e3a1]/20 text-green-700 dark:text-[#a6e3a1] animate-pulse'
                    : 'bg-green-500 dark:bg-[#a6e3a1]/20 text-white dark:text-[#a6e3a1] hover:bg-green-600 dark:hover:bg-[#a6e3a1]/30'
                }`}
              >
                <Volume2 size={16} />
                {isPlaying ? 'Playing...' : 'Play Audio'}
              </button>
            </div>
          )}
          <audio
            ref={audioRef}
            className="hidden"
            onEnded={() => setIsPlaying(false)}
          />
        </div>

        {/* Card Tools - unified toolbar for all operations */}
        <CardToolbar
          card={card}
          cardIndex={cardIndex}
          deckId={deckId}
          onCardUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
            onAudioGenerated?.();
          }}
        />

        {/* Definition */}
        {card.fields.Definition?.value && (
          <div className="bg-white dark:bg-[#313244]/50 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-[#45475a]">
            <label className="text-xs font-semibold text-gray-400 dark:text-[#a6adc8] uppercase tracking-wide">
              Definition
            </label>
            <div className="text-gray-700 dark:text-[#cdd6f4] mt-1 leading-relaxed">
              <HtmlContent html={card.fields.Definition?.value} />
            </div>
          </div>
        )}

        {/* Tip */}
        {card.fields.Tip?.value && (
          <div className="bg-amber-50 dark:bg-[#f9e2af]/10 rounded-lg p-4 border border-amber-100 dark:border-[#f9e2af]/20">
            <label className="text-xs font-semibold text-amber-600 dark:text-[#f9e2af] uppercase tracking-wide">
              Tip
            </label>
            <div className="text-amber-800 dark:text-[#f9e2af]/90 mt-1 text-sm">
              <HtmlContent html={card.fields.Tip?.value} />
            </div>
          </div>
        )}

        {/* Example */}
        {card.fields.Example?.value && (
          <div className="bg-blue-50 dark:bg-[#89b4fa]/10 rounded-lg p-4 border border-blue-100 dark:border-[#89b4fa]/20">
            <label className="text-xs font-semibold text-blue-600 dark:text-[#89b4fa] uppercase tracking-wide">
              Example
            </label>
            <div className="text-blue-800 dark:text-[#89b4fa]/90 mt-1 text-sm">
              <HtmlContent html={card.fields.Example?.value} />
            </div>
          </div>
        )}

        {/* Simplified */}
        {card.fields.Simplified?.value && (
          <div className="bg-gray-100 dark:bg-[#313244]/50 rounded-lg p-4">
            <label className="text-xs font-semibold text-gray-400 dark:text-[#a6adc8] uppercase tracking-wide">
              Simplified
            </label>
            <p className="text-gray-700 dark:text-[#cdd6f4] mt-1">
              {card.fields.Simplified?.value}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-200 dark:border-[#313244] bg-white dark:bg-[#181825] flex gap-3">
        <button
          onClick={() => setShowAskAI(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#cba6f7]/20 text-[#cba6f7] rounded-lg text-sm font-medium hover:bg-[#cba6f7]/30 transition-colors"
          title="AI Assistant"
        >
          <MessageCircle size={16} />
        </button>
        <button
          onClick={() => onEdit(card)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 dark:bg-[#89b4fa]/20 text-white dark:text-[#89b4fa] rounded-lg text-sm font-medium hover:bg-blue-600 dark:hover:bg-[#89b4fa]/30 transition-colors"
        >
          <Edit2 size={16} />
          Edit
        </button>
        <button
          onClick={() => onDelete(card.note_id)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 dark:border-[#f38ba8]/30 text-red-600 dark:text-[#f38ba8] rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-[#f38ba8]/10 transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Ask AI Modal */}
      <AskAIModal
        isOpen={showAskAI}
        onClose={() => setShowAskAI(false)}
        card={card}
      />
    </div>
  );
}
