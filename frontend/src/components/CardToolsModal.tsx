import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  Search,
  Volume2,
  BarChart3,
  FilePlus,
} from 'lucide-react';
import { FieldIssuesTab } from './scanner/FieldIssuesTab';
import { BatchFillTab } from './scanner/BatchFillTab';
import { FieldStatusOverview } from './scanner/FieldStatusOverview';
import { DeckSelector } from './scanner/DeckSelector';
import { BatchAudioModal } from './BatchAudioModal';
import { useAudioGenerator } from '../hooks/useAudioGenerator';
import type { ScanMode, OperationMode } from '../api/ai';
import type { FieldType } from '../api/fields';

type FillFieldType = FieldType | 'audio';
type TabType = 'overview' | 'fields' | 'batch';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  // Optional initial values for when opened from DeckToolbar
  initialDeckId?: number;
  initialTab?: TabType;
  initialFieldType?: FieldType;
  initialOperationMode?: OperationMode;
}

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 size={16} /> },
  { id: 'fields', label: 'Field Issues', icon: <Search size={16} /> },
  { id: 'batch', label: 'Batch Operations', icon: <FilePlus size={16} /> },
];

export function CardToolsModal({
  isOpen,
  onClose,
  initialDeckId,
  initialTab,
  initialFieldType,
  initialOperationMode,
}: Props) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'overview');

  // Shared deck selection state
  const [scanMode, setScanMode] = useState<ScanMode>(initialDeckId ? 'deck' : 'all');
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(initialDeckId || null);
  const [selectedDeckIds, setSelectedDeckIds] = useState<number[]>(initialDeckId ? [initialDeckId] : []);

  // Fill Missing field type selector
  const [fillFieldType, setFillFieldType] = useState<FillFieldType>(initialFieldType || 'pinyin');

  // Operation mode: 'fill_missing', 'regenerate_all', or 'verify'
  const [operationMode, setOperationMode] = useState<OperationMode>(initialOperationMode || 'fill_missing');

  // Audio modal state
  const [showAudioModal, setShowAudioModal] = useState(false);
  const audioGenerator = useAudioGenerator();

  // Update state when initial values change (modal reopened with different settings)
  useEffect(() => {
    if (isOpen) {
      if (initialTab) setActiveTab(initialTab);
      if (initialDeckId) {
        setScanMode('deck');
        setSelectedDeckId(initialDeckId);
        setSelectedDeckIds([initialDeckId]);
      }
      if (initialFieldType) setFillFieldType(initialFieldType);
      if (initialOperationMode) setOperationMode(initialOperationMode);
    }
  }, [isOpen, initialTab, initialDeckId, initialFieldType, initialOperationMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-[#11111b]/80 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#1e1e2e] rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#313244]">
          <h2 className="text-lg font-semibold dark:text-[#cdd6f4]">
            Card Tools
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-[#313244] rounded transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-[#a6adc8]" />
          </button>
        </div>

        {/* Deck Selection - shared across all tabs */}
        <div className="p-4 border-b border-gray-200 dark:border-[#313244] bg-gray-50 dark:bg-[#181825]">
          <DeckSelector
            scanMode={scanMode}
            selectedDeckId={selectedDeckId}
            selectedDeckIds={selectedDeckIds}
            onModeChange={setScanMode}
            onDeckChange={setSelectedDeckId}
            onDeckIdsChange={setSelectedDeckIds}
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-[#313244]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 dark:border-[#cba6f7] text-blue-600 dark:text-[#cba6f7]'
                  : 'border-transparent text-gray-500 dark:text-[#a6adc8] hover:text-gray-700 dark:hover:text-[#cdd6f4] hover:border-gray-300 dark:hover:border-[#45475a]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content - all tabs stay mounted to preserve state */}
        <div className="flex-1 overflow-auto p-4">
          <div className={activeTab === 'overview' ? '' : 'hidden'}>
            <FieldStatusOverview
              scanMode={scanMode}
              selectedDeckId={selectedDeckId}
              onStartBatchFill={(fieldType: FieldType) => {
                setFillFieldType(fieldType);
                setActiveTab('batch');
              }}
              onStartBatchRegenerate={(fieldType: FieldType) => {
                setFillFieldType(fieldType);
                setOperationMode('regenerate_all');
                setActiveTab('batch');
              }}
            />
          </div>
          <div className={activeTab === 'fields' ? '' : 'hidden'}>
            <FieldIssuesTab
              scanMode={scanMode}
              selectedDeckId={selectedDeckId}
            />
          </div>
          <div className={activeTab === 'batch' ? '' : 'hidden'}>
            <div className="space-y-4">
              {/* Mode selector */}
              <div className="flex gap-2">
                <button
                  onClick={() => setOperationMode('fill_missing')}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    operationMode === 'fill_missing'
                      ? 'bg-[#cba6f7]/20 text-[#cba6f7]'
                      : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
                  }`}
                >
                  Fill Missing
                </button>
                <button
                  onClick={() => setOperationMode('regenerate_all')}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    operationMode === 'regenerate_all'
                      ? 'bg-[#f38ba8]/20 text-[#f38ba8]'
                      : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
                  }`}
                >
                  Regenerate All
                </button>
                <button
                  onClick={() => setOperationMode('verify')}
                  disabled={fillFieldType === 'audio'}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    operationMode === 'verify'
                      ? 'bg-[#89b4fa]/20 text-[#89b4fa]'
                      : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
                  } ${fillFieldType === 'audio' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Verify Existing
                </button>
              </div>

              {/* Field type selector */}
              <div className="flex flex-wrap gap-2">
                {(['pinyin', 'sino', 'definition', 'examples', 'simplified', 'audio'] as FillFieldType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      setFillFieldType(type);
                      if (type === 'audio') {
                        if (operationMode === 'verify') {
                          setOperationMode('fill_missing');
                        }
                        setShowAudioModal(true);
                      }
                    }}
                    className={`px-3 py-1.5 text-sm rounded transition-colors ${
                      fillFieldType === type
                        ? type === 'audio'
                          ? 'bg-[#89b4fa]/20 text-[#89b4fa]'
                          : 'bg-[#cba6f7]/20 text-[#cba6f7]'
                        : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>

              {/* Batch Operations Tab - for non-audio fields */}
              {fillFieldType !== 'audio' ? (
                <BatchFillTab
                  fieldType={fillFieldType as FieldType}
                  scanMode={scanMode}
                  selectedDeckId={selectedDeckId}
                  operationMode={operationMode}
                />
              ) : (
                <div className="text-center py-8 text-[#6c7086]">
                  <Volume2 size={40} className="mx-auto mb-3 opacity-50" />
                  <p>Click the button above to open Audio Generation modal</p>
                  <button
                    onClick={() => setShowAudioModal(true)}
                    className="mt-4 px-4 py-2 bg-[#89b4fa]/20 text-[#89b4fa] rounded-lg text-sm font-medium hover:bg-[#89b4fa]/30"
                  >
                    Open Audio Modal
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Audio Modal */}
      <BatchAudioModal
        isOpen={showAudioModal}
        onClose={() => {
          setShowAudioModal(false);
          audioGenerator.reset();
        }}
        generator={audioGenerator}
        onApproveComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['cards'] });
          queryClient.invalidateQueries({ queryKey: ['fieldStats'] });
        }}
        onStartGenerate={() => {
          if (selectedDeckId) {
            audioGenerator.startStream(selectedDeckId, operationMode === 'regenerate_all');
          }
        }}
        mode={operationMode === 'regenerate_all' ? 'regen_all' : 'fill_missing'}
      />
    </div>
  );
}
