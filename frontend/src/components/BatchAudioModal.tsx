import { useState, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  SkipForward,
  Loader2,
  Volume2,
  CheckCircle,
  XCircle,
  Clock,
  Square,
  Play,
  Pause,
} from 'lucide-react';
import type { UseAudioGeneratorReturn } from '../hooks/useAudioGenerator';
import { VoiceSelectorInline } from './VoiceSelectorInline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  generator: UseAudioGeneratorReturn;
  onApproveComplete?: () => void;
  onStartGenerate: () => void;
  mode: 'fill_missing' | 'regen_all';
}

export function BatchAudioModal({ isOpen, onClose, generator, onApproveComplete, onStartGenerate, mode }: Props) {
  const [isApproving, setIsApproving] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!isOpen) return null;

  // Check if we're in initial state (not started, no results)
  const isInitialState = !generator.isStreaming && generator.results.length === 0 && !generator.error;

  const currentResult = generator.results[generator.currentIndex];
  const pendingCount = generator.results.filter(r => r.status === 'pending').length;
  const approvedCount = generator.results.filter(r => r.status === 'approved').length;
  const skippedCount = generator.results.filter(r => r.status === 'skipped').length;

  const playAudio = (filename: string, index: number) => {
    // Stop current audio if playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playingIndex === index) {
      setPlayingIndex(null);
      return;
    }

    const audio = new Audio(`${API_BASE}/api/audio/play/${filename}`);
    audioRef.current = audio;
    setPlayingIndex(index);

    audio.onended = () => {
      setPlayingIndex(null);
      audioRef.current = null;
    };
    audio.onerror = (e) => {
      console.error('Audio playback error:', e);
      setPlayingIndex(null);
      audioRef.current = null;
    };

    // Handle play() promise rejection (required for autoplay policies)
    audio.play().catch((err) => {
      console.error('Audio play failed:', err);
      setPlayingIndex(null);
      audioRef.current = null;
    });
  };

  const handleApprove = async () => {
    if (!currentResult || currentResult.status !== 'pending') return;
    setIsApproving(true);
    try {
      await generator.approveResult(generator.currentIndex);
      onApproveComplete?.();
      // Auto-advance to next pending item
      const nextPendingIndex = generator.results.findIndex(
        (r, i) => i > generator.currentIndex && r.status === 'pending'
      );
      if (nextPendingIndex !== -1) {
        generator.setCurrentIndex(nextPendingIndex);
      } else {
        generator.goToNext();
      }
    } finally {
      setIsApproving(false);
    }
  };

  const handleSkip = () => {
    generator.skipResult(generator.currentIndex);
    // Auto-advance to next pending item
    const nextPendingIndex = generator.results.findIndex(
      (r, i) => i > generator.currentIndex && r.status === 'pending'
    );
    if (nextPendingIndex !== -1) {
      generator.setCurrentIndex(nextPendingIndex);
    } else {
      generator.goToNext();
    }
  };

  const handleApproveAll = async () => {
    setIsApprovingAll(true);
    try {
      await generator.approveAll();
      onApproveComplete?.();
    } finally {
      setIsApprovingAll(false);
    }
  };

  const handleClose = async () => {
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // Optionally discard rejected files
    await generator.discardRejected();
    onClose();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#a6e3a1]/20 text-[#a6e3a1]">
            <CheckCircle size={12} /> Applied
          </span>
        );
      case 'skipped':
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#6c7086]/20 text-[#6c7086]">
            <XCircle size={12} /> Skipped
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#f9e2af]/20 text-[#f9e2af]">
            <Clock size={12} /> Pending
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e2e] rounded-lg w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col shadow-xl border border-[#313244]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#313244]">
          <h2 className="font-semibold text-[#cdd6f4] flex items-center gap-2">
            <Volume2 size={18} className="text-[#89b4fa]" />
            Review Audio
            {generator.results.length > 0 && (
              <span className="text-sm font-normal text-[#a6adc8]">
                ({generator.currentIndex + 1} of {generator.results.length})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {generator.isStreaming && (
              <button
                onClick={() => generator.stopStream()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f38ba8]/20 text-[#f38ba8] rounded-lg text-sm font-medium hover:bg-[#f38ba8]/30 transition-colors"
              >
                <Square size={14} />
                Stop
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-[#313244] rounded-full transition-colors"
            >
              <X size={18} className="text-[#a6adc8]" />
            </button>
          </div>
        </div>

        {/* Voice selector - show before/during generation */}
        <div className="px-4 py-3 bg-[#181825] border-b border-[#313244]">
          <VoiceSelectorInline />
        </div>

        {/* Progress bar during streaming */}
        {generator.isStreaming && (
          <div className="px-4 py-2 bg-[#181825] border-b border-[#313244]">
            <div className="flex justify-between text-xs text-[#a6adc8] mb-1">
              <span className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" />
                Generating... {generator.progress.word && `(${generator.progress.word})`}
              </span>
              <span>{generator.progress.current}/{generator.progress.total}</span>
            </div>
            <div className="w-full bg-[#313244] rounded-full h-1.5">
              <div
                className="bg-[#89b4fa] h-1.5 rounded-full transition-all"
                style={{ width: `${generator.progress.total ? (generator.progress.current / generator.progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats bar */}
        {generator.results.length > 0 && (
          <div className="px-4 py-2 bg-[#181825] border-b border-[#313244] flex gap-4 text-xs">
            <span className="text-[#f9e2af]">{pendingCount} pending</span>
            <span className="text-[#a6e3a1]">{approvedCount} applied</span>
            <span className="text-[#6c7086]">{skippedCount} skipped</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Initial state - confirm voice before starting */}
          {isInitialState ? (
            <div className="flex flex-col items-center justify-center py-8 text-[#a6adc8]">
              <Volume2 size={40} className="text-[#89b4fa] mb-4" />
              <p className="text-lg text-[#cdd6f4] mb-2">
                {mode === 'fill_missing' ? 'Fill Missing Audio' : 'Regenerate All Audio'}
              </p>
              <p className="text-sm text-[#6c7086] mb-6 text-center max-w-sm">
                {mode === 'fill_missing'
                  ? 'Generate audio for cards that are missing audio. Confirm voice settings above before starting.'
                  : 'Regenerate audio for ALL cards in this deck. Confirm voice settings above before starting.'}
              </p>
              <button
                onClick={onStartGenerate}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-[#89b4fa]/20 text-[#89b4fa] rounded-lg font-medium hover:bg-[#89b4fa]/30 transition-colors"
              >
                <Play size={20} />
                Start Generation
              </button>
            </div>
          ) : generator.results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#a6adc8]">
              {generator.isStreaming ? (
                <>
                  <Loader2 className="animate-spin mb-3" size={32} />
                  <p>Generating audio...</p>
                  <p className="text-sm text-[#6c7086] mt-1">Results will appear here</p>
                </>
              ) : generator.error ? (
                <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg p-4 text-[#f38ba8] text-center">
                  <p className="font-medium">Error</p>
                  <p className="text-sm mt-1 opacity-80">{generator.error}</p>
                </div>
              ) : (
                <>
                  <Volume2 size={32} className="text-[#6c7086] mb-3" />
                  <p>No audio to review</p>
                  <p className="text-sm text-[#6c7086] mt-1">All cards may already have audio</p>
                </>
              )}
            </div>
          ) : currentResult ? (
            <div className="space-y-4">
              {/* Current audio card */}
              <div className="text-center pb-4 border-b border-[#313244]">
                <p className="text-3xl text-[#cdd6f4] mb-2">{currentResult.word}</p>
                <div className="mb-3">
                  {getStatusBadge(currentResult.status)}
                </div>

                {/* Large play button */}
                <button
                  onClick={() => playAudio(currentResult.filename, generator.currentIndex)}
                  className="mx-auto flex items-center justify-center gap-2 px-6 py-3 bg-[#89b4fa]/20 text-[#89b4fa] rounded-lg hover:bg-[#89b4fa]/30 transition-colors"
                >
                  {playingIndex === generator.currentIndex ? (
                    <>
                      <Pause size={20} />
                      <span>Stop Preview</span>
                    </>
                  ) : (
                    <>
                      <Play size={20} />
                      <span>Play Preview</span>
                    </>
                  )}
                </button>

                <p className="text-xs text-[#6c7086] mt-2">
                  File: {currentResult.filename}
                </p>
              </div>

              {/* Audio list with mini play buttons */}
              <div className="space-y-1">
                <p className="text-xs text-[#6c7086] uppercase tracking-wide mb-2">All Generated Audio</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {generator.results.map((result, idx) => (
                    <div
                      key={result.note_id}
                      onClick={() => generator.setCurrentIndex(idx)}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                        idx === generator.currentIndex
                          ? 'bg-[#89b4fa]/20 border border-[#89b4fa]/30'
                          : 'bg-[#313244]/30 hover:bg-[#313244]/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playAudio(result.filename, idx);
                          }}
                          className="p-1 rounded hover:bg-[#313244]"
                        >
                          {playingIndex === idx ? (
                            <Pause size={14} className="text-[#89b4fa]" />
                          ) : (
                            <Play size={14} className="text-[#a6adc8]" />
                          )}
                        </button>
                        <span className="text-sm text-[#cdd6f4]">{result.word}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {result.status === 'approved' && (
                          <CheckCircle size={14} className="text-[#a6e3a1]" />
                        )}
                        {result.status === 'skipped' && (
                          <XCircle size={14} className="text-[#6c7086]" />
                        )}
                        {result.status === 'pending' && (
                          <Clock size={14} className="text-[#f9e2af]" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Actions */}
        {generator.results.length > 0 && (
          <div className="p-4 border-t border-[#313244] space-y-3">
            {/* Bulk actions */}
            <div className="flex gap-4 justify-center text-sm">
              <button
                onClick={generator.skipAll}
                disabled={pendingCount === 0 || isApprovingAll}
                className="text-[#6c7086] hover:text-[#a6adc8] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Skip All ({pendingCount})
              </button>
              <button
                onClick={handleApproveAll}
                disabled={pendingCount === 0 || isApprovingAll}
                className="text-[#a6e3a1] hover:text-[#a6e3a1]/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {isApprovingAll && <Loader2 size={12} className="animate-spin" />}
                Apply All ({pendingCount})
              </button>
            </div>

            {/* Navigation + current item actions */}
            <div className="flex gap-3">
              <button
                onClick={generator.goToPrev}
                disabled={generator.currentIndex === 0}
                className="px-3 py-2.5 bg-[#313244] text-[#cdd6f4] rounded-lg hover:bg-[#45475a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={20} />
              </button>

              <button
                onClick={handleSkip}
                disabled={currentResult?.status !== 'pending'}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#313244] text-[#cdd6f4] rounded-lg text-sm font-medium hover:bg-[#45475a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SkipForward size={16} />
                Skip
              </button>

              <button
                onClick={handleApprove}
                disabled={currentResult?.status !== 'pending' || isApproving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#a6e3a1]/20 text-[#a6e3a1] rounded-lg text-sm font-medium hover:bg-[#a6e3a1]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApproving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                Apply
              </button>

              <button
                onClick={generator.goToNext}
                disabled={generator.currentIndex >= generator.results.length - 1}
                className="px-3 py-2.5 bg-[#313244] text-[#cdd6f4] rounded-lg hover:bg-[#45475a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
