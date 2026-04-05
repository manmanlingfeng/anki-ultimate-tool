/**
 * Chat message bubble component for Ask AI feature.
 * Displays user and assistant messages with distinct styling.
 */

import { User, Bot } from 'lucide-react';
import { HtmlContent } from '../HtmlContent';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming }: Props) {
  const isUser = role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-[#cba6f7]/20 text-[#cba6f7]'
            : 'bg-[#89b4fa]/20 text-[#89b4fa]'
        }`}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Message bubble */}
      <div
        className={`flex-1 max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? 'bg-[#cba6f7]/20 text-[#cdd6f4] rounded-tr-md'
            : 'bg-[#313244] text-[#cdd6f4] rounded-tl-md'
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="text-sm prose prose-sm prose-invert max-w-none">
            <HtmlContent
              html={content
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br/>')
              }
            />
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-0.5 bg-[#89b4fa] animate-pulse rounded-sm" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
