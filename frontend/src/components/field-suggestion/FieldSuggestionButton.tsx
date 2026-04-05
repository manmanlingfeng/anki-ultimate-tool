import { Sparkles, Loader2, Book } from 'lucide-react';
import type { FieldType } from '../../api/fields';

interface FieldSuggestionButtonProps {
  fieldType: FieldType;
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  variant?: 'icon' | 'text';
}

const FIELD_ICONS: Record<FieldType, { icon: typeof Sparkles; color: string }> = {
  pinyin: { icon: Book, color: 'text-[#89b4fa]' },
  sino: { icon: Sparkles, color: 'text-[#cba6f7]' },
  definition: { icon: Sparkles, color: 'text-[#cba6f7]' },
  examples: { icon: Sparkles, color: 'text-[#cba6f7]' },
  simplified: { icon: Book, color: 'text-[#89b4fa]' },
};

export function FieldSuggestionButton({
  fieldType,
  onClick,
  isLoading = false,
  disabled = false,
  size = 'sm',
  variant = 'icon',
}: FieldSuggestionButtonProps) {
  const { icon: Icon, color } = FIELD_ICONS[fieldType];
  const iconSize = size === 'sm' ? 14 : 16;

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || isLoading}
        className={`p-1.5 rounded hover:bg-[#313244] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${color}`}
        title={`Suggest ${fieldType}`}
      >
        {isLoading ? (
          <Loader2 size={iconSize} className="animate-spin" />
        ) : (
          <Icon size={iconSize} />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-[#313244]/50 hover:bg-[#313244] transition-colors disabled:opacity-50 ${color}`}
    >
      {isLoading ? (
        <Loader2 size={iconSize} className="animate-spin" />
      ) : (
        <Icon size={iconSize} />
      )}
      Suggest
    </button>
  );
}
