import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  applySuggestion,
  type PinyinCheckResponse,
  type PinyinIssue,
} from '../api/ai';
import {
  X,
  Check,
  Pencil,
  SkipForward,
  Loader2,
  CheckCircle,
  ArrowRight,
  AlertCircle,
  Book,
  Bot,
  ExternalLink,
  Square,
  Play,
  DollarSign,
  Sparkles,
} from 'lucide-react';
import { useToast } from './Toast';

interface Props {
  results: PinyinCheckResponse | null;
  onClose: () => void;
  onIssueFixed: (noteId: number) => void;
  isLoading?: boolean;
  streamProgress?: { batch: number; total: number; cardsProcessed: number } | null;
  onStop?: () => void;
  onStartCheck?: () => void;  // Called when user confirms to start
  isInitialState?: boolean;   // Show confirm-first UI
  estimatedCost?: number;     // Estimated cost for the check
}

export function AIResultsModal({ results, onClose, onIssueFixed, isLoading, streamProgress, onStop, onStartCheck, isInitialState, estimatedCost = 0.01 }: Props) {
  const { showError } = useToast();
  const [editingIssue, setEditingIssue] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [skippedIds, setSkippedIds] = useState<Set<number>>(new Set());
  // Track selected pinyin for each issue (defaults to AI suggestion)
  const [selectedValues, setSelectedValues] = useState<Record<number, string>>({});

  // Get the selected value for an issue, defaulting to AI suggestion
  const getSelectedValue = (issue: PinyinIssue) => {
    return selectedValues[issue.note_id] ?? issue.suggested_pinyin;
  };

  const handleSelectValue = (noteId: number, value: string) => {
    setSelectedValues(prev => ({ ...prev, [noteId]: value }));
  };

  const applyFix = useMutation({
    mutationFn: ({ issue, value }: { issue: PinyinIssue; value: string }) =>
      applySuggestion(issue.note_id, issue.field_name, value),
    onSuccess: (_, { issue }) => {
      onIssueFixed(issue.note_id);
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Apply fix failed'),
  });

  const applyCustomFix = useMutation({
    mutationFn: ({ issue, value }: { issue: PinyinIssue; value: string }) =>
      applySuggestion(issue.note_id, issue.field_name, value),
    onSuccess: (_, { issue }) => {
      onIssueFixed(issue.note_id);
      setEditingIssue(null);
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Apply custom fix failed'),
  });

  const handleEdit = (issue: PinyinIssue) => {
    setEditingIssue(issue.note_id);
    setEditValue(getSelectedValue(issue));
  };

  const handleSkip = (noteId: number) => {
    setSkippedIds(new Set([...skippedIds, noteId]));
  };

  const handleApplyAll = async () => {
    const issuesToFix = (results?.issues ?? []).filter(
      (i) => !skippedIds.has(i.note_id)
    );
    for (const issue of issuesToFix) {
      const value = getSelectedValue(issue);
      await applySuggestion(issue.note_id, issue.field_name, value);
      onIssueFixed(issue.note_id);
    }
  };

  const visibleIssues = results?.issues.filter(
    (i) => !skippedIds.has(i.note_id)
  ) || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold dark:text-white flex items-center gap-2">
            <CheckCircle size={20} className="text-purple-500" />
            Pinyin Check Results
          </h2>
          <div className="flex items-center gap-2">
            {isLoading && onStop && (
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-500 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
              >
                <Square size={14} />
                Stop
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <X size={20} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Summary - only show if results exist */}
        {results && !isInitialState && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-600 dark:text-gray-300">
                Checked: <strong>{results.total_checked}</strong> cards
              </span>
              <span className="text-gray-600 dark:text-gray-300">
                Issues: <strong className="text-orange-500">{results.issues_found}</strong>
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                Cost: ${results.estimated_cost.toFixed(3)}
              </span>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {results?.error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
            <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-red-700 dark:text-red-300">API Error</div>
              <div className="text-sm text-red-600 dark:text-red-400">{results.error}</div>
            </div>
          </div>
        )}

        {/* Streaming Progress */}
        {isLoading && streamProgress && (
          <div className="mx-4 mt-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 size={16} className="animate-spin text-purple-500" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                Checking pinyin...
              </span>
            </div>
            <div className="w-full bg-purple-200 dark:bg-purple-800 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${streamProgress.total > 0 ? (streamProgress.batch / streamProgress.total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-purple-600 dark:text-purple-400">
              <span>Batch {streamProgress.batch} of {streamProgress.total}</span>
              <span>{streamProgress.cardsProcessed} cards processed</span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Initial state - confirm cost before starting */}
          {isInitialState ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
              <Sparkles size={40} className="text-purple-500 mb-4" />
              <p className="text-lg text-gray-800 dark:text-white mb-2">Verify Pinyin Accuracy</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-center max-w-sm">
                AI will check all cards in this deck for pinyin errors including wrong tones, missing tone marks, and syllable spacing.
              </p>

              {/* Cost estimate */}
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg mb-6">
                <DollarSign size={14} />
                <span>Estimated cost: ${estimatedCost.toFixed(4)}</span>
              </div>

              <button
                onClick={onStartCheck}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-500 dark:bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-600 dark:hover:bg-purple-700 transition-colors"
              >
                <Play size={20} />
                Start Verification
              </button>
            </div>
          ) : isLoading && visibleIssues.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Loader2 size={48} className="mx-auto mb-3 text-purple-500 animate-spin" />
              <p className="text-lg font-medium text-purple-600 dark:text-purple-400">
                Checking pinyin...
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Issues will appear here as they are found
              </p>
            </div>
          ) : visibleIssues.length === 0 && !results?.error && !isLoading ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <CheckCircle size={48} className="mx-auto mb-3 text-green-500" />
              <p className="text-lg font-medium text-green-600 dark:text-green-400">
                All issues resolved!
              </p>
            </div>
          ) : visibleIssues.length === 0 && results?.error ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <AlertCircle size={48} className="mx-auto mb-3 text-red-500" />
              <p className="text-lg font-medium text-red-600 dark:text-red-400">
                Check failed - see error above
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleIssues.map((issue) => (
                <IssueCard
                  key={issue.note_id}
                  issue={issue}
                  isEditing={editingIssue === issue.note_id}
                  editValue={editValue}
                  selectedValue={getSelectedValue(issue)}
                  onSelectValue={(value) => handleSelectValue(issue.note_id, value)}
                  onEditValueChange={setEditValue}
                  onAccept={() => applyFix.mutate({ issue, value: getSelectedValue(issue) })}
                  onEdit={() => handleEdit(issue)}
                  onSaveEdit={() =>
                    applyCustomFix.mutate({ issue, value: editValue })
                  }
                  onCancelEdit={() => setEditingIssue(null)}
                  onSkip={() => handleSkip(issue.note_id)}
                  isApplying={
                    applyFix.isPending && applyFix.variables?.issue.note_id === issue.note_id
                  }
                  isSavingEdit={
                    applyCustomFix.isPending &&
                    applyCustomFix.variables?.issue.note_id === issue.note_id
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {visibleIssues.length > 0 && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              Close
            </button>
            <button
              onClick={handleApplyAll}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 flex items-center gap-2"
            >
              <Check size={16} />
              Accept All ({visibleIssues.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface IssueCardProps {
  issue: PinyinIssue;
  isEditing: boolean;
  editValue: string;
  selectedValue: string;
  onSelectValue: (value: string) => void;
  onEditValueChange: (value: string) => void;
  onAccept: () => void;
  onEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onSkip: () => void;
  isApplying: boolean;
  isSavingEdit: boolean;
}

function IssueCard({
  issue,
  isEditing,
  editValue,
  selectedValue,
  onSelectValue,
  onEditValueChange,
  onAccept,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onSkip,
  isApplying,
  isSavingEdit,
}: IssueCardProps) {
  // Build dropdown options: AI suggestion + dictionary readings
  const dropdownOptions: { value: string; label: string; source: 'ai' | 'dict' }[] = [
    { value: issue.suggested_pinyin, label: issue.suggested_pinyin, source: 'ai' },
  ];

  // Add dictionary readings that are different from AI suggestion
  if (issue.all_valid_readings?.length > 0) {
    for (const reading of issue.all_valid_readings) {
      if (reading !== issue.suggested_pinyin && !dropdownOptions.some(o => o.value === reading)) {
        dropdownOptions.push({ value: reading, label: reading, source: 'dict' });
      }
    }
  }
  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800">
      {/* Word header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-medium dark:text-white">{issue.word}</span>
          {issue.is_polyphonic && (
            <span className="text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded">
              多音字
            </span>
          )}
          <span
            className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
            title={`${Math.round(issue.confidence * 100)}% confidence`}
          >
            {Math.round(issue.confidence * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <button
                onClick={onCancelEdit}
                className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Cancel"
              >
                <X size={16} />
              </button>
              <button
                onClick={onSaveEdit}
                disabled={isSavingEdit}
                className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded disabled:opacity-50"
                title="Save"
              >
                {isSavingEdit ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onSkip}
                className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Skip"
              >
                <SkipForward size={16} />
              </button>
              <button
                onClick={onEdit}
                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                title="Edit"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={onAccept}
                disabled={isApplying}
                className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded disabled:opacity-50"
                title="Accept"
              >
                {isApplying ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dictionary + AI info - always show AI, conditionally show Dictionary */}
      <div className={`grid ${issue.zdic_entry || issue.all_valid_readings?.length > 0 ? 'grid-cols-2' : 'grid-cols-1'} gap-3 mb-3`}>
        {/* Dictionary section - only show if data available */}
        {(issue.zdic_entry || issue.all_valid_readings?.length > 0) && (
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm">
            <div className="flex items-center gap-1 text-blue-700 dark:text-blue-300 font-medium mb-1">
              <Book size={12} />
              <span>Dictionary (zdic.net)</span>
            </div>
            {issue.zdic_entry ? (
              <>
                <div className="text-gray-600 dark:text-gray-400 text-xs mb-1">
                  Valid: {issue.all_valid_readings?.join(' / ')}
                </div>
                {issue.zdic_entry.readings.slice(0, 2).map((r, idx) => (
                  <div key={idx} className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    <span className="font-mono">{r.pinyin}</span>
                    {r.meaning && <span className="ml-1 opacity-75">- {r.meaning}</span>}
                  </div>
                ))}
                <a
                  href={issue.zdic_entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
                >
                  View on zdic.net <ExternalLink size={10} />
                </a>
              </>
            ) : (
              <div className="text-xs text-gray-400">Not found in dictionary</div>
            )}
          </div>
        )}

        {/* AI section - always show */}
        <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-sm">
          <div className="flex items-center gap-1 text-purple-700 dark:text-purple-300 font-medium mb-1">
            <Bot size={12} />
            <span>AI Suggestion</span>
          </div>
          <div className="text-gray-600 dark:text-gray-400 text-xs mb-1">
            Suggests: <span className="font-mono font-medium">{issue.suggested_pinyin}</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Confidence: {Math.round(issue.confidence * 100)}%
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {issue.reason}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-3 text-center">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Preview</div>
        <div className="text-2xl font-medium dark:text-white">{issue.word}</div>
        <div className="font-mono text-lg text-purple-600 dark:text-purple-400">
          {isEditing ? editValue : selectedValue}
        </div>
      </div>

      {/* Before/After comparison */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mb-3">
        <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          <div className="text-xs text-red-600 dark:text-red-400 mb-1">Current</div>
          <div className="font-mono text-sm dark:text-gray-200">{issue.current_pinyin}</div>
        </div>
        <ArrowRight size={20} className="text-gray-400" />
        <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
          <div className="text-xs text-green-600 dark:text-green-400 mb-1">Apply</div>
          {isEditing ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              className="w-full font-mono text-sm bg-white dark:bg-gray-700 border border-green-300 dark:border-green-600 rounded px-2 py-1 dark:text-gray-200"
              autoFocus
            />
          ) : dropdownOptions.length > 1 ? (
            <select
              value={selectedValue}
              onChange={(e) => onSelectValue(e.target.value)}
              className="w-full font-mono text-sm bg-white dark:bg-gray-700 border border-green-300 dark:border-green-600 rounded px-2 py-1 dark:text-gray-200 cursor-pointer"
            >
              {dropdownOptions.map((opt, idx) => (
                <option key={idx} value={opt.value}>
                  {opt.label} ({opt.source === 'ai' ? 'AI' : 'Dict'})
                </option>
              ))}
            </select>
          ) : (
            <div className="font-mono text-sm dark:text-gray-200">{selectedValue}</div>
          )}
        </div>
      </div>

    </div>
  );
}
