import { useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  SkipForward,
  Loader2,
  Sparkles,
  CheckCircle,
  XCircle,
  Clock,
  Square,
  Play,
  DollarSign,
} from 'lucide-react';
import type { UseExampleGeneratorReturn } from '../hooks/useExampleGenerator';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  generator: UseExampleGeneratorReturn;
  onApproveComplete?: () => void;
  onStartGenerate: () => void;  // Called when user confirms to start
  estimatedCost?: number;       // Estimated cost for the batch
}

export function BatchExampleModal({ isOpen, onClose, generator, onApproveComplete, onStartGenerate, estimatedCost = 0.01 }: Props) {
  const [isApproving, setIsApproving] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);

  if (!isOpen) return null;

  // Check if we're in initial state (not started, no results)
  const isInitialState = !generator.isStreaming && generator.results.length === 0 && !generator.error;

  const currentResult = generator.results[generator.currentIndex];
  const pendingCount = generator.results.filter(r => r.status === 'pending').length;
  const approvedCount = generator.results.filter(r => r.status === 'approved').length;
  const skippedCount = generator.results.filter(r => r.status === 'skipped').length;

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#a6e3a1]/20 text-[#a6e3a1]">
            <CheckCircle size={12} /> Approved
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
            <Sparkles size={18} className="text-[#cba6f7]" />
            Review Examples
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
              onClick={onClose}
              className="p-1.5 hover:bg-[#313244] rounded-full transition-colors"
            >
              <X size={18} className="text-[#a6adc8]" />
            </button>
          </div>
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
                className="bg-[#cba6f7] h-1.5 rounded-full transition-all"
                style={{ width: `${generator.progress.total ? (generator.progress.current / generator.progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats bar */}
        {generator.results.length > 0 && (
          <div className="px-4 py-2 bg-[#181825] border-b border-[#313244] flex gap-4 text-xs">
            <span className="text-[#f9e2af]">{pendingCount} pending</span>
            <span className="text-[#a6e3a1]">{approvedCount} approved</span>
            <span className="text-[#6c7086]">{skippedCount} skipped</span>
          </div>
        )}

        {/* Error banner when there are results */}
        {generator.error && generator.results.length > 0 && (
          <div className="px-4 py-2 bg-[#f38ba8]/10 border-b border-[#f38ba8]/30 text-[#f38ba8] text-sm">
            {generator.error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Initial state - confirm cost before starting */}
          {isInitialState ? (
            <div className="flex flex-col items-center justify-center py-8 text-[#a6adc8]">
              <Sparkles size={40} className="text-[#cba6f7] mb-4" />
              <p className="text-lg text-[#cdd6f4] mb-2">Generate AI Examples</p>
              <p className="text-sm text-[#6c7086] mb-4 text-center max-w-sm">
                Generate example sentences with pinyin, Sino-Vietnamese, and Vietnamese translations for all cards missing examples.
              </p>

              {/* Cost estimate */}
              <div className="flex items-center gap-2 text-sm text-[#f9e2af] bg-[#f9e2af]/10 px-3 py-2 rounded-lg mb-6">
                <DollarSign size={14} />
                <span>Estimated cost: ${estimatedCost.toFixed(4)}</span>
              </div>

              <button
                onClick={onStartGenerate}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-[#cba6f7]/20 text-[#cba6f7] rounded-lg font-medium hover:bg-[#cba6f7]/30 transition-colors"
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
                  <p>Generating examples...</p>
                  <p className="text-sm text-[#6c7086] mt-1">Results will appear here</p>
                </>
              ) : generator.error ? (
                <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg p-4 text-[#f38ba8] text-center">
                  <p className="font-medium">Error</p>
                  <p className="text-sm mt-1 opacity-80">{generator.error}</p>
                </div>
              ) : (
                <>
                  <Sparkles size={32} className="text-[#6c7086] mb-3" />
                  <p>No examples to review</p>
                  <p className="text-sm text-[#6c7086] mt-1">All cards may already have examples</p>
                </>
              )}
            </div>
          ) : currentResult ? (
            <div className="space-y-4">
              {/* Card info */}
              <div className="text-center pb-3 border-b border-[#313244]">
                <p className="text-3xl text-[#cdd6f4]">{currentResult.word}</p>
                <p className="text-[#94e2d5] mt-1">{currentResult.pinyin}</p>
                <div className="mt-2">
                  {getStatusBadge(currentResult.status)}
                </div>
              </div>

              {/* Examples */}
              {currentResult.examples.map((ex, i) => (
                <div
                  key={i}
                  className="bg-[#313244]/50 rounded-lg p-4 border border-[#45475a]"
                >
                  <p className="text-xs text-[#6c7086] uppercase tracking-wide mb-2">
                    Example {i + 1}
                  </p>
                  <p className="text-lg font-medium text-[#cdd6f4] mb-2">{ex.chinese}</p>
                  <p className="text-[#94e2d5] text-sm">{ex.pinyin}</p>
                  <p className="text-[#a6adc8] text-sm mt-1">{ex.sino}</p>
                  <p className="text-[#a6e3a1] text-sm mt-2">{ex.vietnamese}</p>
                </div>
              ))}
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
                Approve All ({pendingCount})
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
