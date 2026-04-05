import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  scanDeckFields,
  fixDeckFields,
  fixCardFields,
  previewCardFix,
  getIssueTypeLabel,
  type ScanResult,
  type CardIssue,
  type PreviewResult,
} from '../api/fields';
import {
  Search,
  Wrench,
  Loader2,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Eye,
  X,
  ArrowRight,
} from 'lucide-react';
import { useToast } from './Toast';

interface Props {
  deckId: number;
}

export function FieldScanPanel({ deckId }: Props) {
  const { showError } = useToast();
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [previewingNoteId, setPreviewingNoteId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  // Reset state when deck changes
  useEffect(() => {
    setScanResult(null);
    setExpandedCards(new Set());
    setPreviewData(null);
  }, [deckId]);

  const scan = useMutation({
    mutationFn: () => deckId ? scanDeckFields(deckId) : Promise.reject('No deck'),
    onSuccess: (result) => {
      setScanResult(result);
      // Auto-expand all if few issues
      if (result.cards_with_issues <= 5) {
        setExpandedCards(new Set(result.issues.map(c => c.note_id)));
      }
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Scan failed'),
  });

  const fixAll = useMutation({
    mutationFn: () => fixDeckFields(deckId),
    onSuccess: () => {
      setScanResult(null);
      queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Fix all failed'),
  });

  const fixCard = useMutation({
    mutationFn: (noteId: number) => fixCardFields(noteId),
    onSuccess: (_, noteId) => {
      // Remove fixed card from results
      if (scanResult) {
        const newIssues = scanResult.issues.filter(c => c.note_id !== noteId);
        setScanResult({
          ...scanResult,
          cards_with_issues: newIssues.length,
          issues: newIssues,
        });
      }
      setPreviewData(null);
      queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Fix card failed'),
  });

  const preview = useMutation({
    mutationFn: (noteId: number) => previewCardFix(noteId),
    onMutate: (noteId) => {
      setPreviewingNoteId(noteId);
    },
    onSuccess: (result) => {
      setPreviewData(result);
    },
    onSettled: () => {
      setPreviewingNoteId(null);
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Preview failed'),
  });

  const toggleExpand = (noteId: number) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(noteId)) {
      newExpanded.delete(noteId);
    } else {
      newExpanded.add(noteId);
    }
    setExpandedCards(newExpanded);
  };

  const closePreview = () => {
    setPreviewData(null);
  };

  const isScanning = scan.isPending;
  const isFixingAll = fixAll.isPending;

  return (
    <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium flex items-center gap-2 dark:text-white">
          <Search size={16} />
          Field Quality Check
        </h3>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => scan.mutate()}
          disabled={!deckId || isScanning || isFixingAll}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
        >
          {isScanning ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Search size={14} />
          )}
          Scan Fields
        </button>

        {scanResult && scanResult.cards_with_issues > 0 && (
          <button
            onClick={() => fixAll.mutate()}
            disabled={isFixingAll}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 disabled:opacity-50"
          >
            {isFixingAll ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Wrench size={14} />
            )}
            Fix All ({scanResult.cards_with_issues})
          </button>
        )}
      </div>

      {scanResult && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-sm">
            <div className="flex items-center gap-4">
              <span className="dark:text-gray-200">
                Scanned: {scanResult.total_cards} cards
              </span>
              {scanResult.cards_with_issues > 0 ? (
                <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                  <AlertTriangle size={14} />
                  {scanResult.cards_with_issues} with issues
                </span>
              ) : (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle size={14} />
                  No issues found
                </span>
              )}
            </div>
          </div>

          {/* Issues List */}
          {scanResult.issues.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-600 rounded max-h-64 overflow-auto">
              {scanResult.issues.map((card) => (
                <CardIssueRow
                  key={card.note_id}
                  card={card}
                  isExpanded={expandedCards.has(card.note_id)}
                  onToggle={() => toggleExpand(card.note_id)}
                  onPreview={() => preview.mutate(card.note_id)}
                  onFix={() => fixCard.mutate(card.note_id)}
                  isFixing={fixCard.isPending && fixCard.variables === card.note_id}
                  isPreviewing={previewingNoteId === card.note_id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {previewData && (
        <PreviewModal
          data={previewData}
          onClose={closePreview}
          onFix={() => fixCard.mutate(previewData.note_id)}
          isFixing={fixCard.isPending}
        />
      )}
    </div>
  );
}

interface CardIssueRowProps {
  card: CardIssue;
  isExpanded: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onFix: () => void;
  isFixing: boolean;
  isPreviewing: boolean;
}

function CardIssueRow({ card, isExpanded, onToggle, onPreview, onFix, isFixing, isPreviewing }: CardIssueRowProps) {
  // Group issues by field
  const issuesByField = card.issues.reduce((acc, issue) => {
    if (!acc[issue.field_name]) {
      acc[issue.field_name] = [];
    }
    acc[issue.field_name].push(issue);
    return acc;
  }, {} as Record<string, typeof card.issues>);

  return (
    <div className="border-b border-gray-200 dark:border-gray-600 last:border-b-0">
      <div
        className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
        onClick={onToggle}
      >
        {isExpanded ? (
          <ChevronDown size={14} className="dark:text-gray-400" />
        ) : (
          <ChevronRight size={14} className="dark:text-gray-400" />
        )}
        <span className="font-medium dark:text-white">{card.word}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">{card.pinyin}</span>
        <span className="ml-auto text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
          {card.issues.length} issue{card.issues.length > 1 ? 's' : ''}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          disabled={isPreviewing}
          className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 flex items-center gap-1"
          title="Preview changes"
        >
          {isPreviewing ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
          Preview
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFix();
          }}
          disabled={isFixing}
          className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isFixing ? <Loader2 size={12} className="animate-spin" /> : 'Fix'}
        </button>
      </div>

      {isExpanded && (
        <div className="px-4 pb-3 bg-gray-50 dark:bg-gray-700/50">
          {Object.entries(issuesByField).map(([fieldName, issues]) => (
            <div key={fieldName} className="mt-2">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {fieldName}
              </div>
              {issues.map((issue, idx) => (
                <div
                  key={idx}
                  className="text-xs flex items-center gap-2 py-1 text-gray-700 dark:text-gray-300"
                >
                  <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded">
                    {getIssueTypeLabel(issue.issue_type)}
                  </span>
                  <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">
                    {issue.original}
                  </code>
                  <span className="text-gray-400 truncate" title={issue.context}>
                    in: {issue.context}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface PreviewModalProps {
  data: PreviewResult;
  onClose: () => void;
  onFix: () => void;
  isFixing: boolean;
}

function PreviewModal({ data, onClose, onFix, isFixing }: PreviewModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-medium dark:text-white flex items-center gap-2">
            <Eye size={18} />
            Preview: {data.word}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X size={20} className="dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {data.changes.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              No changes needed
            </div>
          ) : (
            data.changes.map((change, idx) => (
              <div key={idx} className="space-y-2">
                <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  {change.field}
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                  {/* Original */}
                  <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded">
                    <div className="text-xs text-red-600 dark:text-red-400 mb-1">Original</div>
                    <div className="text-sm dark:text-gray-200 break-all font-mono">
                      {change.original || <span className="text-gray-400">[Empty]</span>}
                    </div>
                  </div>

                  {/* Arrow */}
                  <ArrowRight size={20} className="text-gray-400" />

                  {/* Cleaned */}
                  <div className="p-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded">
                    <div className="text-xs text-green-600 dark:text-green-400 mb-1">After Fix</div>
                    <div className="text-sm dark:text-gray-200 break-all font-mono">
                      {change.cleaned || <span className="text-gray-400">[Empty]</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
          >
            Cancel
          </button>
          {data.changes.length > 0 && (
            <button
              onClick={onFix}
              disabled={isFixing}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
            >
              {isFixing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Wrench size={16} />
              )}
              Apply Fix
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
