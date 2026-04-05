import { useState } from 'react';
import { X, Loader2, Sparkles, Check, SkipForward, Edit2, Play, DollarSign } from 'lucide-react';
import type { Card } from '../types';
import type { ExampleSentence } from '../api/ai';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  card: Card;
  examples: ExampleSentence[] | null;
  html: string | null;
  isLoading: boolean;
  error: string | null;
  onApply: (html: string) => Promise<void>;
  onEdit: (card: Card, prefillExample: string) => void;
  onGenerate: () => void;  // New: called when user confirms to generate
  estimatedCost?: number;  // Cost estimate for single card (~$0.0001)
}

export function ExamplePreviewModal({
  isOpen,
  onClose,
  card,
  examples,
  html,
  isLoading,
  error,
  onApply,
  onEdit,
  onGenerate,
  estimatedCost = 0.0001,  // Default estimate for single card
}: Props) {
  const [isApplying, setIsApplying] = useState(false);

  if (!isOpen) return null;

  // Check if we're in initial state (not started, no results)
  const isInitialState = !isLoading && !examples && !error;

  const handleApply = async () => {
    if (!html) return;
    setIsApplying(true);
    try {
      await onApply(html);
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  const handleEdit = () => {
    onEdit(card, html || '');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e2e] rounded-lg w-full max-w-lg mx-4 max-h-[80vh] flex flex-col shadow-xl border border-[#313244]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#313244]">
          <h2 className="font-semibold text-[#cdd6f4] flex items-center gap-2">
            <Sparkles size={18} className="text-[#cba6f7]" />
            AI Example Generator
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#313244] rounded-full transition-colors"
          >
            <X size={18} className="text-[#a6adc8]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isInitialState ? (
            <div className="flex flex-col items-center justify-center py-8 text-[#a6adc8]">
              {/* Card info */}
              <div className="text-center pb-4 mb-4 border-b border-[#313244] w-full">
                <p className="text-3xl text-[#cdd6f4]">{card.fields.Word?.value}</p>
                <p className="text-[#94e2d5] mt-1">{card.fields.Pinyin?.value}</p>
              </div>

              <Sparkles size={40} className="text-[#cba6f7] mb-4" />
              <p className="text-lg text-[#cdd6f4] mb-2">Generate Example Sentences</p>
              <p className="text-sm text-[#6c7086] mb-4 text-center max-w-sm">
                AI will generate 2 example sentences with pinyin, Sino-Vietnamese, and Vietnamese translations.
              </p>

              {/* Cost estimate */}
              <div className="flex items-center gap-2 text-sm text-[#f9e2af] bg-[#f9e2af]/10 px-3 py-2 rounded-lg mb-6">
                <DollarSign size={14} />
                <span>Estimated cost: ${estimatedCost.toFixed(4)}</span>
              </div>

              <button
                onClick={onGenerate}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-[#cba6f7]/20 text-[#cba6f7] rounded-lg font-medium hover:bg-[#cba6f7]/30 transition-colors"
              >
                <Play size={20} />
                Generate Examples
              </button>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#a6adc8]">
              <Loader2 className="animate-spin mb-3" size={32} />
              <p>Generating examples...</p>
              <p className="text-sm text-[#6c7086] mt-1">This may take a few seconds</p>
            </div>
          ) : error ? (
            <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg p-4 text-[#f38ba8]">
              <p className="font-medium">Generation Failed</p>
              <p className="text-sm mt-1 opacity-80">{error}</p>
            </div>
          ) : examples && examples.length > 0 ? (
            <div className="space-y-4">
              {/* Card info */}
              <div className="text-center pb-4 border-b border-[#313244]">
                <p className="text-3xl text-[#cdd6f4]">{card.fields.Word?.value}</p>
                <p className="text-[#94e2d5] mt-1">{card.fields.Pinyin?.value}</p>
              </div>

              {/* Generated examples */}
              {examples.map((ex, i) => (
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
          ) : (
            <div className="text-center py-12 text-[#6c7086]">
              <p>No examples generated</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {!isLoading && examples && examples.length > 0 && (
          <div className="p-4 border-t border-[#313244] flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#313244] text-[#cdd6f4] rounded-lg text-sm font-medium hover:bg-[#45475a] transition-colors"
            >
              <SkipForward size={16} />
              Skip
            </button>
            <button
              onClick={handleEdit}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#89b4fa]/20 text-[#89b4fa] rounded-lg text-sm font-medium hover:bg-[#89b4fa]/30 transition-colors"
            >
              <Edit2 size={16} />
              Edit
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

        {/* Close button for error state */}
        {!isLoading && error && (
          <div className="p-4 border-t border-[#313244]">
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-[#313244] text-[#cdd6f4] rounded-lg text-sm font-medium hover:bg-[#45475a] transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
