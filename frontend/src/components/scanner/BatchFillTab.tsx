import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Play, Square, CheckCircle, AlertCircle, BarChart3 } from 'lucide-react';
import { useFieldBatchOperation } from '../../hooks/useFieldBatchOperation';
import { BatchFillReviewModal } from '../BatchFillReviewModal';
import { BatchVerifyReviewModal } from '../BatchVerifyReviewModal';
import { AIUsageBanner } from './AIUsageBanner';
import { SourceBadge } from '../field-suggestion/SourceBadge';
import { useToast } from '../Toast';
import type { FieldType } from '../../api/fields';
import type { ScanMode, OperationMode } from '../../api/ai';

interface Props {
  fieldType: FieldType;
  scanMode: ScanMode;
  selectedDeckId: number | null;
  operationMode?: OperationMode;
}

const FIELD_LABELS: Record<FieldType, string> = {
  pinyin: 'Pinyin',
  sino: 'Sino-Vietnamese',
  definition: 'Definition',
  examples: 'Examples',
  simplified: 'Simplified',
};

export function BatchFillTab({ fieldType, scanMode, selectedDeckId, operationMode = 'fill_missing' }: Props) {
  const { showError } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [verifyCurrentIndex, setVerifyCurrentIndex] = useState(0);

  const batch = useFieldBatchOperation(fieldType);

  const handleStart = useCallback(() => {
    if (scanMode !== 'all' && !selectedDeckId) {
      showError('Please select a deck first');
      return;
    }
    if (operationMode === 'verify') {
      batch.startVerifyStream(selectedDeckId || 0, scanMode);
    } else {
      batch.startStream(selectedDeckId || 0, scanMode, operationMode === 'regenerate_all' ? 'all' : 'missing');
    }
  }, [batch, selectedDeckId, scanMode, operationMode, showError]);

  const handleStop = useCallback(() => {
    batch.stopStream();
  }, [batch]);

  const handleApproveComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['cards'] });
    queryClient.invalidateQueries({ queryKey: ['fieldStats'] });
  }, [queryClient]);

  // Get dynamic title based on operation mode
  const getTitle = () => {
    switch (operationMode) {
      case 'fill_missing': return `Fill Missing ${FIELD_LABELS[fieldType]}`;
      case 'regenerate_all': return `Regenerate All ${FIELD_LABELS[fieldType]}`;
      case 'verify': return `Verify ${FIELD_LABELS[fieldType]}`;
    }
  };

  // Use appropriate results based on mode
  const currentResults = operationMode === 'verify' ? batch.verifyResults : batch.results;

  // Stats
  const pendingCount = currentResults.filter(r => r.status === 'pending').length;
  const approvedCount = currentResults.filter(r => r.status === 'approved').length;
  const skippedCount = currentResults.filter(r => r.status === 'skipped').length;
  const issueCount = operationMode === 'verify'
    ? batch.verifyResults.filter(r => !r.is_correct).length
    : 0;

  return (
    <div className="space-y-6">
      {/* Usage Banner */}
      <AIUsageBanner />

      {/* Warning for regenerate mode */}
      {operationMode === 'regenerate_all' && (
        <div className="p-3 bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg text-sm text-[#f38ba8]">
          <strong>Warning:</strong> This will regenerate ALL existing {FIELD_LABELS[fieldType]} values, not just missing ones.
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-[#cdd6f4] flex items-center gap-2">
            <BarChart3 size={18} className={
              operationMode === 'regenerate_all' ? 'text-[#f38ba8]' :
              operationMode === 'verify' ? 'text-[#89b4fa]' :
              'text-[#cba6f7]'
            } />
            {getTitle()}
          </h3>
          <p className="text-sm text-[#a6adc8] mt-1">
            {operationMode === 'regenerate_all'
              ? `Regenerate ${fieldType} for ALL cards (overwrites existing)`
              : operationMode === 'verify'
                ? `Verify existing ${fieldType} values for correctness`
                : `Generate ${fieldType} for cards missing this field`}
          </p>
        </div>
        <div className="flex gap-2">
          {batch.isStreaming ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 bg-[#f38ba8]/20 text-[#f38ba8] rounded-lg text-sm font-medium hover:bg-[#f38ba8]/30"
            >
              <Square size={14} />
              Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={scanMode !== 'all' && !selectedDeckId}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                operationMode === 'verify'
                  ? 'bg-[#89b4fa]/20 text-[#89b4fa] hover:bg-[#89b4fa]/30'
                  : 'bg-[#cba6f7]/20 text-[#cba6f7] hover:bg-[#cba6f7]/30'
              }`}
            >
              <Play size={14} />
              {operationMode === 'regenerate_all'
                ? 'Start Regenerate'
                : operationMode === 'verify'
                  ? 'Start Verify'
                  : 'Start Fill'}
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {batch.isStreaming && (
        <div className="bg-[#cba6f7]/10 border border-[#cba6f7]/30 rounded-lg p-4">
          <div className="flex justify-between text-sm text-[#cdd6f4] mb-2">
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Processing: {batch.progress.word}
            </span>
            <span>{batch.progress.current}/{batch.progress.total}</span>
          </div>
          <div className="w-full bg-[#313244] rounded-full h-2">
            <div
              className="bg-[#cba6f7] h-2 rounded-full transition-all"
              style={{ width: `${batch.progress.total ? (batch.progress.current / batch.progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {batch.error && (
        <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#f38ba8] font-medium">
            <AlertCircle size={18} />
            Error
          </div>
          <p className="text-sm text-[#a6adc8] mt-1">{batch.error}</p>
        </div>
      )}

      {/* Results */}
      {currentResults.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-[#cdd6f4]">Results</h4>
            {pendingCount > 0 && (
              <button
                onClick={() => {
                  if (operationMode === 'verify') {
                    const issueResults = batch.verifyResults.filter(r => !r.is_correct);
                    setVerifyCurrentIndex(issueResults.findIndex(r => r.status === 'pending'));
                    setShowVerifyModal(true);
                  } else {
                    setCurrentIndex(currentResults.findIndex(r => r.status === 'pending'));
                    setShowModal(true);
                  }
                }}
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
            {operationMode === 'verify' && issueCount > 0 && (
              <span className="flex items-center gap-1.5 text-[#f38ba8]">
                <span className="w-2 h-2 rounded-full bg-[#f38ba8]" />
                {issueCount} issues
              </span>
            )}
          </div>

          {/* Result cards list - only show pending items */}
          <div className="space-y-2 max-h-[300px] overflow-auto">
            {operationMode === 'verify' ? (
              batch.verifyResults
                .filter(r => !r.is_correct && r.status === 'pending')
                .map((result) => (
                  <button
                    key={result.note_id}
                    onClick={() => {
                      // Find index in issueResults array for the modal
                      const issueResults = batch.verifyResults.filter(r => !r.is_correct);
                      const issueIdx = issueResults.findIndex(r => r.note_id === result.note_id);
                      setVerifyCurrentIndex(issueIdx);
                      setShowVerifyModal(true);
                    }}
                    className="w-full text-left p-3 bg-[#313244]/50 hover:bg-[#313244] rounded-lg border border-[#45475a] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[#cdd6f4] font-medium">{result.word}</span>
                        <AlertCircle size={16} className="text-[#f9e2af]" />
                      </div>
                      <span className="text-xs text-[#f9e2af]">Pending</span>
                    </div>
                    <p className="text-xs text-[#6c7086] mt-1 truncate">
                      {result.issues?.[0] || result.reason || 'Issues found'}
                    </p>
                  </button>
                ))
            ) : (
              batch.results
                .map((r, originalIdx) => ({ result: r, originalIdx }))
                .filter(({ result }) => result.status === 'pending')
                .map(({ result, originalIdx }) => (
                  <button
                    key={result.note_id}
                    onClick={() => {
                      setCurrentIndex(originalIdx);
                      setShowModal(true);
                    }}
                    className="w-full text-left p-3 bg-[#313244]/50 hover:bg-[#313244] rounded-lg border border-[#45475a] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[#cdd6f4] font-medium">{result.word}</span>
                        <SourceBadge source={result.source} />
                      </div>
                      <span className="text-xs text-[#f9e2af]">Pending</span>
                    </div>
                    <p className="text-xs text-[#a6adc8] mt-1 truncate">
                      {result.suggestion}
                    </p>
                  </button>
                ))
            )}
          </div>

          {/* All done message */}
          {pendingCount === 0 && (
            <div className="text-center py-4 text-[#a6e3a1] bg-[#a6e3a1]/10 rounded-lg">
              <CheckCircle size={24} className="mx-auto mb-2" />
              <p className="font-medium">All done!</p>
              <p className="text-sm text-[#a6adc8]">
                {approvedCount} {operationMode === 'verify' ? 'fixes' : FIELD_LABELS[fieldType].toLowerCase()} applied
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!batch.isStreaming && currentResults.length === 0 && !batch.error && (
        <div className="text-center py-8 text-[#6c7086]">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-50" />
          <p>
            Click "{operationMode === 'verify' ? 'Start Verify' : operationMode === 'regenerate_all' ? 'Start Regenerate' : 'Start Fill'}"
            to {operationMode === 'verify' ? 'verify' : 'generate'} {fieldType}
          </p>
          <p className="text-sm mt-1">
            {scanMode === 'all'
              ? `Will scan all decks for cards ${operationMode === 'verify' ? 'with' : 'without'} ${fieldType}`
              : selectedDeckId
                ? 'Will scan the selected deck and its children'
                : <span className="text-[#f9e2af]">Please select a deck first</span>}
          </p>
        </div>
      )}

      {/* Review Modal for Fill/Regenerate */}
      <BatchFillReviewModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        results={batch.results}
        currentIndex={currentIndex}
        onIndexChange={setCurrentIndex}
        onApprove={batch.approveResult}
        onSkip={batch.skipResult}
        onApproveAll={async () => {
          await batch.approveAll();
          handleApproveComplete();
        }}
        fieldType={fieldType}
      />

      {/* Review Modal for Verify */}
      <BatchVerifyReviewModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        results={batch.verifyResults}
        currentIndex={verifyCurrentIndex}
        onIndexChange={setVerifyCurrentIndex}
        onApprove={async (idx) => {
          await batch.approveVerifyResult(idx);
          handleApproveComplete();
        }}
        onSkip={batch.skipVerifyResult}
        onApproveAll={async () => {
          await batch.approveAllVerify();
          handleApproveComplete();
        }}
        fieldType={fieldType}
      />
    </div>
  );
}
