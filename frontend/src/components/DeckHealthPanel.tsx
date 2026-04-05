import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { CardToolsModal } from './CardToolsModal';

export function DeckHealthPanel() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="border-t border-gray-200 dark:border-[#313244]">
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full px-4 py-2.5 flex items-center justify-center gap-2 hover:bg-gray-100 dark:hover:bg-[#313244] transition-colors text-sm font-bold text-gray-600 dark:text-[#bac2de]"
        >
          <Wrench size={14} className="dark:text-[#74c7ec]" />
          Card Tools
        </button>
      </div>

      <CardToolsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
