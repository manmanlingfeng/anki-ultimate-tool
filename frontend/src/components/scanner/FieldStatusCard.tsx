import { Loader2, Book, Bot, Volume2 } from 'lucide-react';
import type { FieldStats } from '../../api/fields';

interface FieldStatusCardProps {
  title: string;
  stats: FieldStats | null;
  isLoading: boolean;
  source: 'dictionary' | 'ai' | 'tts' | 'mixed';
  onFillMissing?: () => void;
  onRegenerate?: () => void;
  estimatedCost?: number;
}

const SOURCE_CONFIG = {
  dictionary: { color: '#89b4fa', icon: Book, label: 'Dict' },
  ai: { color: '#cba6f7', icon: Bot, label: 'AI' },
  tts: { color: '#a6e3a1', icon: Volume2, label: 'TTS' },
  mixed: { color: '#f9e2af', icon: Bot, label: 'Mixed' },
};

export function FieldStatusCard({
  title,
  stats,
  isLoading,
  source,
  onFillMissing,
  onRegenerate,
  estimatedCost,
}: FieldStatusCardProps) {
  const config = SOURCE_CONFIG[source];
  const SourceIcon = config.icon;
  const percent = stats ? Math.round((stats.filled / stats.total) * 100) : 0;
  const hasTotal = stats && stats.total > 0;

  return (
    <div className="bg-[#313244]/50 rounded-lg p-4 border border-[#45475a]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-[#cdd6f4]">{title}</h4>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full"
          style={{
            backgroundColor: `${config.color}20`,
            color: config.color
          }}
        >
          <SourceIcon size={10} />
          {config.label}
        </span>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={20} className="animate-spin text-[#6c7086]" />
        </div>
      ) : hasTotal ? (
        <>
          {/* Progress bar */}
          <div className="w-full h-2 bg-[#45475a] rounded-full mb-2">
            <div
              className={`h-2 rounded-full transition-all ${
                percent === 100 ? 'bg-[#a6e3a1]' : percent > 80 ? 'bg-[#f9e2af]' : 'bg-[#f38ba8]'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Numbers */}
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="text-[#a6adc8]">
              {stats.filled}/{stats.total} filled
            </span>
            <span className={percent === 100 ? 'text-[#a6e3a1]' : 'text-[#f9e2af]'}>
              {percent}%
            </span>
          </div>

          {/* Missing count */}
          {stats.missing > 0 && (
            <div className="text-xs text-[#f38ba8] mb-3">
              {stats.missing} cards missing
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {stats.missing > 0 && onFillMissing && (
              <button
                onClick={onFillMissing}
                className="flex-1 px-3 py-1.5 text-xs bg-[#cba6f7]/20 text-[#cba6f7] rounded hover:bg-[#cba6f7]/30 transition-colors"
              >
                Fill Missing
              </button>
            )}
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex-1 px-3 py-1.5 text-xs bg-[#89b4fa]/20 text-[#89b4fa] rounded hover:bg-[#89b4fa]/30 transition-colors"
              >
                Regenerate
              </button>
            )}
          </div>

          {/* Cost estimate */}
          {estimatedCost !== undefined && estimatedCost > 0 && stats.missing > 0 && (
            <div className="mt-2 text-xs text-[#6c7086]">
              Est. cost: ${estimatedCost.toFixed(4)}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-4 text-[#6c7086] text-sm">
          No cards found
        </div>
      )}
    </div>
  );
}
