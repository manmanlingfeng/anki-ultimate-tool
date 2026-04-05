import { Volume2 } from 'lucide-react';
import type { StudyCard as StudyCardType } from '../../types';
import { HtmlContent } from '../HtmlContent';

interface Props {
  card: StudyCardType;
  isFlipped: boolean;
  onFlip: () => void;
  onPlayAudio: () => void;
}

export function StudyCard({ card, isFlipped, onFlip, onPlayAudio }: Props) {
  const word = card.fields.Word?.value || '';
  const pinyin = card.fields.Pinyin?.value || '';
  const definition = card.fields.Definition?.value || '';
  const example = card.fields.Example?.value || '';
  const sino = card.fields.Sino?.value || '';
  const tip = card.fields.Tip?.value || '';
  const simplified = card.fields.Simplified?.value || '';

  return (
    <div
      className="bg-white dark:bg-[#313244]/80 rounded-xl shadow-lg h-[350px] p-6 flex flex-col cursor-pointer transition-all hover:scale-[1.01] dark:shadow-[#11111b]/50"
      onClick={!isFlipped ? onFlip : undefined}
    >
      {/* Card content - fixed height with scroll for long content */}
      <div className={`flex-1 flex flex-col items-center text-center overflow-y-auto ${isFlipped ? 'justify-start py-2' : 'justify-center'}`}>
        {/* Word - always shown, clean without bold for better Chinese readability */}
        <div className="text-5xl text-gray-800 dark:text-[#cdd6f4] mb-4 tracking-wide shrink-0">
          <HtmlContent html={word} />
        </div>

        {isFlipped ? (
          <>
            {/* Pinyin - teal for phonetic guide */}
            <div className="text-2xl text-teal-600 dark:text-[#94e2d5] mb-2 shrink-0">
              <HtmlContent html={pinyin} />
            </div>

            {/* Sino-Vietnamese - subtle secondary info */}
            {sino && (
              <div className="text-base text-gray-400 dark:text-[#a6adc8] mb-3 shrink-0">
                <HtmlContent html={sino} inline />
              </div>
            )}

            {/* Simplified - if different from word */}
            {simplified && (
              <div className="text-lg text-purple-600 dark:text-[#cba6f7] mb-2 shrink-0">
                <span className="text-xs text-gray-400 dark:text-[#6c7086] mr-2">简</span>
                {simplified}
              </div>
            )}

            {/* Definition - primary readable content */}
            <div className="text-xl text-gray-600 dark:text-[#bac2de] mb-4 shrink-0 w-full">
              <HtmlContent html={definition} />
            </div>

            {/* Tip - learning hint */}
            {tip && (
              <div className="text-sm text-amber-600 dark:text-[#f9e2af] mb-3 px-3 py-1.5 bg-amber-50 dark:bg-[#f9e2af]/10 rounded-lg shrink-0 w-full max-w-md">
                <HtmlContent html={tip} />
              </div>
            )}

            {/* Example */}
            {example && (
              <div className="text-sm text-gray-500 dark:text-[#89b4fa]/80 mt-2 px-4 py-2 bg-gray-50 dark:bg-[#45475a]/50 rounded-lg shrink-0 w-full max-w-md">
                <HtmlContent html={example} />
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-400 dark:text-[#6c7086] mt-4">
            <p className="text-sm">Click or press Space to reveal</p>
          </div>
        )}
      </div>

      {/* Audio button */}
      {card.audio_file && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlayAudio();
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-[#a6e3a1] hover:bg-gray-100 dark:hover:bg-[#a6e3a1]/10 rounded-lg transition-colors"
          >
            <Volume2 size={18} />
            Play Audio
          </button>
        </div>
      )}
    </div>
  );
}
