import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  ChevronDown,
  BarChart3,
  Volume2,
  Sparkles,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import type { FieldType } from '../api/fields';
import { getFieldStats } from '../api/fields';
import { BatchAudioModal } from './BatchAudioModal';
import { useAudioGenerator } from '../hooks/useAudioGenerator';
import { CardToolsModal } from './CardToolsModal';
import type { OperationMode } from '../api/ai';

interface DeckToolbarProps {
  deckId: number;
}

type FillFieldType = FieldType | 'audio';

const FIELD_OPTIONS: { value: FillFieldType; label: string }[] = [
  { value: 'pinyin', label: 'Pinyin' },
  { value: 'sino', label: 'Sino-Vietnamese' },
  { value: 'definition', label: 'Definition' },
  { value: 'examples', label: 'Examples' },
  { value: 'simplified', label: 'Simplified' },
  { value: 'audio', label: 'Audio' },
];

const OPERATION_MODES: { value: OperationMode; label: string; icon: React.ReactNode }[] = [
  { value: 'fill_missing', label: 'Fill Missing', icon: <Sparkles size={14} /> },
  { value: 'regenerate_all', label: 'Regenerate All', icon: <RefreshCw size={14} /> },
  { value: 'verify', label: 'Verify Existing', icon: <CheckCircle size={14} /> },
];

