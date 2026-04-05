/**
 * Preset question chips for Ask AI feature.
 * Displays quick action buttons based on word type.
 */

import type { PresetQuestion } from '../../api/chat';

interface Props {
  presets: PresetQuestion[];
  onSelect: (presetId: string, label: string) => void;
  disabled?: boolean;
}

export function PresetQuestions({ presets, onSelect, disabled }: Props) {
  if (presets.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((preset) => (
        <button
          key={preset.id}
          onClick={() => onSelect(preset.id, preset.label)}
          disabled={disabled}
          className="px-3 py-1.5 text-xs bg-[#313244] text-[#cdd6f4] rounded-full hover:bg-[#45475a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[#45475a]"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
