import type { EaseRating } from '../../api/study';

interface Props {
  nextReviews: string[];  // Anki's interval labels [Again, Hard, Good, Easy]
  onAnswer: (ease: EaseRating) => void;
  disabled: boolean;
}

// Catppuccin Mocha color palette for answer buttons
const buttons: { ease: EaseRating; label: string; lightColor: string; darkColor: string; key: string; index: number }[] = [
  {
    ease: 1,
    label: 'Again',
    lightColor: 'bg-red-500 hover:bg-red-600 text-white',
    darkColor: 'dark:bg-[#f38ba8]/20 dark:hover:bg-[#f38ba8]/30 dark:text-[#f38ba8]',
    key: '1',
    index: 0
  },
  {
    ease: 2,
    label: 'Hard',
    lightColor: 'bg-orange-500 hover:bg-orange-600 text-white',
    darkColor: 'dark:bg-[#fab387]/20 dark:hover:bg-[#fab387]/30 dark:text-[#fab387]',
    key: '2',
    index: 1
  },
  {
    ease: 3,
    label: 'Good',
    lightColor: 'bg-green-500 hover:bg-green-600 text-white',
    darkColor: 'dark:bg-[#a6e3a1]/20 dark:hover:bg-[#a6e3a1]/30 dark:text-[#a6e3a1]',
    key: '3',
    index: 2
  },
  {
    ease: 4,
    label: 'Easy',
    lightColor: 'bg-blue-500 hover:bg-blue-600 text-white',
    darkColor: 'dark:bg-[#89b4fa]/20 dark:hover:bg-[#89b4fa]/30 dark:text-[#89b4fa]',
    key: '4',
    index: 3
  },
];

export function AnswerButtons({ nextReviews, onAnswer, disabled }: Props) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {buttons.map(({ ease, label, lightColor, darkColor, key, index }) => (
        <button
          key={ease}
          onClick={() => onAnswer(ease)}
          disabled={disabled}
          className={`${lightColor} ${darkColor} rounded-lg py-3 px-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center dark:backdrop-blur-sm`}
        >
          <span className="font-medium text-sm">{label}</span>
          <span className="text-xs opacity-80">{nextReviews[index] || '?'}</span>
          <span className="text-[10px] opacity-60 mt-0.5">[{key}]</span>
        </button>
      ))}
    </div>
  );
}