export function DeckToolbar({ deckId }: DeckToolbarProps) {
  const queryClient = useQueryClient();

  // Dropdown states
  const [showFillDropdown, setShowFillDropdown] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  // Selected operation
  const [selectedField, setSelectedField] = useState<FillFieldType>('pinyin');
  const [selectedMode, setSelectedMode] = useState<OperationMode>('fill_missing');

  // Modal states
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [scannerInitialTab, setScannerInitialTab] = useState<'overview' | 'fields' | 'batch'>('overview');
  const [showAudioModal, setShowAudioModal] = useState(false);
  const audioGenerator = useAudioGenerator();

  // Fetch field stats for quick display
  const { data: fieldStats } = useQuery({
    queryKey: ['fieldStats', deckId],
    queryFn: () => getFieldStats(deckId, 'deck'),
  });

  // Calculate total missing
  const totalMissing = fieldStats
    ? fieldStats.pinyin.missing +
      fieldStats.sino.missing +
      fieldStats.definition.missing +
      fieldStats.examples.missing +
      fieldStats.simplified.missing +
      fieldStats.audio.missing
    : 0;

  // Open scanner modal with specific tab
  const openScanner = (tab: 'overview' | 'fields' | 'batch') => {
    setScannerInitialTab(tab);
    setShowScannerModal(true);
  };

  // Handle fill action
  const handleFillAction = (field: FillFieldType, mode: OperationMode) => {
    setSelectedField(field);
    setSelectedMode(mode);
    setShowFillDropdown(false);
    setShowModeDropdown(false);

    if (field === 'audio') {
      setShowAudioModal(true);
    } else {
      // Open scanner modal in batch tab with pre-selected field and mode
      setScannerInitialTab('batch');
      setShowScannerModal(true);
    }
  };

  // Get current mode info
  const currentMode = OPERATION_MODES.find(m => m.value === selectedMode) || OPERATION_MODES[0];

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-[#181825] border-b border-[#313244]">
      {/* Stats button */}
      <button
        onClick={() => openScanner('overview')}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-[#313244] text-[#a6adc8] hover:bg-[#45475a] transition-colors"
        title={totalMissing > 0 ? `${totalMissing} missing fields in this deck` : 'View deck statistics'}
      >
        <BarChart3 size={14} />
        Stats
        {totalMissing > 0 && (
          <span className="px-1.5 py-0.5 text-xs bg-[#f9e2af]/20 text-[#f9e2af] rounded">
            {totalMissing}
          </span>
        )}
      </button>

      {/* Field Issues button */}
      <button
        onClick={() => openScanner('fields')}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-[#313244] text-[#a6adc8] hover:bg-[#45475a] transition-colors"
        title="Find cards with missing or incomplete fields"
      >
        <Search size={14} />
        Field Issues
      </button>

      {/* Fill/Regenerate/Verify dropdown */}
      <div className="relative flex">
        {/* Mode selector */}
        <button
          onClick={() => {
            setShowModeDropdown(!showModeDropdown);
            setShowFillDropdown(false);
          }}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-l-lg transition-colors ${
            selectedMode === 'fill_missing'
              ? 'bg-[#cba6f7]/20 text-[#cba6f7]'
              : selectedMode === 'regenerate_all'
                ? 'bg-[#f38ba8]/20 text-[#f38ba8]'
                : 'bg-[#89b4fa]/20 text-[#89b4fa]'
          }`}
        >
          {currentMode.icon}
          {currentMode.label}
          <ChevronDown size={14} />
        </button>

        {/* Field selector */}
        <button
          onClick={() => {
            setShowFillDropdown(!showFillDropdown);
            setShowModeDropdown(false);
          }}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-r-lg border-l transition-colors ${
            selectedMode === 'fill_missing'
              ? 'bg-[#cba6f7]/20 text-[#cba6f7] border-[#cba6f7]/30'
              : selectedMode === 'regenerate_all'
                ? 'bg-[#f38ba8]/20 text-[#f38ba8] border-[#f38ba8]/30'
                : 'bg-[#89b4fa]/20 text-[#89b4fa] border-[#89b4fa]/30'
          }`}
        >
          {FIELD_OPTIONS.find(f => f.value === selectedField)?.label || 'Select'}
          <ChevronDown size={14} />
        </button>

        {/* Mode dropdown */}
        {showModeDropdown && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-[#1e1e2e] border border-[#45475a] rounded-lg shadow-lg py-1 min-w-[160px]">
            {OPERATION_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => {
                  setSelectedMode(mode.value);
                  setShowModeDropdown(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#313244] ${
                  selectedMode === mode.value ? 'text-[#cba6f7]' : 'text-[#cdd6f4]'
                }`}
              >
                {mode.icon}
                {mode.label}
              </button>
            ))}
          </div>
        )}

        {/* Field dropdown */}
        {showFillDropdown && (
          <div className="absolute top-full right-0 mt-1 z-50 bg-[#1e1e2e] border border-[#45475a] rounded-lg shadow-lg py-1 min-w-[160px]">
            {FIELD_OPTIONS.filter(opt => selectedMode !== 'verify' || opt.value !== 'audio').map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleFillAction(opt.value, selectedMode)}
                className="w-full text-left px-3 py-2 text-sm text-[#cdd6f4] hover:bg-[#313244]"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Audio shortcut */}
      <button
        onClick={() => setShowAudioModal(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-[#a6e3a1]/20 text-[#a6e3a1] hover:bg-[#a6e3a1]/30 transition-colors"
        title="Generate audio for cards in this deck"
      >
        <Volume2 size={14} />
        Audio
      </button>

      {/* Card Tools Modal with deck pre-selected */}
      <CardToolsModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        initialDeckId={deckId}
        initialTab={scannerInitialTab}
        initialFieldType={selectedField !== 'audio' ? selectedField : 'pinyin'}
        initialOperationMode={selectedMode}
      />

      {/* Audio Modal */}
      <BatchAudioModal
        isOpen={showAudioModal}
        onClose={() => {
          setShowAudioModal(false);
          audioGenerator.reset();
        }}
        generator={audioGenerator}
        onApproveComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
          queryClient.invalidateQueries({ queryKey: ['fieldStats', deckId] });
        }}
        onStartGenerate={() => {
          audioGenerator.startStream(deckId, selectedMode === 'regenerate_all');
        }}
        mode={selectedMode === 'regenerate_all' ? 'regen_all' : 'fill_missing'}
      />
    </div>
  );
}
