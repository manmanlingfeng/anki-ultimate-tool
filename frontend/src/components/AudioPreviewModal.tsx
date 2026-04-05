import { useRef, useState } from 'react';
import { X, Volume2, Loader2, Check, XCircle, Play, Pause, Music } from 'lucide-react';
import type { Card } from '../types';
import { VoiceSelectorInline } from './VoiceSelectorInline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  card: Card;
  filename: string | null;
  isLoading: boolean;
  error: string | null;
  onGenerate: () => void;
  onApply: (filename: string) => Promise<void>;
  onDiscard: (filename: string) => Promise<void>;
}

export function AudioPreviewModal({
  isOpen,
  onClose,
  card,
  filename,
  isLoading,
  error,
  onGenerate,
  onApply,
  onDiscard,
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!isOpen) return null;

  // Determine current state: initial (no action yet), loading, error, or preview
  const isInitialState = !filename && !isLoading && !error;

  const playAudio = () => {
    if (!filename) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    const audio = new Audio(`${API_BASE}/api/audio/play/${filename}?t=${Date.now()}`);
    audioRef.current = audio;
    setIsPlaying(true);

    audio.onended = () => {
      setIsPlaying(false);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setIsPlaying(false);
      audioRef.current = null;
    };

    audio.play().catch(() => {
      setIsPlaying(false);
      audioRef.current = null;
    });
  };

  const handleApply = async () => {
    if (!filename) return;
    setIsApplying(true);
    try {
      await onApply(filename);
      handleClose();
    } finally {
      setIsApplying(false);
    }
  };

  const handleDiscard = async () => {
    if (filename) {
      await onDiscard(filename);
    }
    handleClose();
  };

  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e2e] rounded-lg w-full max-w-md mx-4 shadow-xl border border-[#313244]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#313244]">
          <h2 className="font-semibold text-[#cdd6f4] flex items-center gap-2">
            <Volume2 size={18} className="text-[#cba6f7]" />
            {isInitialState ? 'Generate New Audio' : 'Preview New Audio'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-[#313244] rounded-full transition-colors"
          >
            <X size={18} className="text-[#a6adc8]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Word display */}
          <div className="text-center mb-4">
            <p className="text-3xl text-[#cdd6f4] mb-1">{card.fields.Word?.value}</p>
            <p className="text-lg text-[#94e2d5]">{card.fields.Pinyin?.value}</p>
          </div>

          {/* Voice selector - show in initial state or always */}
          <div className="mb-4">
            <VoiceSelectorInline compact />
          </div>

          {/* Initial state - show generate button */}
          {isInitialState && (
            <div className="space-y-3">
              <p className="text-sm text-[#a6adc8] text-center">
                Confirm voice settings above, then generate audio
              </p>
              <button
                onClick={onGenerate}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-[#cba6f7]/20 text-[#cba6f7] rounded-lg hover:bg-[#cba6f7]/30 transition-colors font-medium"
              >
                <Music size={20} />
                Generate Audio
              </button>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="flex flex-col items-center py-6">
              <Loader2 className="animate-spin text-[#cba6f7] mb-3" size={32} />
              <p className="text-[#a6adc8]">Generating audio...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="space-y-3">
              <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg p-4 text-center">
                <p className="text-[#f38ba8] font-medium">Error</p>
                <p className="text-sm text-[#f38ba8]/80 mt-1">{error}</p>
              </div>
              <button
                onClick={onGenerate}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#313244] text-[#cdd6f4] rounded-lg hover:bg-[#45475a] transition-colors text-sm"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Preview state */}
          {filename && !isLoading && !error && (
            <div className="space-y-4">
              <button
                onClick={playAudio}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-[#cba6f7]/20 text-[#cba6f7] rounded-lg hover:bg-[#cba6f7]/30 transition-colors"
              >
                {isPlaying ? (
                  <>
                    <Pause size={24} />
                    <span className="text-lg">Stop Preview</span>
                  </>
                ) : (
                  <>
                    <Play size={24} />
                    <span className="text-lg">Play Preview</span>
                  </>
                )}
              </button>

              <p className="text-xs text-[#6c7086] text-center">
                File: {filename}
              </p>
            </div>
          )}
        </div>

        {/* Actions - show apply/discard after preview */}
        {filename && !isLoading && !error && (
          <div className="p-4 border-t border-[#313244] flex gap-3">
            <button
              onClick={handleDiscard}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#313244] text-[#a6adc8] rounded-lg text-sm font-medium hover:bg-[#45475a] transition-colors"
            >
              <XCircle size={16} />
              Discard
            </button>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#a6e3a1]/20 text-[#a6e3a1] rounded-lg text-sm font-medium hover:bg-[#a6e3a1]/30 transition-colors disabled:opacity-50"
            >
              {isApplying ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
