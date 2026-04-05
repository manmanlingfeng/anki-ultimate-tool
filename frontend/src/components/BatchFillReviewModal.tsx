import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Check, SkipForward, Edit2, Loader2, Eye } from 'lucide-react';
import { SourceBadge } from './field-suggestion/SourceBadge';
import { CardPreviewModal } from './CardPreviewModal';
import type { BatchResult } from '../hooks/useFieldBatchOperation';
import type { FieldType } from '../api/fields';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  results: BatchResult[];
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

// Map field type to Anki field name for preview
const ANKI_FIELD_NAMES: Record<FieldType, string> = {
  pinyin: 'Pinyin',
  sino: 'Sino',
  definition: 'Definition',
  examples: 'Example',
  simplified: 'Simplified',
};

export function BatchFillReviewModal({
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
  const [editValue, setEditValue] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const pendingResults = results.filter(r => r.status === 'pending');
  const current = results[currentIndex];

  // Find next pending when navigating
  const findNextPending = (fromIndex: number, direction: 1 | -1): number => {
    let idx = fromIndex + direction;
    while (idx >= 0 && idx < results.length) {
      if (results[idx].status === 'pending') return idx;
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
    setIsApproving(true);
    try {
      await onApprove(currentIndex);
      // Auto-advance to next pending
      const nextIdx = findNextPending(currentIndex, 1);
      if (nextIdx !== currentIndex) {
        onIndexChange(nextIdx);
      }
    } finally {
      setIsApproving(false);
    }
  };

  const handleSkip = () => {
    onSkip(currentIndex);
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

  // Reset edit mode and preview on navigation
  useEffect(() => {
    setEditValue(null);
    setShowPreview(false);
  }, [currentIndex]);

  if (!isOpen || !current) return null;

  const pendingIndex = pendingResults.findIndex(r => r.note_id === current.note_id);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e2e] rounded-lg w-full max-w-lg mx-4 shadow-xl border border-[#313244]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#313244]">
          <h2 className="font-semibold text-[#cdd6f4]">
            Review {FIELD_LABELS[fieldType]} Suggestions
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[#313244] rounded-full">
            <X size={18} className="text-[#a6adc8]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Card info */}
          <div className="text-center pb-4 mb-4 border-b border-[#313244]">
            <p className="text-2xl text-[#cdd6f4]">{current.word}</p>
            {current.pinyin && (
              <p className="text-[#94e2d5] mt-1">{current.pinyin}</p>
            )}
          </div>

          {/* Status indicator */}
          {current.status !== 'pending' && (
            <div className={`mb-4 p-2 rounded-lg text-sm text-center ${
              current.status === 'approved'
                ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]'
                : 'bg-[#6c7086]/10 text-[#6c7086]'
            }`}>
              {current.status === 'approved' ? 'Already approved' : 'Skipped'}
            </div>
          )}

          {/* Suggestion */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#a6adc8]">Suggested:</span>
              <SourceBadge source={current.source} />
            </div>

            {editValue !== null ? (
              <div>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full px-3 py-2 bg-[#313244] border border-[#45475a] rounded-lg text-[#cdd6f4] focus:border-[#89b4fa] outline-none"
                  autoFocus
                />
              </div>
            ) : (
              <div className="p-3 bg-[#a6e3a1]/10 rounded-lg">
                {fieldType === 'examples' && current.html ? (
                  <div
                    className="text-[#a6e3a1] text-sm [&_p]:mb-1"
                    dangerouslySetInnerHTML={{ __html: current.html }}
                  />
                ) : (
                  <p className="text-[#a6e3a1] text-lg">{current.suggestion}</p>
                )}
              </div>
            )}

            {/* Confidence */}
            <div className="relative group flex items-center gap-2 text-sm text-[#a6adc8] cursor-help">
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
              <span className="absolute top-full left-0 mt-1 px-2 py-1 text-xs text-white bg-[#45475a] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                AI confidence: Green (&gt;80%) High, Yellow (60-80%) Medium, Red (&lt;60%) Low
              </span>
            </div>

            {/* Alternatives */}
            {current.alternatives && current.alternatives.length > 1 && (
              <div>
                <p className="text-xs text-[#6c7086] mb-2">Alternatives:</p>
                <div className="flex flex-wrap gap-2">
                  {current.alternatives.map((alt) => (
                    <button
                      key={alt}
                      onClick={() => setEditValue(alt)}
                      className="px-2 py-1 text-sm bg-[#313244] text-[#a6adc8] rounded hover:bg-[#45475a]"
                    >
                      {alt}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
            disabled={current.status !== 'pending'}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#f9e2af]/20 text-[#f9e2af] rounded-lg text-sm font-medium hover:bg-[#f9e2af]/30 disabled:opacity-50"
            title="Preview full card"
          >
            <Eye size={16} />
          </button>

          {editValue === null ? (
            <button
              onClick={() => setEditValue(current.suggestion)}
              disabled={current.status !== 'pending'}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#89b4fa]/20 text-[#89b4fa] rounded-lg text-sm font-medium hover:bg-[#89b4fa]/30 disabled:opacity-50"
            >
              <Edit2 size={16} />
            </button>
          ) : (
            <button
              onClick={() => setEditValue(null)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#f38ba8]/20 text-[#f38ba8] rounded-lg text-sm font-medium hover:bg-[#f38ba8]/30"
            >
              <X size={16} />
            </button>
          )}

          <button
            onClick={handleApprove}
            disabled={isApproving || current.status !== 'pending'}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#a6e3a1]/20 text-[#a6e3a1] rounded-lg text-sm font-medium hover:bg-[#a6e3a1]/30 disabled:opacity-50"
          >
            {isApproving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Approve
          </button>

          <button
            onClick={handleApproveAll}
            disabled={isApprovingAll || pendingResults.length === 0}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#cba6f7]/20 text-[#cba6f7] rounded-lg text-sm font-medium hover:bg-[#cba6f7]/30 disabled:opacity-50"
          >
            {isApprovingAll ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            All ({pendingResults.length})
          </button>
        </div>
      </div>

      {/* Card Preview Modal */}
      <CardPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        noteId={current.note_id}
        word={current.word}
        changes={[{
          fieldName: ANKI_FIELD_NAMES[fieldType],
          beforeValue: current.original_value || '',
          afterValue: editValue ?? (fieldType === 'examples' ? (current.html || current.suggestion) : current.suggestion),
          source: current.source,
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
    </div>
  );
}
