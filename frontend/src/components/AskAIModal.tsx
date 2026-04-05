/**
 * Ask AI Modal for flashcard Q&A chat.
 * Provides conversational interface for asking questions about Chinese words/phrases.
 */

import { useState, useRef, useEffect } from 'react';
import { X, MessageCircle, Send, Loader2, Trash2, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { Card, StudyCard } from '../types';
import { useAskAI } from '../hooks/useAskAI';
import { getPresets, type PresetQuestion } from '../api/chat';
import { ChatMessage } from './ask-ai/ChatMessage';
import { PresetQuestions } from './ask-ai/PresetQuestions';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  card: Card | StudyCard;
}

// Extract card info from either Card or StudyCard
function getCardInfo(card: Card | StudyCard) {
  const fields = card.fields;
  return {
    noteId: card.note_id,
    word: fields.Word?.value || '',
    pinyin: fields.Pinyin?.value || '',
    definition: fields.Definition?.value || '',
  };
}

export function AskAIModal({ isOpen, onClose, card }: Props) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { noteId, word, pinyin, definition } = getCardInfo(card);

  const {
    messages,
    isStreaming,
    streamingContent,
    error,
    isLoadingHistory,
    askQuestion,
    stopStream,
    clearHistory,
  } = useAskAI({ noteId, word, pinyin, definition });

  // Fetch preset questions based on word
  const { data: presetsData } = useQuery({
    queryKey: ['chat-presets', word],
    queryFn: () => getPresets(word),
    enabled: isOpen && !!word,
  });

  const presets: PresetQuestion[] = presetsData?.presets || [];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle submit
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    askQuestion(trimmed);
    setInput('');
  };

  // Handle preset click - send ID to backend, show label in chat
  const handlePresetClick = (presetId: string, label: string) => {
    if (isStreaming) return;
    askQuestion(presetId, label);
  };

  // Handle key press (Enter to send, Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Handle clear history
  const handleClear = async () => {
    if (isStreaming) return;
    await clearHistory();
  };

  if (!isOpen) return null;

  const hasMessages = messages.length > 0 || streamingContent;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e2e] rounded-lg w-full max-w-2xl mx-4 h-[80vh] flex flex-col shadow-xl border border-[#313244]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#313244]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#cba6f7]/20 flex items-center justify-center">
              <MessageCircle size={20} className="text-[#cba6f7]" />
            </div>
            <h2 className="font-semibold text-[#cdd6f4]">AI Assistant</h2>
          </div>
          <div className="flex items-center gap-2">
            {hasMessages && (
              <button
                onClick={handleClear}
                disabled={isStreaming}
                className="p-2 hover:bg-[#313244] rounded-lg transition-colors text-[#a6adc8] hover:text-[#f38ba8] disabled:opacity-50"
                title="Xóa lịch sử"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#313244] rounded-lg transition-colors"
            >
              <X size={18} className="text-[#a6adc8]" />
            </button>
          </div>
        </div>

        {/* Card info banner */}
        <div className="px-4 py-3 bg-[#181825] border-b border-[#313244]">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-2xl text-[#cdd6f4]">{word}</span>
            {pinyin && <span className="text-[#94e2d5]">{pinyin}</span>}
            {definition && (
              <span className="text-[#a6adc8] truncate flex-1">{definition}</span>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center h-full text-[#a6adc8]">
              <Loader2 className="animate-spin mr-2" size={20} />
              Đang tải lịch sử...
            </div>
          ) : !hasMessages ? (
            <div className="flex flex-col items-center justify-center h-full text-[#6c7086]">
              <MessageCircle size={48} className="mb-4 opacity-50" />
              <p className="text-center">Ask AI anything about this word</p>
              <p className="text-sm mt-1">Or select a quick question below</p>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <ChatMessage key={i} role={msg.role} content={msg.content} />
              ))}
              {streamingContent && (
                <ChatMessage
                  role="assistant"
                  content={streamingContent}
                  isStreaming
                />
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error display */}
        {error && (
          <div className="mx-4 mb-2 p-3 bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg flex items-center gap-2 text-[#f38ba8] text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Preset questions */}
        {presets.length > 0 && (
          <div className="px-4 py-3 border-t border-[#313244]">
            <p className="text-xs text-[#6c7086] mb-2">Câu hỏi nhanh:</p>
            <PresetQuestions
              presets={presets}
              onSelect={handlePresetClick}
              disabled={isStreaming}
            />
          </div>
        )}

        {/* Input area */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-[#313244]">
          <div className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập câu hỏi của bạn..."
              disabled={isStreaming}
              rows={1}
              className="flex-1 px-4 py-2.5 bg-[#313244] text-[#cdd6f4] placeholder-[#6c7086] rounded-lg border border-[#45475a] focus:outline-none focus:border-[#cba6f7] resize-none disabled:opacity-50"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stopStream}
                className="px-4 py-2.5 bg-[#f38ba8]/20 text-[#f38ba8] rounded-lg hover:bg-[#f38ba8]/30 transition-colors"
              >
                Dừng
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-4 py-2.5 bg-[#cba6f7]/20 text-[#cba6f7] rounded-lg hover:bg-[#cba6f7]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={20} />
              </button>
            )}
          </div>
          <p className="text-xs text-[#6c7086] mt-2">
            Enter để gửi • Shift+Enter để xuống dòng
          </p>
        </form>
      </div>
    </div>
  );
}
