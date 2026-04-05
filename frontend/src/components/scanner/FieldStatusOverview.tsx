import { BarChart3, DollarSign } from 'lucide-react';
import { useFieldStats } from '../../hooks/useFieldStats';
import { FieldStatusCard } from './FieldStatusCard';
import type { ScanMode } from '../../api/ai';
import type { FieldType } from '../../api/fields';

interface Props {
  scanMode: ScanMode;
  selectedDeckId: number | null;
  onStartBatchFill: (fieldType: FieldType) => void;
  onStartBatchRegenerate?: (fieldType: FieldType) => void;
}

// Estimated cost per card for each field type
const COST_PER_CARD: Record<string, number> = {
  pinyin: 0.00001,     // Mostly dictionary, minimal AI
  sino: 0.0001,        // AI
  definition: 0.0001,  // AI
  examples: 0.0003,    // AI (more tokens)
  simplified: 0,       // Dictionary only
  audio: 0.001,        // TTS
};

const FIELD_SOURCES: Record<string, 'dictionary' | 'ai' | 'tts' | 'mixed'> = {
  pinyin: 'mixed',
  sino: 'ai',
  definition: 'ai',
  examples: 'ai',
  simplified: 'dictionary',
  audio: 'tts',
};

export function FieldStatusOverview({
  scanMode,
  selectedDeckId,
  onStartBatchFill,
}: Props) {
  const { data: stats, isLoading, error } = useFieldStats(selectedDeckId, scanMode);

  // Calculate total cost estimate
  const totalMissingCost = stats
    ? (stats.pinyin.missing * COST_PER_CARD.pinyin) +
      (stats.sino.missing * COST_PER_CARD.sino) +
      (stats.definition.missing * COST_PER_CARD.definition) +
      (stats.examples.missing * COST_PER_CARD.examples) +
      (stats.audio.missing * COST_PER_CARD.audio)
    : 0;

  if (scanMode !== 'all' && !selectedDeckId) {
    return (
      <div className="text-center py-12 text-[#6c7086]">
        <BarChart3 size={40} className="mx-auto mb-3 opacity-50" />
        <p>Select a deck to view field statistics</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg p-4 text-[#f38ba8]">
        <p className="font-medium">Failed to load statistics</p>
        <p className="text-sm mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-medium text-[#cdd6f4] flex items-center gap-2">
          <BarChart3 size={18} className="text-[#89b4fa]" />
          Field Status Overview
        </h3>
        <p className="text-sm text-[#a6adc8] mt-1">
          {scanMode === 'all' ? 'All decks' : stats?.deck_name || 'Selected deck'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <FieldStatusCard
          title="Pinyin"
          stats={stats?.pinyin || null}
          isLoading={isLoading}
          source={FIELD_SOURCES.pinyin}
          onFillMissing={() => onStartBatchFill('pinyin')}
          estimatedCost={stats?.pinyin.missing ? stats.pinyin.missing * COST_PER_CARD.pinyin : undefined}
        />
        <FieldStatusCard
          title="Sino-Vietnamese"
          stats={stats?.sino || null}
          isLoading={isLoading}
          source={FIELD_SOURCES.sino}
          onFillMissing={() => onStartBatchFill('sino')}
          estimatedCost={stats?.sino.missing ? stats.sino.missing * COST_PER_CARD.sino : undefined}
        />
        <FieldStatusCard
          title="Definition"
          stats={stats?.definition || null}
          isLoading={isLoading}
          source={FIELD_SOURCES.definition}
          onFillMissing={() => onStartBatchFill('definition')}
          estimatedCost={stats?.definition.missing ? stats.definition.missing * COST_PER_CARD.definition : undefined}
        />
        <FieldStatusCard
          title="Examples"
          stats={stats?.examples || null}
          isLoading={isLoading}
          source={FIELD_SOURCES.examples}
          onFillMissing={() => onStartBatchFill('examples')}
          estimatedCost={stats?.examples.missing ? stats.examples.missing * COST_PER_CARD.examples : undefined}
        />
        <FieldStatusCard
          title="Audio"
          stats={stats?.audio || null}
          isLoading={isLoading}
          source={FIELD_SOURCES.audio}
          onFillMissing={() => console.log('Audio fill not yet implemented')}
          estimatedCost={stats?.audio.missing ? stats.audio.missing * COST_PER_CARD.audio : undefined}
        />
        <FieldStatusCard
          title="Simplified"
          stats={stats?.simplified || null}
          isLoading={isLoading}
          source={FIELD_SOURCES.simplified}
          onFillMissing={() => onStartBatchFill('simplified')}
        />
      </div>

      {/* Total Cost Estimate */}
      {!isLoading && totalMissingCost > 0 && (
        <div className="p-4 bg-[#f9e2af]/10 border border-[#f9e2af]/30 rounded-lg">
          <div className="flex items-center gap-2 text-[#f9e2af]">
            <DollarSign size={18} />
            <span className="font-medium">Total Cost Estimate</span>
          </div>
          <p className="text-sm text-[#a6adc8] mt-2">
            Fill all missing fields: ~${totalMissingCost.toFixed(4)}
          </p>
          <p className="text-xs text-[#6c7086] mt-1">
            Based on {stats?.pinyin.missing || 0} pinyin, {stats?.sino.missing || 0} sino,{' '}
            {stats?.definition.missing || 0} definition, {stats?.examples.missing || 0} examples,{' '}
            {stats?.audio.missing || 0} audio
          </p>
        </div>
      )}

      {/* All Complete */}
      {!isLoading && stats && totalMissingCost === 0 && (
        <div className="text-center py-8 text-[#a6e3a1]">
          <BarChart3 size={40} className="mx-auto mb-3" />
          <p className="font-medium">All fields complete!</p>
          <p className="text-sm text-[#a6adc8] mt-1">
            No missing fields in selected scope
          </p>
        </div>
      )}
    </div>
  );
}
