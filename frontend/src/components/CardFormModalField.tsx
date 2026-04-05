import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { RichTextEditor } from './editor';
import { FieldSuggestionButton } from './field-suggestion/FieldSuggestionButton';
import { SourceBadge } from './field-suggestion/SourceBadge';
import { FieldPreviewModal } from './field-suggestion/FieldPreviewModal';
import { useFieldSuggestion } from '../hooks/useFieldSuggestion';
import { cleanHtml, capitalizeFirst } from '../utils/html';
import type { FieldType } from '../api/fields';

interface CardFormModalFieldProps {
  label: string;
  fieldType: FieldType;
  value: string;
  onChange: (value: string) => void;
  source?: 'dictionary' | 'ai' | 'local';
  onSourceChange?: (source: 'dictionary' | 'ai' | 'local') => void;
  noteId?: number;
  word: string;
  pinyin?: string;
  definition?: string;
  required?: boolean;
  minHeight?: string;
  singleLine?: boolean;
  /** For simplified field: true if word is already simplified */
  alreadySimplified?: boolean;
}

export function CardFormModalField({
  label,
  fieldType,
  value,
  onChange,
  source,
  onSourceChange,
  noteId = 0,
  word,
  pinyin,
  definition,
  required = false,
  minHeight = '40px',
  singleLine = false,
  alreadySimplified = false,
}: CardFormModalFieldProps) {
  const [showPreview, setShowPreview] = useState(false);

  // Clean HTML from values before passing to API
  const cleanedWord = cleanHtml(word);
  const cleanedPinyin = pinyin ? cleanHtml(pinyin) : undefined;
  const cleanedDefinition = definition ? cleanHtml(definition) : undefined;

  const suggestion = useFieldSuggestion({
    noteId,
    fieldType,
    word: cleanedWord,
    pinyin: cleanedPinyin,
    definition: cleanedDefinition,
  });

  const handleSuggestClick = () => {
    setShowPreview(true);
    suggestion.generate();
  };

  const handleApply = async () => {
    if (suggestion.html || suggestion.suggestion) {
      const rawValue = suggestion.html || suggestion.suggestion || '';
      // Capitalize first letter except for pinyin
      onChange(fieldType === 'pinyin' ? rawValue : capitalizeFirst(rawValue));
      if (suggestion.source && onSourceChange) {
        onSourceChange(suggestion.source);
      }
    }
  };

  const isDisabled = !cleanedWord.trim();

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium dark:text-[#bac2de]">
            {label} {required && '*'}
          </label>
          <FieldSuggestionButton
            fieldType={fieldType}
            onClick={handleSuggestClick}
            disabled={isDisabled}
            isLoading={suggestion.isLoading}
            variant="text"
            size="sm"
          />
        </div>
        {source && <SourceBadge source={source} />}
      </div>

      <RichTextEditor
        value={value}
        onChange={onChange}
        singleLine={singleLine}
        minHeight={minHeight}
      />

      {/* Already simplified feedback */}
      {fieldType === 'simplified' && alreadySimplified && (
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-[#a6e3a1]">
          <CheckCircle size={12} />
          <span>Already simplified</span>
        </div>
      )}

      <FieldPreviewModal
        isOpen={showPreview}
        onClose={() => {
          setShowPreview(false);
          suggestion.reset();
        }}
        fieldType={fieldType}
        word={word}
        pinyin={pinyin}
        currentValue={value}
        suggestion={suggestion.suggestion}
        source={suggestion.source}
        confidence={suggestion.confidence}
        alternatives={suggestion.alternatives}
        estimatedCost={suggestion.estimatedCost}
        isLoading={suggestion.isLoading}
        error={suggestion.error}
        onGenerate={suggestion.generate}
        onApply={handleApply}
      />
    </div>
  );
}
