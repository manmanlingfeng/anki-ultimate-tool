import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Sparkles,
  Search,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Volume2,
} from 'lucide-react';
import type { Card } from '../types';
import type { FieldType } from '../api/fields';
import {
  suggestField,
  previewCardFix,
  fixCardFields,
  applySuggestion,
  type PreviewResult,
  type FieldSuggestionResponse,
} from '../api/fields';
import { generateExamples, type ExampleSentence } from '../api/ai';
import { generatePreviewAudio, applySingleAudio, discardAudioFile } from '../api/audio';
import { CardPreviewModal } from './CardPreviewModal';
import { FieldSuggestionModal } from './FieldSuggestionModal';
import { ExamplePreviewModal } from './ExamplePreviewModal';
import { AudioPreviewModal } from './AudioPreviewModal';
import { useToast } from './Toast';
import { capitalizeFirst } from '../utils/html';

interface CardToolbarProps {
  card: Card;
  cardIndex: number;
  deckId: number;
  onCardUpdated?: () => void;
  variant?: 'full' | 'compact';
}

type FillFieldType = FieldType | 'audio';
type OperationMode = 'fill_missing' | 'regenerate';

const FIELD_OPTIONS: { value: FillFieldType; label: string }[] = [
  { value: 'pinyin', label: 'Pinyin' },
  { value: 'sino', label: 'Sino-Vietnamese' },
  { value: 'definition', label: 'Definition' },
  { value: 'examples', label: 'Examples' },
  { value: 'simplified', label: 'Simplified' },
  { value: 'audio', label: 'Audio' },
];

// Map API field type to Anki field name
const FIELD_TO_ANKI: Record<FieldType, string> = {
  pinyin: 'Pinyin',
  sino: 'Sino',
  definition: 'Definition',
  examples: 'Example',
  simplified: 'Simplified',
};

