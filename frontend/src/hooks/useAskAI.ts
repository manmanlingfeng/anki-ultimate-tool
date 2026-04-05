/**
 * Hook for Ask AI chat feature.
 * Handles streaming chat responses and conversation history.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  getChatStreamUrl,
  getChatHistory,
  clearChatHistory,
  type ChatMessage,
  type ChatStreamChunkEvent,
} from '../api/chat';

export interface UseAskAIProps {
  noteId: number;
  word: string;
  pinyin?: string;
  definition?: string;
}

export interface UseAskAIReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  isLoadingHistory: boolean;
  askQuestion: (question: string, displayText?: string) => void;
  stopStream: () => void;
  clearHistory: () => Promise<void>;
  reset: () => void;
}

export function useAskAI({
  noteId,
  word,
  pinyin,
  definition,
}: UseAskAIProps): UseAskAIReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamedContentRef = useRef<string>('');
  const completedRef = useRef<boolean>(false);

  // Load chat history on mount or when noteId changes
  useEffect(() => {
    const loadHistory = async () => {
      if (!noteId) return;

      setIsLoadingHistory(true);
      try {
        const history = await getChatHistory(noteId);
        setMessages(history.messages || []);
      } catch {
        // Ignore errors - just start with empty history
        setMessages([]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [noteId]);

  const reset = useCallback(() => {
    setMessages([]);
    setStreamingContent('');
    setError(null);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const askQuestion = useCallback((question: string, displayText?: string) => {
    // Don't allow new questions while streaming
    if (isStreaming) return;

    setError(null);
    setIsStreaming(true);
    setStreamingContent('');
    streamedContentRef.current = '';
    completedRef.current = false;

    // Add user message immediately for responsive UI
    // Use displayText (preset label) if provided, otherwise use question
    const userMessage: ChatMessage = {
      role: 'user',
      content: displayText || question,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Build SSE URL - include displayText so backend saves readable text to history
    const url = getChatStreamUrl({
      noteId,
      word,
      question,
      pinyin,
      definition,
      displayText,
    });

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('start', () => {
      // Stream started - UI already updated
    });

    eventSource.addEventListener('chunk', (e) => {
      const data: ChatStreamChunkEvent = JSON.parse(e.data);
      streamedContentRef.current += data.content;
      setStreamingContent(streamedContentRef.current);
    });

    eventSource.addEventListener('complete', () => {
      // Prevent double handling
      if (completedRef.current) return;
      completedRef.current = true;

      // Add assistant message from streamed content
      if (streamedContentRef.current) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: streamedContentRef.current,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
      setStreamingContent('');
      streamedContentRef.current = '';
      setIsStreaming(false);
      eventSource.close();
      eventSourceRef.current = null;
    });

    eventSource.addEventListener('error', (e) => {
      // Ignore error if already completed (SSE connection close fires error)
      if (completedRef.current) return;

      const event = e as MessageEvent;
      if (event.data) {
        try {
          const data = JSON.parse(event.data);
          setError(data.message || 'Stream error');
        } catch {
          setError('Connection error');
        }
      } else {
        setError('Connection lost');
      }
      setIsStreaming(false);
      setStreamingContent('');
      streamedContentRef.current = '';
      eventSource.close();
      eventSourceRef.current = null;
    });
  }, [isStreaming, noteId, word, pinyin, definition]);

  const stopStream = useCallback(() => {
    if (eventSourceRef.current) {
      completedRef.current = true; // Prevent error handler from firing
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    // Keep streamed content as partial message
    if (streamedContentRef.current) {
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: streamedContentRef.current + '\n\n(Đã dừng)',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    }
    setStreamingContent('');
    streamedContentRef.current = '';
    setIsStreaming(false);
  }, []);

  const handleClearHistory = useCallback(async () => {
    try {
      await clearChatHistory(noteId);
      setMessages([]);
      setError(null);
    } catch {
      setError('Failed to clear history');
    }
  }, [noteId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    messages,
    isStreaming,
    streamingContent,
    error,
    isLoadingHistory,
    askQuestion,
    stopStream,
    clearHistory: handleClearHistory,
    reset,
  };
}
