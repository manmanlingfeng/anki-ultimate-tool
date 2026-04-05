import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Loader2, CheckCircle, BookOpen, Volume2, VolumeX, Edit2, MessageCircle } from 'lucide-react';
import { useStudy } from '../../hooks/useStudy';
import { StudyProgress } from './StudyProgress';
import { StudyCard } from './StudyCard';
import { AnswerButtons } from './AnswerButtons';
import { CardFormModal } from '../CardFormModal';
import { AskAIModal } from '../AskAIModal';

// LocalStorage key for study settings
const STUDY_SETTINGS_KEY = 'anki-study-settings';

function getStoredAutoPlay(): boolean {
  try {
    const stored = localStorage.getItem(STUDY_SETTINGS_KEY);
    if (stored) {
      const settings = JSON.parse(stored);
      return settings.autoPlayAudio ?? false;
    }
  } catch {
    // Ignore parse errors
  }
  return false;
}

function setStoredAutoPlay(value: boolean): void {
  try {
    const stored = localStorage.getItem(STUDY_SETTINGS_KEY);
    const settings = stored ? JSON.parse(stored) : {};
    settings.autoPlayAudio = value;
    localStorage.setItem(STUDY_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  deckId: number | null;  // null = study all decks
  deckName: string;
}

export function StudyModal({ isOpen, onClose, deckId, deckName }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [autoPlayAudio, setAutoPlayAudio] = useState(getStoredAutoPlay);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAskAI, setShowAskAI] = useState(false);
  const prevStateRef = useRef<string | null>(null);

  const {
    state,
    currentCard,
    currentIndex,
    totalCards,
    isLoading,
    error,
    start,
    flip,
    answer,
    reset,
    updateCurrentCardFields,
  } = useStudy(deckId);

  // Start session when modal opens
  useEffect(() => {
    if (isOpen && state === 'idle') {
      start();
    }
  }, [isOpen, state, start]);

  // Reset when closing
  const handleClose = () => {
    reset();
    onClose();
  };

  // Play audio
  const playAudio = useCallback(() => {
    if (currentCard?.audio_file && audioRef.current) {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3002';
      const audioUrl = `${apiBase}/api/audio/play/${encodeURIComponent(currentCard.audio_file)}`;
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(() => {
        // Ignore audio errors
      });
    }
  }, [currentCard?.audio_file]);

  // Toggle auto-play setting
  const toggleAutoPlay = useCallback(() => {
    setAutoPlayAudio((prev) => {
      const newValue = !prev;
      setStoredAutoPlay(newValue);
      return newValue;
    });
  }, []);

  // Auto-play audio when flipping to back side
  useEffect(() => {
    if (prevStateRef.current === 'front' && state === 'back' && autoPlayAudio) {
      playAudio();
    }
    prevStateRef.current = state;
  }, [state, autoPlayAudio, playAudio]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 dark:bg-[#11111b]/80" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-gray-100 dark:bg-[#1e1e2e] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden dark:shadow-[#11111b]/50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#313244]">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-purple-500 dark:text-[#cba6f7]" />
            <h2 className="text-lg font-semibold dark:text-[#cdd6f4]">Study Mode</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto-play audio toggle */}
            <button
              onClick={toggleAutoPlay}
              className={`p-2 rounded-lg transition-colors ${
                autoPlayAudio
                  ? 'bg-green-100 dark:bg-[#a6e3a1]/20 text-green-600 dark:text-[#a6e3a1]'
                  : 'hover:bg-gray-200 dark:hover:bg-[#313244] text-gray-400 dark:text-[#6c7086]'
              }`}
              title={autoPlayAudio ? 'Auto-play audio: ON' : 'Auto-play audio: OFF'}
            >
              {autoPlayAudio ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-200 dark:hover:bg-[#313244] rounded-lg transition-colors"
            >
              <X size={20} className="text-gray-500 dark:text-[#a6adc8]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Loading state */}
          {state === 'loading' && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={48} className="animate-spin text-purple-500 dark:text-[#cba6f7] mb-4" />
              <p className="text-gray-500 dark:text-[#a6adc8]">Loading study session...</p>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="bg-red-50 dark:bg-[#f38ba8]/10 border border-red-200 dark:border-[#f38ba8]/20 rounded-lg p-6 text-center">
                <p className="text-red-700 dark:text-[#f38ba8] mb-4">{error || 'Failed to load study session'}</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={start}
                    className="px-4 py-2 bg-red-500 dark:bg-[#f38ba8]/20 text-white dark:text-[#f38ba8] rounded-lg hover:bg-red-600 dark:hover:bg-[#f38ba8]/30 transition-colors"
                  >
                    Try again
                  </button>
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 bg-gray-200 dark:bg-[#313244] text-gray-700 dark:text-[#bac2de] rounded-lg hover:bg-gray-300 dark:hover:bg-[#45475a] transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Complete state */}
          {state === 'complete' && (
            <div className="flex flex-col items-center justify-center py-16">
              <CheckCircle size={64} className="text-green-500 dark:text-[#a6e3a1] mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 dark:text-[#cdd6f4] mb-2">
                Session Complete!
              </h3>
              <p className="text-gray-500 dark:text-[#a6adc8] mb-6">
                {totalCards > 0
                  ? `You reviewed ${totalCards} cards`
                  : 'No cards due for review'}
              </p>
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-purple-500 dark:bg-[#cba6f7]/20 text-white dark:text-[#cba6f7] rounded-lg hover:bg-purple-600 dark:hover:bg-[#cba6f7]/30 transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {/* Study state */}
          {(state === 'front' || state === 'back' || state === 'answering') && currentCard && (
            <>
              {/* Progress */}
              <StudyProgress
                current={currentIndex + 1}
                total={totalCards}
                deckName={deckName}
              />

              {/* Card */}
              <StudyCard
                card={currentCard}
                isFlipped={state === 'back' || state === 'answering'}
                onFlip={flip}
                onPlayAudio={playAudio}
              />

              {/* Answer buttons and Edit - always render to preserve layout, but invisible when not flipped */}
              {currentCard.next_reviews && (
                <div className={`mt-6 space-y-3 transition-opacity ${(state === 'back' || state === 'answering') ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                  <AnswerButtons
                    nextReviews={currentCard.next_reviews}
                    onAnswer={answer}
                    disabled={isLoading}
                  />
                  {/* Edit and Ask AI buttons */}
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => setShowAskAI(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-[#cba6f7] hover:bg-[#cba6f7]/10 rounded-lg transition-colors"
                    >
                      <MessageCircle size={16} />
                      AI Assistant
                    </button>
                    <button
                      onClick={() => setShowEditModal(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 dark:text-[#a6adc8] hover:bg-gray-100 dark:hover:bg-[#313244] rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                      Edit Card
                    </button>
                  </div>
                </div>
              )}

              {/* Keyboard hints */}
              <div className="mt-4 text-center text-xs text-gray-400 dark:text-[#6c7086]">
                {state === 'front' ? (
                  <span>Press [Space] to show answer</span>
                ) : (
                  <span>Press [1-4] to answer • [Esc] to exit</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} />

      {/* Edit Card Modal */}
      {currentCard && (
        <CardFormModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          deckName={currentCard.deck_name}
          deckId={deckId ?? undefined}
          editCard={{
            ...currentCard,
            audio_index: 0, // Not used by CardFormModal, but required by Card type
          }}
          onSave={updateCurrentCardFields}
        />
      )}

      {/* Ask AI Modal */}
      {currentCard && (
        <AskAIModal
          isOpen={showAskAI}
          onClose={() => setShowAskAI(false)}
          card={currentCard}
        />
      )}
    </div>
  );
}
