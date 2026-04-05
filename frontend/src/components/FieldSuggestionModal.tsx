import { useState } from 'react';
import { X, Loader2, Sparkles, Check, SkipForward, RefreshCw } from 'lucide-react';
import type { Card } from '../types';
import type { FieldType } from '../api/fields';
import { SourceBadge } from './field-suggestion/SourceBadge';
import { HtmlContent } from './HtmlContent';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  card: Card;
  fieldType: FieldType;
  mode: 'fill_missing' | 'regenerate';
  suggestion: string | null;
  suggestionHtml: string | null;
  source: 'dictionary' | 'ai' | 'local' | null;
  isLoading: boolean;
  error: string | null;
  onGenerate: () => void;
  onApply: () => Promise<void>;
}

const FIELD_LABELS: Record<FieldType, string> = {
  pinyin: 'Pinyin',
  sino: 'Sino-Vietnamese',
  definition: 'Definition',
  examples: 'Examples',
  simplified: 'Simplified',
};

const FIELD_TO_ANKI: Record<FieldType, string> = {
  pinyin: 'Pinyin',
  sino: 'Sino',
  definition: 'Definition',
  examples: 'Example',
  simplified: 'Simplified',
};

export function FieldSuggestionModal({
  isOpen,
  onClose,
  card,
  fieldType,
  mode,
  suggestion,
  suggestionHtml,
  source,
  isLoading,
  error,
  onGenerate,
  onApply,
}: Props) {
  const [isApplying, setIsApplying] = useState(false);

  if (!isOpen) return null;

  const currentValue = card.fields[FIELD_TO_ANKI[fieldType]]?.value || '';
  const isInitialState = !isLoading && !suggestion && !error;
  const displayValue = suggestionHtml || suggestion;

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
      <div className="bg-[#1e1e2e] rounded-lg w-full max-w-lg mx-4 max-h-[80vh] flex flex-col shadow-xl border border-[#313244]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#313244]">
          <h2 className="font-semibold text-[#cdd6f4] flex items-center gap-2">
            {mode === 'fill_missing' ? (
              <Sparkles size={18} className="text-[#cba6f7]" />
            ) : (
              <RefreshCw size={18} className="text-[#f38ba8]" />
            )}
            {mode === 'fill_missing' ? 'Fill' : 'Regenerate'} {FIELD_LABELS[fieldType]}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#313244] rounded-full transition-colors"
          >
            <X size={18} className="text-[#a6adc8]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Word info */}
          <div className="bg-[#313244]/50 rounded-lg p-3">
            <p className="text-2xl text-[#cdd6f4] text-center">{card.fields.Word?.value}</p>
            {card.fields.Pinyin?.value && (
              <p className="text-sm text-[#94e2d5] text-center mt-1">{card.fields.Pinyin?.value}</p>
            )}
          </div>

          {/* Current value */}
          {currentValue && mode === 'regenerate' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#f38ba8] uppercase tracking-wide">
                Current Value (will be replaced)
              </label>
              <div className="bg-[#f38ba8]/10 rounded-lg p-3 border border-[#f38ba8]/20">
                <HtmlContent html={currentValue} />
              </div>
            </div>
          )}

          {/* Initial state - Generate button */}
          {isInitialState && (
            <div className="text-center py-6">
              <p className="text-[#a6adc8] mb-4">
                {mode === 'fill_missing'
                  ? `Generate ${FIELD_LABELS[fieldType]} for this card`
                  : `Regenerate ${FIELD_LABELS[fieldType]} with AI`
                }
              </p>
              <button
                onClick={onGenerate}
                className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 mx-auto ${
                  mode === 'fill_missing'
                    ? 'bg-[#cba6f7]/20 text-[#cba6f7] hover:bg-[#cba6f7]/30'
                    : 'bg-[#f38ba8]/20 text-[#f38ba8] hover:bg-[#f38ba8]/30'
                }`}
              >
                {mode === 'fill_missing' ? <Sparkles size={18} /> : <RefreshCw size={18} />}
                Generate
              </button>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="text-center py-8">
              <Loader2 size={32} className="animate-spin text-[#cba6f7] mx-auto mb-3" />
              <p className="text-[#a6adc8]">Generating...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg p-4 text-center">
              <p className="text-[#f38ba8]">{error}</p>
              <button
                onClick={onGenerate}
                className="mt-3 px-4 py-2 bg-[#f38ba8]/20 text-[#f38ba8] rounded-lg text-sm hover:bg-[#f38ba8]/30"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Result */}
          {displayValue && !isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#a6e3a1] uppercase tracking-wide">
                  Suggestion
                </label>
                {source && <SourceBadge source={source} />}
              </div>
              <div className="bg-[#a6e3a1]/10 rounded-lg p-3 border border-[#a6e3a1]/20">
                <HtmlContent html={displayValue} />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {displayValue && !isLoading && (
          <div className="p-4 border-t border-[#313244] flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[#a6adc8] hover:bg-[#313244] rounded-lg text-sm flex items-center gap-2"
            >
              <SkipForward size={16} />
              Skip
            </button>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="px-4 py-2 bg-[#a6e3a1]/20 text-[#a6e3a1] hover:bg-[#a6e3a1]/30 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
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
