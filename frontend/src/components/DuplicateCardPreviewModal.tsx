import { useState, useEffect, useRef } from 'react';
import { X, Volume2, Loader2, AlertCircle, Edit2 } from 'lucide-react';
import { fetchNote, type NoteData } from '../api/cards';
import type { Card } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface Props {
  isOpen: boolean;
  noteId: number;
  cardId?: number; // Optional: card ID for edit
  deckName: string;
  onClose: () => void;
  onGoToCard?: () => void; // Optional: navigate to the card
  onEdit?: (card: Card) => void; // Optional: edit the card
}

// Extract audio filename from [sound:filename.mp3] format
function extractAudioFilename(value: string): string | null {
  const match = value.match(/\[sound:(.+?)\]/);
  return match?.[1] || null;
}

export function DuplicateCardPreviewModal({ isOpen, noteId, cardId, deckName, onClose, onGoToCard, onEdit }: Props) {
  const [noteData, setNoteData] = useState<NoteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch note data on open
  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    setError(null);

    fetchNote(noteId)
      .then((data) => {
        setNoteData(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load card');
        setIsLoading(false);
      });

    return () => {
      // Cleanup audio on close
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [isOpen, noteId]);

  if (!isOpen) return null;

  const fields = noteData?.fields || {};
  const word = fields.Word?.value || '';
  const pinyin = fields.Pinyin?.value || '';
  const sino = fields.Sino?.value || '';
  const definition = fields.Definition?.value || '';
  const tip = fields.Tip?.value || '';
  const example = fields.Example?.value || '';
  const simplified = fields.Simplified?.value || '';
  const audioField = fields.Audio?.value || '';
  const audioFilename = extractAudioFilename(audioField);

  const playAudio = () => {
    if (!audioFilename) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }

    const audioUrl = `${API_BASE_URL}/api/audio/play/${encodeURIComponent(audioFilename)}`;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onplay = () => setIsPlaying(true);
    audio.onended = () => {
      setIsPlaying(false);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setIsPlaying(false);
      audioRef.current = null;
    };

    audio.play().catch(() => setIsPlaying(false));
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70]"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-b from-[#181825] to-[#11111b] rounded-lg w-full max-w-lg mx-4 shadow-xl border border-[#313244] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#313244] bg-[#181825]/80 backdrop-blur shrink-0">
          <div>
            <h3 className="font-semibold text-[#cdd6f4]">Existing Card</h3>
            <p className="text-xs text-[#6c7086]">{deckName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#313244] rounded-full transition-colors"
          >
            <X size={16} className="text-[#a6adc8]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-[#cba6f7]" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[#f38ba8]">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          ) : (
            <>
              {/* Hero section - Word, Pinyin, Sino centered */}
              <div className="text-center pb-4 border-b border-[#313244]">
                <p className="text-4xl text-[#cdd6f4] mb-2">
                  {word || <span className="text-[#6c7086]">[Word]</span>}
                </p>
                <p className="text-lg text-[#94e2d5] font-medium">
                  {pinyin || <span className="text-[#6c7086] text-base">[Pinyin]</span>}
                </p>
                {sino && (
                  <p className="text-sm text-[#a6adc8] mt-1">{sino}</p>
                )}
                {/* Play Audio button */}
                {audioFilename && (
                  <div className="mt-3">
                    <button
                      onClick={playAudio}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        isPlaying
                          ? 'bg-[#a6e3a1]/20 text-[#a6e3a1] animate-pulse'
                          : 'bg-[#a6e3a1]/20 text-[#a6e3a1] hover:bg-[#a6e3a1]/30'
                      }`}
                    >
                      <Volume2 size={16} />
                      {isPlaying ? 'Playing...' : 'Play Audio'}
                    </button>
                  </div>
                )}
              </div>

              {/* Definition - neutral container */}
              {definition && (
                <div className="bg-[#313244]/50 rounded-lg p-4 border border-[#45475a]">
                  <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
                    Definition
                  </label>
                  <div
                    className="text-[#cdd6f4] mt-1 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: definition }}
                  />
                </div>
              )}

              {/* Tip - amber container */}
              {tip && (
                <div className="bg-[#f9e2af]/10 rounded-lg p-4 border border-[#f9e2af]/20">
                  <label className="text-xs font-semibold text-[#f9e2af] uppercase tracking-wide">
                    Tip
                  </label>
                  <div
                    className="text-[#f9e2af]/90 mt-1 text-sm"
                    dangerouslySetInnerHTML={{ __html: tip }}
                  />
                </div>
              )}

              {/* Example - blue container */}
              {example && (
                <div className="bg-[#89b4fa]/10 rounded-lg p-4 border border-[#89b4fa]/20">
                  <label className="text-xs font-semibold text-[#89b4fa] uppercase tracking-wide">
                    Example
                  </label>
                  <div
                    className="text-[#89b4fa]/90 mt-1 text-sm"
                    dangerouslySetInnerHTML={{ __html: example }}
                  />
                </div>
              )}

              {/* Simplified - gray container */}
              {simplified && (
                <div className="bg-[#313244]/50 rounded-lg p-4">
                  <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
                    Simplified
                  </label>
                  <p className="text-[#cdd6f4] mt-1">{simplified}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-[#313244] bg-[#181825] shrink-0 flex gap-2">
          {onEdit && noteData && (
            <button
              onClick={() => {
                // Convert noteData to Card format for editing
                const card: Card = {
                  card_id: cardId || 0,
                  note_id: noteId,
                  deck_name: deckName,
                  fields: noteData.fields,
                  audio_file: extractAudioFilename(noteData.fields.Audio?.value || ''),
                  audio_index: 0,
                };
                onEdit(card);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#89b4fa]/20 text-[#89b4fa] rounded-lg text-sm font-medium hover:bg-[#89b4fa]/30 transition-colors"
            >
              <Edit2 size={16} />
              Edit
            </button>
          )}
          {onGoToCard && (
            <button
              onClick={onGoToCard}
              className="flex-1 px-4 py-2 bg-[#cba6f7]/20 text-[#cba6f7] rounded-lg text-sm font-medium hover:bg-[#cba6f7]/30 transition-colors"
            >
              Go to Card
            </button>
          )}
          <button
            onClick={onClose}
            className={`px-4 py-2 bg-[#313244] text-[#cdd6f4] rounded-lg text-sm font-medium hover:bg-[#45475a] transition-colors ${onGoToCard || onEdit ? '' : 'w-full'}`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
