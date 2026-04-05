interface Props {
  current: number;
  total: number;
  deckName: string;
}

export function StudyProgress({ current, total, deckName }: Props) {
  const percent = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="mb-6">
      <div className="flex justify-between text-sm mb-2">
        <span className="text-gray-600 dark:text-[#a6adc8] truncate max-w-[200px]" title={deckName}>
          {deckName}
        </span>
        <span className="text-gray-700 dark:text-[#cdd6f4] font-medium">
          {current}/{total} cards
        </span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-[#45475a] rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 dark:bg-[#b4befe] transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
