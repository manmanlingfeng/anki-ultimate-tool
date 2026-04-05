import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Sparkles, Loader2, Search, AlertTriangle, CheckCircle, RefreshCw, ChevronDown, Volume2, Square, ExternalLink } from 'lucide-react';
import type { Card } from '../types';
import { useCreateCard, useUpdateCard } from '../hooks/useCards';
import { RichTextEditor } from './editor';
import { CardFormModalField } from './CardFormModalField';
import { suggestField, previewCardFix, fixCardFields, type FieldType, type PreviewResult } from '../api/fields';
import { generatePreviewAudio, discardAudioFile } from '../api/audio';
import { checkDuplicateWord, type DuplicateMatch } from '../api/cards';
import { CardPreviewModal } from './CardPreviewModal';
import { DuplicateCardPreviewModal } from './DuplicateCardPreviewModal';
import { cleanHtml, capitalizeFirst } from '../utils/html';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

type SuggestMode = 'fill_missing' | 'regenerate';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  deckName: string;
  deckId?: number;
  editCard?: Card | null;
  onSave?: (fields: Record<string, { value: string; order: number }>) => void;
}

export function CardFormModal({ isOpen, onClose, deckName, deckId = 0, editCard, onSave }: Props) {
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [form, setForm] = useState({
    word: '',
    pinyin: '',
    sino: '',
    definition: '',
    tip: '',
    example: '',
    simplified: ''
  });

  const [sources, setSources] = useState<Record<string, 'dictionary' | 'ai' | 'local'>>({});
  const [isSuggestingAll, setIsSuggestingAll] = useState(false);
  const [suggestMode, setSuggestMode] = useState<SuggestMode>('fill_missing');
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  // Audio preview state
  const [previewAudioFilename, setPreviewAudioFilename] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Simplified detection state
  const [isAlreadySimplified, setIsAlreadySimplified] = useState(false);

  // Current suggestion progress
  const [currentSuggestionField, setCurrentSuggestionField] = useState<string | null>(null);

  // Scan issues state
  const [isScanning, setIsScanning] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const [hasScannedIssues, setHasScannedIssues] = useState<boolean | null>(null);

  // Preview before create state
  const [showCreatePreview, setShowCreatePreview] = useState(false);

  // Duplicate detection state
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [previewingDuplicate, setPreviewingDuplicate] = useState<DuplicateMatch | null>(null);
  const duplicateCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced duplicate check
  const checkForDuplicates = useCallback(async (word: string) => {
    const cleanWord = cleanHtml(word).trim();
    if (!cleanWord || editCard) {
      setDuplicateMatches([]);
      return;
    }

    setIsCheckingDuplicate(true);
    try {
      const result = await checkDuplicateWord(cleanWord);
      setDuplicateMatches(result.matches);
    } catch (err) {
      console.error('Failed to check duplicates:', err);
      setDuplicateMatches([]);
    } finally {
      setIsCheckingDuplicate(false);
    }
  }, [editCard]);

  // Check for duplicates when word changes (debounced)
  useEffect(() => {
    if (duplicateCheckTimeoutRef.current) {
      clearTimeout(duplicateCheckTimeoutRef.current);
    }

    const word = form.word;
    if (!cleanHtml(word).trim() || editCard) {
      setDuplicateMatches([]);
      return;
    }

    duplicateCheckTimeoutRef.current = setTimeout(() => {
      checkForDuplicates(word);
    }, 500); // 500ms debounce

    return () => {
      if (duplicateCheckTimeoutRef.current) {
        clearTimeout(duplicateCheckTimeoutRef.current);
      }
    };
  }, [form.word, editCard, checkForDuplicates]);

  useEffect(() => {
    if (editCard) {
      setForm({
        word: editCard.fields.Word?.value || '',
        pinyin: editCard.fields.Pinyin?.value || '',
        sino: editCard.fields.Sino?.value || '',
        definition: editCard.fields.Definition?.value || '',
        tip: editCard.fields.Tip?.value || '',
        example: editCard.fields.Example?.value || '',
        simplified: editCard.fields.Simplified?.value || ''
      });
    } else {
      setForm({ word: '', pinyin: '', sino: '', definition: '', tip: '', example: '', simplified: '' });
    }
    setSources({});
    setIsSuggestingAll(false);
    setPreviewData(null);
    setHasScannedIssues(null);
    setPreviewAudioFilename(null);
    setIsAlreadySimplified(false);
    setCurrentSuggestionField(null);
    setShowCreatePreview(false);
    setDuplicateMatches([]);
    setPreviewingDuplicate(null);
  }, [editCard, isOpen]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (previewAudioFilename) {
        discardAudioFile(previewAudioFilename).catch(() => {});
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [previewAudioFilename]);

  const handleSuggestAll = async () => {
    if (!cleanHtml(form.word).trim()) return;

    setIsSuggestingAll(true);
    setShowModeDropdown(false);
    setIsAlreadySimplified(false);

    const word = cleanHtml(form.word);

    // Track values locally since setState is async and won't be available in next iteration
    let currentPinyin = form.pinyin ? cleanHtml(form.pinyin) : '';
    let currentDefinition = form.definition ? cleanHtml(form.definition) : '';

    try {
      const noteId = editCard?.note_id || 0;
      const fieldsToSuggest: Array<{ key: keyof typeof form; type: FieldType; label: string }> = [
        { key: 'pinyin', type: 'pinyin', label: 'Pinyin' },
        { key: 'sino', type: 'sino', label: 'Sino' },
        { key: 'definition', type: 'definition', label: 'Definition' },
        { key: 'example', type: 'examples', label: 'Example' },
        { key: 'simplified', type: 'simplified', label: 'Simplified' },
      ];

      for (const { key, type, label } of fieldsToSuggest) {
        // In fill_missing mode, skip if field already has content
        if (suggestMode === 'fill_missing' && form[key]?.trim()) continue;

        setCurrentSuggestionField(label);

        try {
          const response = await suggestField({
            note_id: noteId,
            field_type: type,
            word,
            pinyin: currentPinyin || undefined,
            definition: currentDefinition || undefined,
          });

          // Handle simplified "already simplified" case - leave field empty
          if (type === 'simplified' && response.is_already_simplified) {
            setIsAlreadySimplified(true);
            // Leave simplified field empty when word is already simplified
            continue;
          }

          // Update form with suggestion (capitalize first letter except pinyin)
          const suggestionValue = response.html || response.suggestion;
          const finalValue = key === 'pinyin' ? suggestionValue : capitalizeFirst(suggestionValue);

          setForm((prev) => ({
            ...prev,
            [key]: finalValue,
          }));

          // Track source
          setSources((prev) => ({
            ...prev,
            [key]: response.source,
          }));

          // Update local tracking for subsequent requests
          if (key === 'pinyin') {
            currentPinyin = suggestionValue;
          } else if (key === 'definition') {
            currentDefinition = suggestionValue;
          }
        } catch (err) {
          console.error(`Failed to suggest ${key}:`, err);
          // Continue with other fields even if one fails
        }
      }

      // Generate audio if not already present
      if (!previewAudioFilename) {
        setCurrentSuggestionField('Audio');
        setIsGeneratingAudio(true);
        try {
          const audioResult = await generatePreviewAudio(deckId, noteId, word, 0);
          setPreviewAudioFilename(audioResult.filename);
        } catch (err) {
          console.error('Failed to generate audio:', err);
        } finally {
          setIsGeneratingAudio(false);
        }
      }
    } finally {
      setIsSuggestingAll(false);
      setCurrentSuggestionField(null);
    }
  };

  // Play/stop audio preview
  const handlePlayAudio = () => {
    if (!previewAudioFilename) return;

    if (isPlayingAudio && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlayingAudio(false);
      return;
    }

    const audioUrl = `${API_BASE_URL}/api/audio/play/${encodeURIComponent(previewAudioFilename)}`;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onplay = () => setIsPlayingAudio(true);
    audio.onended = () => {
      setIsPlayingAudio(false);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setIsPlayingAudio(false);
      audioRef.current = null;
    };

    audio.play().catch(() => setIsPlayingAudio(false));
  };

  // Scan field issues
  const handleScanIssues = async () => {
    if (!editCard) return;
    setIsScanning(true);
    try {
      const result = await previewCardFix(editCard.note_id);
      if (result.changes.length > 0) {
        setPreviewData(result);
        setHasScannedIssues(true);
      } else {
        setHasScannedIssues(false);
      }
    } catch (error) {
      console.error('Failed to scan issues:', error);
    } finally {
      setIsScanning(false);
    }
  };

  // Fix field issues
  const handleFixIssues = async () => {
    if (!editCard || !previewData) return;
    setIsFixing(true);
    try {
      await fixCardFields(editCard.note_id);
      setPreviewData(null);
      setHasScannedIssues(false);
    } catch (error) {
      console.error('Failed to fix issues:', error);
    } finally {
      setIsFixing(false);
    }
  };

  // Handle form submission
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  // Show preview modal
  const handlePreviewClick = () => {
    setShowCreatePreview(true);
  };

  const handleSubmit = async () => {
    // Clean HTML before submitting
    const cleanedForm = {
      word: cleanHtml(form.word),
      pinyin: cleanHtml(form.pinyin),
      sino: cleanHtml(form.sino),
      definition: cleanHtml(form.definition),
      tip: cleanHtml(form.tip),
      example: cleanHtml(form.example),
      simplified: cleanHtml(form.simplified),
    };

    if (editCard) {
      await updateCard.mutateAsync({
        note_id: editCard.note_id,
        fields: {
          Word: cleanedForm.word,
          Pinyin: cleanedForm.pinyin,
          Sino: cleanedForm.sino,
          Definition: cleanedForm.definition,
          Tip: cleanedForm.tip,
          Example: cleanedForm.example,
          Simplified: cleanedForm.simplified
        }
      });
      // Notify parent of updated fields (for study mode refresh)
      onSave?.({
        Word: { value: cleanedForm.word, order: 0 },
        Pinyin: { value: cleanedForm.pinyin, order: 1 },
        Sino: { value: cleanedForm.sino, order: 2 },
        Definition: { value: cleanedForm.definition, order: 3 },
        Tip: { value: cleanedForm.tip, order: 4 },
        Example: { value: cleanedForm.example, order: 5 },
        Simplified: { value: cleanedForm.simplified, order: 6 },
      });
    } else {
      await createCard.mutateAsync({
        deck_name: deckName,
        ...cleanedForm,
        // Include audio filename if generated
        audio_filename: previewAudioFilename || undefined,
      });
    }

    onClose();
  };

  const handleConfirmCreate = async () => {
    setShowCreatePreview(false);
    await handleSubmit();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-[#11111b]/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1e1e2e] rounded-lg w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#313244]">
          <h2 className="font-medium dark:text-[#cdd6f4]">{editCard ? 'Edit Card' : 'New Card'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-[#313244] rounded">
            <X size={20} className="dark:text-[#a6adc8]" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-[#bac2de]">Word *</label>
            <RichTextEditor
              value={form.word}
              onChange={(html) => setForm({ ...form, word: html })}
              singleLine
              minHeight="32px"
            />
            {/* Duplicate warning - only for new cards */}
            {!editCard && duplicateMatches.length > 0 && (
              <div className="mt-2 p-2.5 bg-[#f9e2af]/10 border border-[#f9e2af]/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-[#f9e2af] mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#f9e2af] font-medium">
                      Word already exists
                    </p>
                    <div className="mt-1 space-y-0.5">
                      {duplicateMatches.map((match) => (
                        <button
                          key={match.note_id}
                          type="button"
                          onClick={() => setPreviewingDuplicate(match)}
                          className="w-full text-left text-xs text-[#f9e2af]/80 hover:bg-[#f9e2af]/10 rounded px-1.5 py-1 -mx-1.5 transition-colors flex items-center gap-1"
                        >
                          <span className="font-medium">{cleanHtml(match.word)}</span>
                          {match.pinyin && <span className="text-[#94e2d5]">({cleanHtml(match.pinyin)})</span>}
                          <span className="text-[#6c7086] truncate">in {match.deck_name}</span>
                          <ExternalLink size={10} className="ml-auto shrink-0 opacity-50" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Checking indicator */}
            {!editCard && isCheckingDuplicate && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[#6c7086]">
                <Loader2 size={12} className="animate-spin" />
                <span>Checking for duplicates...</span>
              </div>
            )}
          </div>

          {/* Suggest All Fields button - visible when word has content */}
          {cleanHtml(form.word).trim() && (
            <button
              type="button"
              onClick={handleSuggestAll}
              disabled={isSuggestingAll || createCard.isPending || updateCard.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-[#cba6f7]/20 to-[#89b4fa]/20 text-[#cba6f7] rounded-lg hover:from-[#cba6f7]/30 hover:to-[#89b4fa]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSuggestingAll ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Generating {currentSuggestionField}...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Suggest All Fields</span>
                </>
              )}
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <CardFormModalField
              label="Pinyin"
              fieldType="pinyin"
              value={form.pinyin}
              onChange={(html) => setForm({ ...form, pinyin: html })}
              source={sources.pinyin}
              onSourceChange={(source) => setSources({ ...sources, pinyin: source })}
              noteId={editCard?.note_id}
              word={form.word}
              required
              singleLine
              minHeight="32px"
            />
            <CardFormModalField
              label="Sino"
              fieldType="sino"
              value={form.sino}
              onChange={(html) => setForm({ ...form, sino: html })}
              source={sources.sino}
              onSourceChange={(source) => setSources({ ...sources, sino: source })}
              noteId={editCard?.note_id}
              word={form.word}
              required
              singleLine
              minHeight="32px"
            />
          </div>

          <CardFormModalField
            label="Definition"
            fieldType="definition"
            value={form.definition}
            onChange={(html) => setForm({ ...form, definition: html })}
            source={sources.definition}
            onSourceChange={(source) => setSources({ ...sources, definition: source })}
            noteId={editCard?.note_id}
            word={form.word}
            pinyin={form.pinyin}
            required
            minHeight="40px"
          />

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-[#bac2de]">Tip</label>
            <RichTextEditor
              value={form.tip}
              onChange={(html) => setForm({ ...form, tip: html })}
              minHeight="60px"
            />
          </div>

          <CardFormModalField
            label="Example"
            fieldType="examples"
            value={form.example}
            onChange={(html) => setForm({ ...form, example: html })}
            source={sources.example}
            onSourceChange={(source) => setSources({ ...sources, example: source })}
            noteId={editCard?.note_id}
            word={form.word}
            pinyin={form.pinyin}
            definition={form.definition}
            minHeight="40px"
          />

          <CardFormModalField
            label="Simplified"
            fieldType="simplified"
            value={form.simplified}
            onChange={(html) => setForm({ ...form, simplified: html })}
            source={sources.simplified}
            onSourceChange={(source) => setSources({ ...sources, simplified: source })}
            noteId={editCard?.note_id}
            word={form.word}
            singleLine
            minHeight="32px"
            alreadySimplified={isAlreadySimplified}
          />

          {/* Audio Preview Section */}
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-[#bac2de]">Audio</label>
            <div className="flex items-center gap-3 px-3 py-2 bg-[#181825]/50 rounded-lg border border-[#313244]">
              {previewAudioFilename ? (
                <>
                  <button
                    type="button"
                    onClick={handlePlayAudio}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-[#a6e3a1]/20 text-[#a6e3a1] hover:bg-[#a6e3a1]/30 transition-colors"
                  >
                    {isPlayingAudio ? <Square size={14} /> : <Volume2 size={16} />}
                  </button>
                  <span className="text-sm text-[#a6e3a1]">Audio generated</span>
                </>
              ) : isGeneratingAudio ? (
                <>
                  <Loader2 size={16} className="animate-spin text-[#89b4fa]" />
                  <span className="text-sm text-[#89b4fa]">Generating audio...</span>
                </>
              ) : (
                <span className="text-sm text-[#6c7086]">Click "Suggest All Fields" to generate</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex items-center gap-2">
              {/* Suggest mode dropdown with button */}
              <div className="relative flex">
                <button
                  type="button"
                  onClick={() => setShowModeDropdown(!showModeDropdown)}
                  disabled={!form.word.trim() || isSuggestingAll || createCard.isPending || updateCard.isPending}
                  className={`flex items-center gap-2 px-3 py-2 rounded-l transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    suggestMode === 'fill_missing'
                      ? 'bg-[#cba6f7]/10 text-[#cba6f7] hover:bg-[#cba6f7]/20'
                      : 'bg-[#f38ba8]/10 text-[#f38ba8] hover:bg-[#f38ba8]/20'
                  }`}
                >
                  {isSuggestingAll ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : suggestMode === 'fill_missing' ? (
                    <Sparkles size={16} />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  {suggestMode === 'fill_missing' ? 'Fill Missing' : 'Regenerate'}
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleSuggestAll}
                  disabled={!form.word.trim() || isSuggestingAll || createCard.isPending || updateCard.isPending}
                  className={`flex items-center gap-2 px-3 py-2 rounded-r border-l transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    suggestMode === 'fill_missing'
                      ? 'bg-[#cba6f7]/10 text-[#cba6f7] border-[#cba6f7]/30 hover:bg-[#cba6f7]/20'
                      : 'bg-[#f38ba8]/10 text-[#f38ba8] border-[#f38ba8]/30 hover:bg-[#f38ba8]/20'
                  }`}
                >
                  All
                </button>

                {/* Mode dropdown */}
                {showModeDropdown && (
                  <div className="absolute bottom-full left-0 mb-1 z-50 bg-[#1e1e2e] border border-[#45475a] rounded-lg shadow-lg py-1 min-w-[140px]">
                    <button
                      type="button"
                      onClick={() => {
                        setSuggestMode('fill_missing');
                        setShowModeDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#313244] ${
                        suggestMode === 'fill_missing' ? 'text-[#cba6f7]' : 'text-[#cdd6f4]'
                      }`}
                    >
                      <Sparkles size={14} />
                      Fill Missing
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSuggestMode('regenerate');
                        setShowModeDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#313244] ${
                        suggestMode === 'regenerate' ? 'text-[#f38ba8]' : 'text-[#cdd6f4]'
                      }`}
                    >
                      <RefreshCw size={14} />
                      Regenerate
                    </button>
                  </div>
                )}
              </div>

              {/* Field Issues button - only show when editing */}
              {editCard && (
                <button
                  type="button"
                  onClick={handleScanIssues}
                  disabled={isScanning}
                  className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
                    hasScannedIssues === false
                      ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]'
                      : hasScannedIssues === true
                        ? 'bg-[#f9e2af]/10 text-[#f9e2af]'
                        : 'bg-[#89b4fa]/10 text-[#89b4fa] hover:bg-[#89b4fa]/20'
                  } disabled:opacity-50`}
                  title="Scan for field formatting issues"
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
                  {hasScannedIssues === false ? 'Clean' : hasScannedIssues === true ? 'Issues Found' : 'Field Issues'}
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-200 dark:border-[#45475a] rounded hover:bg-gray-50 dark:hover:bg-[#313244] dark:text-[#bac2de]"
              >
                Cancel
              </button>
              {/* Preview button - only for new cards */}
              {!editCard && (
                <button
                  type="button"
                  onClick={handlePreviewClick}
                  disabled={createCard.isPending}
                  className="px-4 py-2 border border-[#89b4fa]/50 text-[#89b4fa] rounded hover:bg-[#89b4fa]/10 disabled:opacity-50"
                >
                  Preview
                </button>
              )}
              <button
                type="submit"
                disabled={createCard.isPending || updateCard.isPending}
                className="px-4 py-2 bg-purple-500 dark:bg-[#cba6f7]/20 text-white dark:text-[#cba6f7] rounded hover:bg-purple-600 dark:hover:bg-[#cba6f7]/30 disabled:opacity-50"
              >
                {editCard ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </form>

        {/* Preview Modal for Field Issues */}
        {previewData && editCard && (
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

        {/* Preview Modal before Create */}
        {showCreatePreview && (
          <NewCardPreviewModal
            form={form}
            sources={sources}
            previewAudioFilename={previewAudioFilename}
            isAlreadySimplified={isAlreadySimplified}
            onConfirm={handleConfirmCreate}
            onBack={() => setShowCreatePreview(false)}
            isCreating={createCard.isPending}
          />
        )}

        {/* Duplicate Card Preview Modal */}
        {previewingDuplicate && (
          <DuplicateCardPreviewModal
            isOpen={true}
            noteId={previewingDuplicate.note_id}
            deckName={previewingDuplicate.deck_name}
            onClose={() => setPreviewingDuplicate(null)}
          />
        )}
      </div>
    </div>
  );
}

// Preview modal for new card creation - styled like CardDetailPanel
interface NewCardPreviewModalProps {
  form: {
    word: string;
    pinyin: string;
    sino: string;
    definition: string;
    tip: string;
    example: string;
    simplified: string;
  };
  sources: Record<string, 'dictionary' | 'ai' | 'local'>;
  previewAudioFilename: string | null;
  isAlreadySimplified: boolean;
  onConfirm: () => Promise<void>;
  onBack: () => void;
  isCreating: boolean;
}

const API_BASE_URL_PREVIEW = import.meta.env.VITE_API_URL || 'http://localhost:3002';

function NewCardPreviewModal({
  form,
  sources,
  previewAudioFilename,
  isAlreadySimplified,
  onConfirm,
  onBack,
  isCreating,
}: NewCardPreviewModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = () => {
    if (!previewAudioFilename) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }

    const audioUrl = `${API_BASE_URL_PREVIEW}/api/audio/play/${encodeURIComponent(previewAudioFilename)}`;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onplay = () => setIsPlaying(true);
    audio.onended = () => {
      setIsPlaying(false);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setIsPlaying(false);
      audioRef.current = null;
    };

    audio.play().catch(() => setIsPlaying(false));
  };

  // Source badge component
  const SourceBadge = ({ source }: { source: 'dictionary' | 'ai' | 'local' }) => (
    <span className={`text-xs px-2 py-0.5 rounded-full ${
      source === 'dictionary' ? 'bg-[#89b4fa]/20 text-[#89b4fa]' :
      source === 'local' ? 'bg-[#a6e3a1]/20 text-[#a6e3a1]' :
      'bg-[#cba6f7]/20 text-[#cba6f7]'
    }`}>
      {source === 'dictionary' ? 'Dict' : source === 'local' ? 'Local' : 'AI'}
    </span>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-gradient-to-b from-[#181825] to-[#11111b] rounded-lg w-full max-w-lg mx-4 shadow-xl border border-[#313244] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#313244] bg-[#181825]/80 backdrop-blur shrink-0">
          <h3 className="font-semibold text-[#cdd6f4]">Preview New Card</h3>
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-[#313244] rounded-full transition-colors"
          >
            <X size={16} className="text-[#a6adc8]" />
          </button>
        </div>

        {/* Content - matches CardDetailPanel layout */}
        <div className="flex-1 overflow-auto p-5 space-y-5">
          {/* Hero section - Word, Pinyin, Sino centered */}
          <div className="text-center pb-4 border-b border-[#313244]">
            <p className="text-4xl text-[#cdd6f4] mb-2">
              {cleanHtml(form.word) || <span className="text-[#6c7086]">[Word]</span>}
            </p>
            <p className="text-lg text-[#94e2d5] font-medium">
              {cleanHtml(form.pinyin) || <span className="text-[#6c7086] text-base">[Pinyin]</span>}
            </p>
            {form.sino && (
              <p className="text-sm text-[#a6adc8] mt-1">
                {cleanHtml(form.sino)}
              </p>
            )}
            {/* Sources for hero fields */}
            <div className="flex items-center justify-center gap-2 mt-2">
              {sources.pinyin && <SourceBadge source={sources.pinyin} />}
              {sources.sino && <SourceBadge source={sources.sino} />}
            </div>
            {/* Play Audio button - green pill style */}
            {previewAudioFilename && (
              <div className="mt-3">
                <button
                  onClick={playAudio}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    isPlaying
                      ? 'bg-[#a6e3a1]/20 text-[#a6e3a1] animate-pulse'
                      : 'bg-[#a6e3a1]/20 text-[#a6e3a1] hover:bg-[#a6e3a1]/30'
                  }`}
                >
                  <Volume2 size={16} />
                  {isPlaying ? 'Playing...' : 'Play Audio'}
                </button>
              </div>
            )}
            {!previewAudioFilename && (
              <div className="mt-3 text-sm text-[#6c7086]">
                No audio generated
              </div>
            )}
          </div>

          {/* Definition - neutral container */}
          {form.definition && (
            <div className="bg-[#313244]/50 rounded-lg p-4 border border-[#45475a]">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
                  Definition
                </label>
                {sources.definition && <SourceBadge source={sources.definition} />}
              </div>
              <div
                className="text-[#cdd6f4] mt-1 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: form.definition }}
              />
            </div>
          )}

          {/* Tip - amber container */}
          {form.tip && (
            <div className="bg-[#f9e2af]/10 rounded-lg p-4 border border-[#f9e2af]/20">
              <label className="text-xs font-semibold text-[#f9e2af] uppercase tracking-wide">
                Tip
              </label>
              <div
                className="text-[#f9e2af]/90 mt-1 text-sm"
                dangerouslySetInnerHTML={{ __html: form.tip }}
              />
            </div>
          )}

          {/* Example - blue container */}
          {form.example && (
            <div className="bg-[#89b4fa]/10 rounded-lg p-4 border border-[#89b4fa]/20">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[#89b4fa] uppercase tracking-wide">
                  Example
                </label>
                {sources.example && <SourceBadge source={sources.example} />}
              </div>
              <div
                className="text-[#89b4fa]/90 mt-1 text-sm"
                dangerouslySetInnerHTML={{ __html: form.example }}
              />
            </div>
          )}

          {/* Simplified - gray container */}
          {(form.simplified || isAlreadySimplified) && (
            <div className="bg-[#313244]/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
                  Simplified
                </label>
                {sources.simplified && <SourceBadge source={sources.simplified} />}
              </div>
              {form.simplified ? (
                <p className="text-[#cdd6f4] mt-1">{cleanHtml(form.simplified)}</p>
              ) : isAlreadySimplified ? (
                <div className="flex items-center gap-1.5 mt-1 text-sm text-[#a6e3a1]">
                  <CheckCircle size={14} />
                  Already simplified
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Actions - consistent button sizing (py-2) */}
        <div className="p-4 border-t border-[#313244] bg-[#181825] flex gap-3 shrink-0">
          <button
            onClick={onBack}
            disabled={isCreating}
            className="flex-1 px-4 py-2 bg-[#313244] text-[#cdd6f4] rounded-lg text-sm font-medium hover:bg-[#45475a] disabled:opacity-50 transition-colors"
          >
            Back to Edit
          </button>
          <button
            onClick={onConfirm}
            disabled={isCreating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#a6e3a1]/20 text-[#a6e3a1] rounded-lg text-sm font-medium hover:bg-[#a6e3a1]/30 disabled:opacity-50 transition-colors"
          >
            {isCreating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle size={16} />
            )}
            Create Card
          </button>
        </div>
      </div>
    </div>
  );
}
