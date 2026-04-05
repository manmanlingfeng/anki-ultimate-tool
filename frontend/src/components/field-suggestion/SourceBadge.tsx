import { Book, Bot, Check } from 'lucide-react';

interface SourceBadgeProps {
  source: 'dictionary' | 'ai' | 'local';
  className?: string;
}

export function SourceBadge({ source, className = '' }: SourceBadgeProps) {
  if (source === 'dictionary') {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[#89b4fa]/20 text-[#89b4fa] ${className}`}>
        <Book size={12} />
        Dictionary
      </span>
    );
  }

  if (source === 'local') {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[#a6e3a1]/20 text-[#a6e3a1] ${className}`}>
        <Check size={12} />
        Local
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[#cba6f7]/20 text-[#cba6f7] ${className}`}>
      <Bot size={12} />
      AI
    </span>
  );
}
