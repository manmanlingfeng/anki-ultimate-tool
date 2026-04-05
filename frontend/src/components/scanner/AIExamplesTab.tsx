import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, Loader2, Play, Square, CheckCircle, AlertCircle, DollarSign } from 'lucide-react';
import { checkAIHealth, estimateCostAll, estimateCost } from '../../api/ai';
import type { ScanMode } from '../../api/ai';
import { useExampleGenerator } from '../../hooks/useExampleGenerator';
import { BatchExampleModal } from '../BatchExampleModal';
import { AIUsageBanner } from './AIUsageBanner';
import { useToast } from '../Toast';

interface Props {
  scanMode: ScanMode;
  selectedDeckId: number | null;
}

export function AIExamplesTab({ scanMode, selectedDeckId }: Props) {
  const { showError } = useToast();
  const queryClient = useQueryClient();
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [isLoadingCost, setIsLoadingCost] = useState(false);
  const generator = useExampleGenerator();

  // Check AI availability
  useEffect(() => {
    checkAIHealth()
      .then((health) => setAiAvailable(health.available))
      .catch(() => setAiAvailable(false));
  }, []);

  // Get cost estimate based on scan mode
  useEffect(() => {
    if (!aiAvailable) return;

    setIsLoadingCost(true);
    setEstimatedCost(null);

    if (scanMode === 'all') {
      estimateCostAll()
        .then((est) => setEstimatedCost(est.estimated_cost))
        .catch(() => setEstimatedCost(null))
        .finally(() => setIsLoadingCost(false));
    } else if (selectedDeckId) {
      estimateCost(selectedDeckId)
        .then((est) => setEstimatedCost(est.estimated_cost))
        .catch(() => setEstimatedCost(null))
        .finally(() => setIsLoadingCost(false));
    } else {
      setEstimatedCost(null);
      setIsLoadingCost(false);
    }
  }, [aiAvailable, scanMode, selectedDeckId]);

  // Start generation directly (validates deck first)
  const handleStart = useCallback(() => {
    // Validate deck selection for non-all modes
    if (scanMode !== 'all' && !selectedDeckId) {
      showError('Please select a deck first');
      return;
    }
    generator.startStream(selectedDeckId || undefined, scanMode);
  }, [generator, selectedDeckId, scanMode, showError]);

  const handleStop = useCallback(() => {
    generator.stopStream();
  }, [generator]);

  // Calculate stats
  const pendingCount = generator.results.filter(r => r.status === 'pending').length;
  const approvedCount = generator.results.filter(r => r.status === 'approved').length;
  const skippedCount = generator.results.filter(r => r.status === 'skipped').length;

  // Loading state
  if (aiAvailable === null) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="animate-spin text-[#cba6f7]" size={24} />
      </div>
    );
  }

  // AI not available
  if (!aiAvailable) {
    return (
      <div className="p-6">
        <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#f38ba8] font-medium">
            <AlertCircle size={18} />
            AI Not Available
          </div>
          <p className="text-sm text-[#a6adc8] mt-2">
            Please configure your AI API key in the backend settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Usage Banner */}
      <AIUsageBanner />

      {/* Cost estimate banner */}
      {generator.results.length === 0 && !generator.isStreaming && (isLoadingCost || estimatedCost !== null) && (
        <div className="p-3 bg-[#cba6f7]/10 border border-[#cba6f7]/30 rounded-lg text-sm text-[#cba6f7]">
          <div className="flex items-center gap-2">
            {isLoadingCost ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Calculating cost estimate...</span>
              </>
            ) : (
              <>
                <DollarSign size={16} />
                <span>Estimated cost{scanMode === 'all' ? ' (all decks)' : ''}: ~${estimatedCost?.toFixed(3)}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-[#cdd6f4] flex items-center gap-2">
            <Sparkles size={18} className="text-[#cba6f7]" />
            AI Example Generator
          </h3>
          <p className="text-sm text-[#a6adc8] mt-1">
            Generate example sentences for cards missing examples
          </p>
        </div>
        <div className="flex gap-2">
          {generator.isStreaming ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 bg-[#f38ba8]/20 text-[#f38ba8] rounded-lg text-sm font-medium hover:bg-[#f38ba8]/30 transition-colors"
            >
              <Square size={14} />
              Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={scanMode !== 'all' && !selectedDeckId}
              className="flex items-center gap-2 px-4 py-2 bg-[#cba6f7]/20 text-[#cba6f7] rounded-lg text-sm font-medium hover:bg-[#cba6f7]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play size={14} />
              Start Scan
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {generator.isStreaming && (
        <div className="bg-[#cba6f7]/10 border border-[#cba6f7]/30 rounded-lg p-4">
          <div className="flex justify-between text-sm text-[#cdd6f4] mb-2">
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Processing cards...
              {generator.progress.word && (
                <span className="text-[#a6adc8]">({generator.progress.word})</span>
              )}
            </span>
            <span>{generator.progress.current}/{generator.progress.total}</span>
          </div>
          <div className="w-full bg-[#313244] rounded-full h-2">
            <div
              className="bg-[#cba6f7] h-2 rounded-full transition-all"
              style={{ width: `${generator.progress.total ? (generator.progress.current / generator.progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {generator.error && (
        <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#f38ba8] font-medium">
            <AlertCircle size={18} />
            Error
          </div>
          <p className="text-sm text-[#a6adc8] mt-1">{generator.error}</p>
        </div>
      )}

      {/* Results summary */}
      {generator.results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-[#cdd6f4]">Results</h4>
            {pendingCount > 0 && (
              <button
                onClick={() => setShowModal(true)}
                className="text-sm text-[#89b4fa] hover:text-[#89b4fa]/80"
              >
                Open Review Modal
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex gap-4 text-sm">
            {pendingCount > 0 && (
              <span className="flex items-center gap-1.5 text-[#f9e2af]">
                <span className="w-2 h-2 rounded-full bg-[#f9e2af]" />
                {pendingCount} pending
              </span>
            )}
            <span className="flex items-center gap-1.5 text-[#a6e3a1]">
              <span className="w-2 h-2 rounded-full bg-[#a6e3a1]" />
              {approvedCount} approved
            </span>
            {skippedCount > 0 && (
              <span className="flex items-center gap-1.5 text-[#6c7086]">
                <span className="w-2 h-2 rounded-full bg-[#6c7086]" />
                {skippedCount} skipped
              </span>
            )}
          </div>

          {/* Result cards list - only show pending items */}
          <div className="space-y-2 max-h-[300px] overflow-auto">
            {generator.results
              .map((result, idx) => ({ result, idx }))
              .filter(({ result }) => result.status === 'pending')
              .map(({ result, idx }) => (
                <button
                  key={result.note_id}
                  onClick={() => {
                    generator.setCurrentIndex(idx);
                    setShowModal(true);
                  }}
                  className="w-full text-left p-3 bg-[#313244]/50 hover:bg-[#313244] rounded-lg border border-[#45475a] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[#cdd6f4] font-medium">{result.word}</span>
                      <span className="text-[#94e2d5] text-sm ml-2">{result.pinyin}</span>
                    </div>
                    <span className="text-xs text-[#f9e2af]">Pending</span>
                  </div>
                  <p className="text-xs text-[#a6adc8] mt-1 truncate">
                    {result.examples[0]?.chinese}
                  </p>
                </button>
              ))}
          </div>

          {/* All done message */}
          {pendingCount === 0 && (
            <div className="text-center py-4 text-[#a6e3a1] bg-[#a6e3a1]/10 rounded-lg">
              <CheckCircle size={24} className="mx-auto mb-2" />
              <p className="font-medium">All done!</p>
              <p className="text-sm text-[#a6adc8]">{approvedCount} examples applied</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state when not streaming and no results */}
      {!generator.isStreaming && generator.results.length === 0 && !generator.error && (
        <div className="text-center py-8 text-[#6c7086]">
          <Sparkles size={40} className="mx-auto mb-3 opacity-50" />
          <p>Click "Start Scan" to generate examples</p>
          <p className="text-sm mt-1">
            {scanMode === 'all'
              ? 'Will scan all decks for cards without examples'
              : selectedDeckId
                ? 'Will scan the selected deck and its children'
                : <span className="text-[#f9e2af]">Please select a deck first</span>}
          </p>
        </div>
      )}

      {/* Review Modal - for reviewing results only */}
      <BatchExampleModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        generator={generator}
        onApproveComplete={() => queryClient.invalidateQueries({ queryKey: ['cards'] })}
        onStartGenerate={handleStart}
      />
    </div>
  );
}
