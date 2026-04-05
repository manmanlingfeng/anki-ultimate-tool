import { useState } from 'react';
import { X, Loader2, Check, SkipForward, Edit2, ArrowRight, DollarSign } from 'lucide-react';
import { SourceBadge } from './SourceBadge';
import type { FieldType } from '../../api/fields';

interface FieldPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fieldType: FieldType;
  word: string;
  pinyin?: string;
  currentValue?: string;
  suggestion: string | null;
  source: 'dictionary' | 'ai' | 'local' | null;
  confidence: number;
  alternatives: string[];
  estimatedCost: number | null;
  isLoading: boolean;
  error: string | null;
  onGenerate: () => void;
  onApply: () => Promise<void>;
  onEdit?: (value: string) => void;
}

const FIELD_LABELS: Record<FieldType, string> = {
  pinyin: 'Pinyin',
  sino: 'Sino-Vietnamese',
  definition: 'Definition',
  examples: 'Examples',
  simplified: 'Simplified',
};

export function FieldPreviewModal({
  isOpen,
  onClose,
  fieldType,
  word,
  pinyin,
  currentValue,
  suggestion,
  source,
  confidence,
  alternatives,
  estimatedCost,
  isLoading,
  error,
  onGenerate,
  onApply,
  onEdit,
}: FieldPreviewModalProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [selectedAlt, setSelectedAlt] = useState<string | null>(null);

  if (!isOpen) return null;

  const isInitialState = !isLoading && !suggestion && !error;
  const displayValue = selectedAlt || suggestion;

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await onApply();
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e2e] rounded-lg w-full max-w-md mx-4 shadow-xl border border-[#313244]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#313244]">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-[#cdd6f4]">
              Suggest {FIELD_LABELS[fieldType]}
            </h2>
            {source && <SourceBadge source={source} />}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#313244] rounded-full">
            <X size={18} className="text-[#a6adc8]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Card info */}
          <div className="text-center pb-4 mb-4 border-b border-[#313244]">
            <p className="text-2xl text-[#cdd6f4]">{word}</p>
            {pinyin && <p className="text-[#94e2d5] mt-1">{pinyin}</p>}
          </div>

          {isInitialState ? (
            <div className="text-center py-6">
              {estimatedCost && (
                <div className="flex items-center justify-center gap-2 text-sm text-[#f9e2af] mb-4">
                  <DollarSign size={14} />
                  <span>Est. cost: ${estimatedCost.toFixed(4)}</span>
                </div>
              )}
              <button
                onClick={onGenerate}
                className="px-6 py-2.5 bg-[#cba6f7]/20 text-[#cba6f7] rounded-lg font-medium hover:bg-[#cba6f7]/30"
              >
                Generate Suggestion
              </button>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center py-8 text-[#a6adc8]">
              <Loader2 className="animate-spin mb-3" size={32} />
              <p>Generating suggestion...</p>
            </div>
          ) : error ? (
            <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg p-4 text-[#f38ba8]">
              <p className="font-medium">Generation Failed</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          ) : suggestion ? (
            <div className="space-y-4">
              {/* Current → Suggested */}
              <div className="flex items-center gap-3">
                {currentValue && (
                  <>
                    <div className="flex-1 p-3 bg-[#f38ba8]/10 rounded-lg">
                      <p className="text-xs text-[#6c7086] mb-1">Current</p>
                      <p className="text-[#f38ba8]">{currentValue}</p>
                    </div>
                    <ArrowRight size={20} className="text-[#6c7086] shrink-0" />
                  </>
                )}
                <div className="flex-1 p-3 bg-[#a6e3a1]/10 rounded-lg">
                  <p className="text-xs text-[#6c7086] mb-1">Suggested</p>
                  <p className="text-[#a6e3a1]">{displayValue}</p>
                </div>
              </div>

              {/* Confidence */}
              <div className="relative group flex items-center gap-2 text-sm text-[#a6adc8] cursor-help">
                <span>Confidence:</span>
                <div className="flex-1 h-2 bg-[#313244] rounded-full">
                  <div
                    className="h-2 bg-[#a6e3a1] rounded-full"
                    style={{ width: `${confidence * 100}%` }}
                  />
                </div>
                <span>{Math.round(confidence * 100)}%</span>
                <span className="absolute top-full left-0 mt-1 px-2 py-1 text-xs text-white bg-[#45475a] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  AI confidence level for this suggestion
                </span>
              </div>

              {/* Alternatives for polyphonic */}
              {alternatives.length > 1 && (
                <div>
                  <p className="text-xs text-[#6c7086] mb-2">Alternatives (polyphonic):</p>
                  <div className="flex flex-wrap gap-2">
                    {alternatives.map((alt) => (
                      <button
                        key={alt}
                        onClick={() => setSelectedAlt(alt === selectedAlt ? null : alt)}
                        className={`px-2 py-1 text-sm rounded ${
                          alt === (selectedAlt || suggestion)
                            ? 'bg-[#a6e3a1]/20 text-[#a6e3a1]'
                            : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
                        }`}
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Actions */}
        {!isLoading && suggestion && (
          <div className="p-4 border-t border-[#313244] flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#313244] text-[#cdd6f4] rounded-lg text-sm font-medium hover:bg-[#45475a]"
            >
              <SkipForward size={16} />
              Skip
            </button>
            {onEdit && (
              <button
                onClick={() => onEdit(displayValue || '')}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#89b4fa]/20 text-[#89b4fa] rounded-lg text-sm font-medium hover:bg-[#89b4fa]/30"
              >
                <Edit2 size={16} />
              </button>
            )}
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#a6e3a1]/20 text-[#a6e3a1] rounded-lg text-sm font-medium hover:bg-[#a6e3a1]/30 disabled:opacity-50"
            >
              {isApplying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
