import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Check, SkipForward, Minus, Plus, Zap, Volume2, Square } from 'lucide-react';
import { fetchNote, type NoteData } from '../api/cards';
import { SourceBadge } from './field-suggestion/SourceBadge';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

export interface FieldChange {
  fieldName: string;
  beforeValue: string;
  afterValue: string;
  source?: 'dictionary' | 'ai' | 'local';
  confidence?: number;
}

interface CardPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteId: number;
  word: string;
  changes: FieldChange[];
  onApply: () => Promise<void>;
  onSkip: () => void;
  isApplying?: boolean;
}

// Field display order and labels
const FIELD_ORDER = ['Word', 'Pinyin', 'Sino', 'Definition', 'Example', 'Audio', 'Simplified'];
const FIELD_LABELS: Record<string, string> = {
  Word: 'Word',
  Pinyin: 'Pinyin',
  Sino: 'Sino-Vietnamese',
  Definition: 'Definition',
  Example: 'Examples',
  Audio: 'Audio',
  Simplified: 'Simplified',
};

export function CardPreviewModal({
  isOpen,
  onClose,
  noteId,
  word,
  changes,
  onApply,
  onSkip,
  isApplying = false,
}: CardPreviewModalProps) {
  const [noteData, setNoteData] = useState<NoteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch full card data when modal opens
  useEffect(() => {
    if (isOpen && noteId) {
      setIsLoading(true);
      setError(null);
      fetchNote(noteId)
        .then(setNoteData)
        .catch((err) => setError(err.message || 'Failed to load card'))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, noteId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setNoteData(null);
      setError(null);
      setIsPlayingAudio(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Create a map of field changes for quick lookup
  const changesMap = new Map(
    changes.map((c) => [c.fieldName, c])
  );

  // Get field value from noteData
  const getFieldValue = (fieldName: string): string => {
    if (!noteData) return '';
    const field = noteData.fields[fieldName];
    return field?.value || '';
  };

  // Check if a field is being changed
  const isFieldChanging = (fieldName: string): boolean => {
    return changesMap.has(fieldName);
  };

  // Extract filename from audio field value
  const extractAudioFilename = (value: string): string | null => {
    const match = value.match(/\[sound:(.+?)\]/);
    return match?.[1] || null;
  };

  // Play/stop audio
  const handlePlayAudio = (filename: string) => {
    if (isPlayingAudio && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlayingAudio(false);
      return;
    }

    const audioUrl = `${API_BASE_URL}/api/audio/play/${encodeURIComponent(filename)}`;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onplay = () => setIsPlayingAudio(true);
    audio.onended = () => {
      setIsPlayingAudio(false);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setIsPlayingAudio(false);
      audioRef.current = null;
    };

    audio.play().catch(() => setIsPlayingAudio(false));
  };

  // Render audio field with play button if it has content
  const renderAudioField = (value: string) => {
    if (!value || !value.includes('[sound:')) {
      return <span className="text-[#6c7086]">[Empty]</span>;
    }

    const filename = extractAudioFilename(value);
    if (!filename) {
      return <span className="text-[#6c7086] italic">(invalid audio format)</span>;
    }

    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => handlePlayAudio(filename)}
          className={`p-2 rounded-full transition-colors ${
            isPlayingAudio
              ? 'bg-[#f38ba8]/20 text-[#f38ba8] hover:bg-[#f38ba8]/30'
              : 'bg-[#89b4fa]/20 text-[#89b4fa] hover:bg-[#89b4fa]/30'
          }`}
          title={isPlayingAudio ? 'Stop' : 'Play audio'}
        >
          {isPlayingAudio ? <Square size={14} /> : <Volume2 size={14} />}
        </button>
        <span className="text-sm text-[#a6adc8]">{filename}</span>
      </div>
    );
  };

  // Render field value (handle empty and audio)
  const renderFieldValue = (fieldName: string, value: string) => {
    if (fieldName === 'Audio') {
      return renderAudioField(value);
    }
    if (!value || !value.trim()) {
      return <span className="text-[#6c7086]">[Empty]</span>;
    }
    // For HTML content, render safely
    if (value.includes('<')) {
      return (
        <div
          className="text-[#cdd6f4]"
          dangerouslySetInnerHTML={{ __html: value }}
        />
      );
    }
    return <span className="text-[#cdd6f4]">{value}</span>;
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-[#1e1e2e] rounded-lg w-full max-w-2xl mx-4 shadow-xl border border-[#313244] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#313244] shrink-0">
          <h2 className="font-semibold text-[#cdd6f4] flex items-center gap-2">
            Preview: <span className="text-[#f9e2af]">{word}</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#313244] rounded-full"
          >
            <X size={18} className="text-[#a6adc8]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[#89b4fa]" />
              <span className="ml-2 text-[#a6adc8]">Loading card data...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-[#f38ba8]">
              <p>{error}</p>
            </div>
          )}

          {noteData && !isLoading && (
            <div className="space-y-1">
              {FIELD_ORDER.map((fieldName) => {
                const currentValue = getFieldValue(fieldName);
                const change = changesMap.get(fieldName);
                const isChanging = isFieldChanging(fieldName);

                return (
                  <div
                    key={fieldName}
                    className={`rounded-lg transition-all ${
                      isChanging
                        ? 'border-l-4 border-[#f9e2af] bg-[#f9e2af]/5 p-3'
                        : 'p-3 hover:bg-[#313244]/30'
                    }`}
                  >
                    {/* Field label */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-[#a6adc8] font-medium uppercase tracking-wide">
                        {FIELD_LABELS[fieldName] || fieldName}
                      </span>
                      {isChanging && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#f9e2af]/20 text-[#f9e2af] rounded text-xs font-medium">
                          <Zap size={10} />
                          Changing
                        </span>
                      )}
                    </div>

                    {/* Field content */}
                    {isChanging && change ? (
                      <div className="space-y-2 mt-2">
                        {/* Before value */}
                        <div className="flex items-center gap-2">
                          <Minus size={14} className="text-[#f38ba8] shrink-0" />
                          <div className="flex-1 px-2 py-1.5 bg-[#f38ba8]/10 rounded text-sm">
                            {change.beforeValue ? (
                              <span className="text-[#f38ba8] line-through opacity-70">
                                {change.beforeValue.includes('<') ? (
                                  <span dangerouslySetInnerHTML={{ __html: change.beforeValue }} />
                                ) : (
                                  change.beforeValue
                                )}
                              </span>
                            ) : (
                              <span className="text-[#f38ba8]/50">[Empty]</span>
                            )}
                          </div>
                        </div>

                        {/* After value */}
                        <div className="flex items-center gap-2">
                          <Plus size={14} className="text-[#a6e3a1] shrink-0" />
                          <div className="flex-1 px-2 py-1.5 bg-[#a6e3a1]/10 rounded text-sm">
                            <span className="text-[#a6e3a1] font-medium">
                              {change.afterValue.includes('<') ? (
                                <span dangerouslySetInnerHTML={{ __html: change.afterValue }} />
                              ) : (
                                change.afterValue
                              )}
                            </span>
                          </div>
                          {change.source && (
                            <div className="shrink-0 flex items-center gap-2">
                              <SourceBadge source={change.source} />
                              {change.confidence !== undefined && (
                                <span className="relative group">
                                  <span className="text-xs text-[#a6adc8] cursor-help">
                                    {Math.round(change.confidence * 100)}%
                                  </span>
                                  <span className="absolute top-full right-0 mt-1 px-2 py-1 text-xs text-white bg-[#45475a] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    AI confidence level
                                  </span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm">
                        {renderFieldValue(fieldName, currentValue)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-[#313244] flex gap-3 shrink-0">
          <button
            onClick={onSkip}
            disabled={isApplying}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#313244] text-[#cdd6f4] rounded-lg text-sm font-medium hover:bg-[#45475a] disabled:opacity-50"
          >
            <SkipForward size={16} />
            Skip
          </button>

          <button
            onClick={onApply}
            disabled={isApplying}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#a6e3a1]/20 text-[#a6e3a1] rounded-lg text-sm font-medium hover:bg-[#a6e3a1]/30 disabled:opacity-50"
          >
            {isApplying ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            Apply Change
          </button>
        </div>
      </div>
    </div>
  );
}