export function CardToolbar({ card, cardIndex, deckId, onCardUpdated, variant = 'full' }: CardToolbarProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  // Operation mode state
  const [operationMode, setOperationMode] = useState<OperationMode>('fill_missing');
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  // Field dropdown state
  const [showFillDropdown, setShowFillDropdown] = useState(false);

  // Field suggestion modal state
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [activeFieldType, setActiveFieldType] = useState<FieldType | null>(null);
  const [fieldSuggestion, setFieldSuggestion] = useState<FieldSuggestionResponse | null>(null);
  const [isGeneratingField, setIsGeneratingField] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Example modal state
  const [showExampleModal, setShowExampleModal] = useState(false);
  const [generatedExamples, setGeneratedExamples] = useState<ExampleSentence[] | null>(null);
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [isGeneratingExamples, setIsGeneratingExamples] = useState(false);
  const [exampleError, setExampleError] = useState<string | null>(null);

  // Audio modal state
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Field issues state
  const [isScanning, setIsScanning] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [isFixing, setIsFixing] = useState(false);

  // Get missing fields
  const getMissingFields = (): FillFieldType[] => {
    const missing: FillFieldType[] = [];
    if (!card.fields.Pinyin?.value?.trim()) missing.push('pinyin');
    if (!card.fields.Sino?.value?.trim()) missing.push('sino');
    if (!card.fields.Definition?.value?.trim()) missing.push('definition');
    if (!card.fields.Example?.value?.trim()) missing.push('examples');
    if (!card.fields.Simplified?.value?.trim()) missing.push('simplified');
    if (!card.audio_file) missing.push('audio');
    return missing;
  };

  const missingFields = getMissingFields();

  // Open appropriate modal for field type
  const handleFieldSelect = (fieldType: FillFieldType) => {
    setShowFillDropdown(false);
    setShowModeDropdown(false);

    if (fieldType === 'audio') {
      openAudioModal();
    } else if (fieldType === 'examples') {
      openExampleModal();
    } else {
      openFieldModal(fieldType);
    }
  };

  // --- Field Suggestion Modal ---
  const openFieldModal = (fieldType: FieldType) => {
    setActiveFieldType(fieldType);
    setFieldSuggestion(null);
    setFieldError(null);
    setIsGeneratingField(false);
    setShowFieldModal(true);
  };

  const generateFieldSuggestion = async () => {
    if (!activeFieldType) return;
    setIsGeneratingField(true);
    setFieldError(null);

    try {
      const response = await suggestField({
        note_id: card.note_id,
        field_type: activeFieldType,
        word: card.fields.Word?.value || '',
        pinyin: card.fields.Pinyin?.value,
        definition: card.fields.Definition?.value,
        preview_only: true, // Don't apply, just preview
      });
      setFieldSuggestion(response);
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : 'Failed to generate suggestion');
    } finally {
      setIsGeneratingField(false);
    }
  };

  const applyFieldSuggestion = async () => {
    if (!activeFieldType || !fieldSuggestion) return;
    const ankiField = FIELD_TO_ANKI[activeFieldType];
    const rawValue = fieldSuggestion.html || fieldSuggestion.suggestion;
    // Capitalize first letter for all field types except Pinyin
    const value = activeFieldType === 'pinyin' ? rawValue : capitalizeFirst(rawValue);
    await applySuggestion(card.note_id, ankiField, value);
    queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
    onCardUpdated?.();
    showSuccess(`Applied ${ankiField}`);
  };

  // --- Example Modal ---
  const openExampleModal = () => {
    setGeneratedExamples(null);
    setGeneratedHtml(null);
    setExampleError(null);
    setIsGeneratingExamples(false);
    setShowExampleModal(true);
  };

  const generateExamplesHandler = async () => {
    setIsGeneratingExamples(true);
    setGeneratedExamples(null);
    setGeneratedHtml(null);
    setExampleError(null);

    try {
      const response = await generateExamples({
        note_id: card.note_id,
        word: card.fields.Word?.value || '',
        pinyin: card.fields.Pinyin?.value || '',
        definition: card.fields.Definition?.value || '',
      });
      setGeneratedExamples(response.examples);
      setGeneratedHtml(response.html);
    } catch (error) {
      setExampleError(error instanceof Error ? error.message : 'Failed to generate examples');
    } finally {
      setIsGeneratingExamples(false);
    }
  };

  const applyExamples = async (html: string) => {
    await applySuggestion(card.note_id, 'Example', html);
    queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
    onCardUpdated?.();
  };

  const handleEditWithExamples = (_cardToEdit: Card, prefillExample: string) => {
    sessionStorage.setItem('prefillExample', prefillExample);
    // Note: This would need an onEdit prop to work properly
    showSuccess('Example copied to clipboard for editing');
  };

  // --- Audio Modal ---
  const openAudioModal = () => {
    setPreviewFilename(null);
    setAudioError(null);
    setIsGeneratingAudio(false);
    setShowAudioModal(true);
  };

  const generateAudioHandler = async () => {
    const word = card.fields.Word?.value;
    if (!word) return;

    setIsGeneratingAudio(true);
    setPreviewFilename(null);
    setAudioError(null);

    try {
      const result = await generatePreviewAudio(deckId, card.note_id, word, cardIndex);
      setPreviewFilename(result.filename);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : 'Failed to generate audio');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const applyAudio = async (filename: string) => {
    await applySingleAudio(card.note_id, filename);
    queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
    onCardUpdated?.();
  };

  const discardAudio = async (filename: string) => {
    await discardAudioFile(filename);
  };

  // --- Field Issues ---
  const [hasScannedIssues, setHasScannedIssues] = useState<boolean | null>(null);

  const handleScanIssues = async () => {
    setIsScanning(true);
    try {
      const result = await previewCardFix(card.note_id);
      if (result.changes.length > 0) {
        setPreviewData(result);
        setHasScannedIssues(true);
      } else {
        setHasScannedIssues(false);
        showSuccess('No field issues found');
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to scan issues');
    } finally {
      setIsScanning(false);
    }
  };

  const handleFixIssues = async () => {
    if (!previewData) return;
    setIsFixing(true);
    try {
      await fixCardFields(previewData.note_id);
      queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
      onCardUpdated?.();
      setPreviewData(null);
      setHasScannedIssues(false);
      showSuccess('Fixed field issues');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to fix issues');
    } finally {
      setIsFixing(false);
    }
  };

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        {/* Fill/Regenerate - Compact */}
        <div className="relative">
          <button
            onClick={() => setShowFillDropdown(!showFillDropdown)}
            className={`p-2 rounded-lg ${
              operationMode === 'fill_missing'
                ? 'bg-[#cba6f7]/20 text-[#cba6f7] hover:bg-[#cba6f7]/30'
                : 'bg-[#f38ba8]/20 text-[#f38ba8] hover:bg-[#f38ba8]/30'
            }`}
            title={operationMode === 'fill_missing' ? 'Fill missing fields' : 'Regenerate fields'}
          >
            {operationMode === 'fill_missing' ? <Sparkles size={16} /> : <RefreshCw size={16} />}
          </button>

          {showFillDropdown && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-[#1e1e2e] border border-[#45475a] rounded-lg shadow-lg py-1 min-w-[160px]">
              {FIELD_OPTIONS.map((opt) => {
                const isMissing = missingFields.includes(opt.value);
                const isAvailable = operationMode === 'regenerate' || isMissing;

                return (
                  <button
                    key={opt.value}
                    onClick={() => isAvailable && handleFieldSelect(opt.value)}
                    disabled={!isAvailable}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                      isAvailable ? 'text-[#cdd6f4] hover:bg-[#313244]' : 'text-[#6c7086] cursor-not-allowed'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {opt.value === 'audio' && <Volume2 size={14} />}
                      {opt.label}
                    </span>
                    {!isMissing && operationMode === 'fill_missing' && (
                      <CheckCircle size={14} className="text-[#a6e3a1]" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Field Issues - Compact */}
        <button
          onClick={handleScanIssues}
          disabled={isScanning}
          className={`p-2 rounded-lg disabled:opacity-50 ${
            hasScannedIssues === false
              ? 'bg-[#a6e3a1]/20 text-[#a6e3a1]'
              : hasScannedIssues === true
                ? 'bg-[#f9e2af]/20 text-[#f9e2af]'
                : 'bg-[#89b4fa]/20 text-[#89b4fa] hover:bg-[#89b4fa]/30'
          }`}
          title="Scan for field issues"
        >
          {isScanning ? (
            <Loader2 size={16} className="animate-spin" />
          ) : hasScannedIssues === false ? (
            <CheckCircle size={16} />
          ) : hasScannedIssues === true ? (
            <AlertTriangle size={16} />
          ) : (
            <Search size={16} />
          )}
        </button>

        {/* Modals */}
        {renderModals()}
      </div>
    );
  }

  // Full variant render helper for modals
  function renderModals() {
    return (
      <>
        {/* Field Suggestion Modal */}
        {activeFieldType && activeFieldType !== 'examples' && (
          <FieldSuggestionModal
            isOpen={showFieldModal}
            onClose={() => setShowFieldModal(false)}
            card={card}
            fieldType={activeFieldType}
            mode={operationMode}
            suggestion={fieldSuggestion?.suggestion || null}
            suggestionHtml={fieldSuggestion?.html || null}
            source={fieldSuggestion?.source || null}
            isLoading={isGeneratingField}
            error={fieldError}
            onGenerate={generateFieldSuggestion}
            onApply={applyFieldSuggestion}
          />
        )}

        {/* Example Modal */}
        <ExamplePreviewModal
          isOpen={showExampleModal}
          onClose={() => setShowExampleModal(false)}
          card={card}
          examples={generatedExamples}
          html={generatedHtml}
          isLoading={isGeneratingExamples}
          error={exampleError}
          onApply={applyExamples}
          onEdit={handleEditWithExamples}
          onGenerate={generateExamplesHandler}
          estimatedCost={0.0001}
        />

        {/* Audio Modal */}
        <AudioPreviewModal
          isOpen={showAudioModal}
          onClose={() => setShowAudioModal(false)}
          card={card}
          filename={previewFilename}
          isLoading={isGeneratingAudio}
          error={audioError}
          onGenerate={generateAudioHandler}
          onApply={applyAudio}
          onDiscard={discardAudio}
        />

        {/* Field Issues Modal */}
        {previewData && (
          <CardPreviewModal
            isOpen={true}
            noteId={previewData.note_id}
            word={previewData.word}
            changes={previewData.changes.map((c) => ({
              fieldName: c.field,
              beforeValue: c.original,
              afterValue: c.cleaned,
            }))}
            onClose={() => setPreviewData(null)}
            onApply={handleFixIssues}
            onSkip={() => setPreviewData(null)}
            isApplying={isFixing}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-[#313244]/30 rounded-lg border border-[#45475a]/50">
      {/* Status indicators */}
      <div className="flex items-center gap-2 mr-2">
        {missingFields.length === 0 ? (
          <span className="flex items-center gap-1.5 text-xs text-[#a6e3a1]">
            <CheckCircle size={14} />
            Complete
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-[#f9e2af]">
            <AlertCircle size={14} />
            {missingFields.length} missing
          </span>
        )}
      </div>

      {/* Mode + Field Dropdown (split button) */}
      <div className="relative flex">
        {/* Mode selector */}
        <button
          onClick={() => {
            setShowModeDropdown(!showModeDropdown);
            setShowFillDropdown(false);
          }}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-l-lg transition-colors ${
            operationMode === 'fill_missing'
              ? 'bg-[#cba6f7]/20 text-[#cba6f7]'
              : 'bg-[#f38ba8]/20 text-[#f38ba8]'
          }`}
        >
          {operationMode === 'fill_missing' ? <Sparkles size={14} /> : <RefreshCw size={14} />}
          {operationMode === 'fill_missing' ? 'Fill' : 'Regen'}
          <ChevronDown size={14} />
        </button>

        {/* Field selector */}
        <button
          onClick={() => {
            setShowFillDropdown(!showFillDropdown);
            setShowModeDropdown(false);
          }}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-r-lg border-l transition-colors ${
            operationMode === 'fill_missing'
              ? 'bg-[#cba6f7]/20 text-[#cba6f7] border-[#cba6f7]/30'
              : 'bg-[#f38ba8]/20 text-[#f38ba8] border-[#f38ba8]/30'
          }`}
        >
          Field
          <ChevronDown size={14} />
        </button>

        {/* Mode dropdown */}
        {showModeDropdown && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-[#1e1e2e] border border-[#45475a] rounded-lg shadow-lg py-1 min-w-[140px]">
            <button
              onClick={() => {
                setOperationMode('fill_missing');
                setShowModeDropdown(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#313244] ${
                operationMode === 'fill_missing' ? 'text-[#cba6f7]' : 'text-[#cdd6f4]'
              }`}
            >
              <Sparkles size={14} />
              Fill Missing
            </button>
            <button
              onClick={() => {
                setOperationMode('regenerate');
                setShowModeDropdown(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#313244] ${
                operationMode === 'regenerate' ? 'text-[#f38ba8]' : 'text-[#cdd6f4]'
              }`}
            >
              <RefreshCw size={14} />
              Regenerate
            </button>
          </div>
        )}

        {/* Field dropdown */}
        {showFillDropdown && (
          <div className="absolute top-full right-0 mt-1 z-50 bg-[#1e1e2e] border border-[#45475a] rounded-lg shadow-lg py-1 min-w-[160px]">
            {FIELD_OPTIONS.map((opt) => {
              const isMissing = missingFields.includes(opt.value);
              const isAvailable = operationMode === 'regenerate' || isMissing;

              return (
                <button
                  key={opt.value}
                  onClick={() => isAvailable && handleFieldSelect(opt.value)}
                  disabled={!isAvailable}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                    isAvailable ? 'text-[#cdd6f4] hover:bg-[#313244]' : 'text-[#6c7086] cursor-not-allowed'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {opt.value === 'audio' && <Volume2 size={14} />}
                    {opt.label}
                  </span>
                  {!isMissing && operationMode === 'fill_missing' && (
                    <CheckCircle size={14} className="text-[#a6e3a1]" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Field Issues */}
      <button
        onClick={handleScanIssues}
        disabled={isScanning}
        className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg disabled:opacity-50 ${
          hasScannedIssues === false
            ? 'bg-[#a6e3a1]/20 text-[#a6e3a1]'
            : hasScannedIssues === true
              ? 'bg-[#f9e2af]/20 text-[#f9e2af]'
              : 'bg-[#89b4fa]/20 text-[#89b4fa] hover:bg-[#89b4fa]/30'
        }`}
      >
        {isScanning ? (
          <Loader2 size={14} className="animate-spin" />
        ) : hasScannedIssues === false ? (
          <CheckCircle size={14} />
        ) : hasScannedIssues === true ? (
          <AlertTriangle size={14} />
        ) : (
          <Search size={14} />
        )}
        {hasScannedIssues === false ? 'Clean' : hasScannedIssues === true ? 'Issues Found' : 'Field Issues'}
      </button>

      {/* Modals */}
      {renderModals()}
    </div>
  );
}
