import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Check, SkipForward, Loader2, Eye, AlertCircle } from 'lucide-react';
import { CardPreviewModal } from './CardPreviewModal';
import type { VerifyBatchResult } from '../hooks/useFieldBatchOperation';
import type { FieldType } from '../api/fields';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  results: VerifyBatchResult[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onApprove: (index: number) => Promise<void>;
  onSkip: (index: number) => void;
  onApproveAll: () => Promise<void>;
  fieldType: FieldType;
}

const FIELD_LABELS: Record<FieldType, string> = {
  pinyin: 'Pinyin',
  sino: 'Sino-Vietnamese',
  definition: 'Definition',
  examples: 'Examples',
  simplified: 'Simplified',
};

const ANKI_FIELD_NAMES: Record<FieldType, string> = {
  pinyin: 'Pinyin',
  sino: 'Sino',
  definition: 'Definition',
  examples: 'Example',
  simplified: 'Simplified',
};

export function BatchVerifyReviewModal({
  isOpen,
  onClose,
  results,
  currentIndex,
  onIndexChange,
  onApprove,
  onSkip,
  onApproveAll,
  fieldType,
}: Props) {
  const [isApproving, setIsApproving] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Only show results with issues (not is_correct)
  const issueResults = results.filter(r => !r.is_correct);
  const pendingResults = issueResults.filter(r => r.status === 'pending');
  const current = issueResults[currentIndex];

  const findNextPending = (fromIndex: number, direction: 1 | -1): number => {
    let idx = fromIndex + direction;
    while (idx >= 0 && idx < issueResults.length) {
      if (issueResults[idx].status === 'pending') return idx;
      idx += direction;
    }
    return fromIndex;
  };

  const handlePrev = () => {
    onIndexChange(findNextPending(currentIndex, -1));
  };

  const handleNext = () => {
    onIndexChange(findNextPending(currentIndex, 1));
  };

  const handleApprove = async () => {
    if (!current) return;
    setIsApproving(true);
    try {
      // Find original index in full results array
      const originalIndex = results.findIndex(r => r.note_id === current.note_id);
      if (originalIndex !== -1) {
        await onApprove(originalIndex);
      }
      const nextIdx = findNextPending(currentIndex, 1);
      if (nextIdx !== currentIndex) {
        onIndexChange(nextIdx);
      }
    } finally {
      setIsApproving(false);
    }
  };

  const handleSkip = () => {
    if (!current) return;
    const originalIndex = results.findIndex(r => r.note_id === current.note_id);
    if (originalIndex !== -1) {
      onSkip(originalIndex);
    }
    const nextIdx = findNextPending(currentIndex, 1);
    if (nextIdx !== currentIndex) {
      onIndexChange(nextIdx);
    }
  };

  const handleApproveAll = async () => {
    setIsApprovingAll(true);
    try {
      await onApproveAll();
      onClose();
    } finally {
      setIsApprovingAll(false);
    }
  };

  useEffect(() => {
    setShowPreview(false);
  }, [currentIndex]);

  if (!isOpen || !current) return null;

  const pendingIndex = pendingResults.findIndex(r => r.note_id === current.note_id);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e2e] rounded-lg w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col shadow-xl border border-[#313244]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#313244]">
          <h2 className="font-semibold text-[#cdd6f4] flex items-center gap-2">
            <AlertCircle size={18} className="text-[#f9e2af]" />
            Verify {FIELD_LABELS[fieldType]} Issues
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[#313244] rounded-full">
            <X size={18} className="text-[#a6adc8]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Card info */}
          <div className="text-center pb-4 mb-4 border-b border-[#313244]">
            <p className="text-2xl text-[#cdd6f4]">{current.word}</p>
          </div>

          {/* Status indicator */}
          {current.status !== 'pending' && (
            <div className={`mb-4 p-2 rounded-lg text-sm text-center ${
              current.status === 'approved'
                ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]'
                : 'bg-[#6c7086]/10 text-[#6c7086]'
            }`}>
              {current.status === 'approved' ? 'Fixed' : 'Skipped'}
            </div>
          )}

          {/* Issues */}
          {current.issues && current.issues.length > 0 && (
            <div className="mb-4 p-3 bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg">
              <p className="text-sm font-medium text-[#f38ba8] mb-2">Issues Found:</p>
              <ul className="list-disc list-inside text-sm text-[#f38ba8]/80 space-y-1">
                {current.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Current value */}
          <div className="mb-4">
            <p className="text-sm text-[#a6adc8] mb-2">Current:</p>
            <div className="p-3 bg-[#f38ba8]/10 rounded-lg border border-[#f38ba8]/30">
              {fieldType === 'examples' ? (
                <div
                  className="text-sm text-[#f38ba8] [&_p]:mb-1"
                  dangerouslySetInnerHTML={{ __html: current.current_value }}
                />
              ) : (
                <p className="text-[#f38ba8]">{current.current_value}</p>
              )}
            </div>
          </div>

          {/* Suggested fix */}
          {current.suggested_value && (
            <div className="mb-4">
              <p className="text-sm text-[#a6adc8] mb-2">Suggested Fix:</p>
              <div className="p-3 bg-[#a6e3a1]/10 rounded-lg border border-[#a6e3a1]/30">
                {fieldType === 'examples' ? (
                  <div
                    className="text-sm text-[#a6e3a1] [&_p]:mb-1"
                    dangerouslySetInnerHTML={{ __html: current.suggested_value }}
                  />
                ) : (
                  <p className="text-[#a6e3a1]">{current.suggested_value}</p>
                )}
              </div>
            </div>
          )}

          {/* Reason */}
          {current.reason && (
            <div className="text-sm text-[#6c7086]">
              <span className="font-medium">Reason:</span> {current.reason}
            </div>
          )}

          {/* Confidence */}
          <div className="mt-4 flex items-center gap-2 text-sm text-[#a6adc8]">
            <span>Confidence:</span>
            <div className="flex-1 h-2 bg-[#313244] rounded-full max-w-[100px]">
              <div
                className={`h-2 rounded-full ${
                  current.confidence > 0.8 ? 'bg-[#a6e3a1]' : current.confidence > 0.6 ? 'bg-[#f9e2af]' : 'bg-[#f38ba8]'
                }`}
                style={{ width: `${current.confidence * 100}%` }}
              />
            </div>
            <span>{Math.round(current.confidence * 100)}%</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="px-4 py-2 border-t border-[#313244] flex items-center justify-center gap-4 text-sm">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0 || findNextPending(currentIndex, -1) === currentIndex}
            className="p-1.5 hover:bg-[#313244] rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={20} className="text-[#a6adc8]" />
          </button>
          <span className="text-[#a6adc8]">
            {pendingResults.length > 0 ? (
              <>
                {pendingIndex >= 0 ? pendingIndex + 1 : '-'}/{pendingResults.length} pending
              </>
            ) : (
              <span className="text-[#a6e3a1]">All done!</span>
            )}
          </span>
          <button
            onClick={handleNext}
            disabled={findNextPending(currentIndex, 1) === currentIndex}
            className="p-1.5 hover:bg-[#313244] rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight size={20} className="text-[#a6adc8]" />
          </button>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-[#313244] flex gap-3">
          <button
            onClick={handleSkip}
            disabled={current.status !== 'pending'}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#313244] text-[#cdd6f4] rounded-lg text-sm font-medium hover:bg-[#45475a] disabled:opacity-50"
          >
            <SkipForward size={16} />
            Skip
          </button>

          <button
            onClick={() => setShowPreview(true)}
            disabled={current.status !== 'pending' || !current.suggested_value}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#f9e2af]/20 text-[#f9e2af] rounded-lg text-sm font-medium hover:bg-[#f9e2af]/30 disabled:opacity-50"
            title="Preview full card"
          >
            <Eye size={16} />
            Preview
          </button>

          <button
            onClick={handleApprove}
            disabled={isApproving || current.status !== 'pending' || !current.suggested_value}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#a6e3a1]/20 text-[#a6e3a1] rounded-lg text-sm font-medium hover:bg-[#a6e3a1]/30 disabled:opacity-50"
          >
            {isApproving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Apply Fix
          </button>

          <button
            onClick={handleApproveAll}
            disabled={isApprovingAll || pendingResults.filter(r => r.suggested_value).length === 0}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#cba6f7]/20 text-[#cba6f7] rounded-lg text-sm font-medium hover:bg-[#cba6f7]/30 disabled:opacity-50"
          >
            {isApprovingAll ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Fix All ({pendingResults.filter(r => r.suggested_value).length})
          </button>
        </div>
      </div>

      {/* Card Preview Modal */}
      {current.suggested_value && (
        <CardPreviewModal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          noteId={current.note_id}
          word={current.word}
          changes={[{
            fieldName: ANKI_FIELD_NAMES[fieldType],
            beforeValue: current.current_value,
            afterValue: current.suggested_value,
            source: 'ai',
            confidence: current.confidence,
          }]}
          onApply={async () => {
            await handleApprove();
            setShowPreview(false);
          }}
          onSkip={() => {
            handleSkip();
            setShowPreview(false);
          }}
          isApplying={isApproving}
        />
      )}
    </div>
  );
}
