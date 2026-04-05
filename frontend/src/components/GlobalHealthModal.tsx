import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  scanAllDecks,
  fixAllDecks,
  fixDeckFields,
  fixCardFields,
  previewCardFix,
  getIssueTypeLabel,
  type GlobalScanResult,
  type DeckHealthDetail,
  type CardIssue,
  type PreviewResult,
} from '../api/fields';
import {
  X,
  Loader2,
  AlertTriangle,
  CheckCircle,
  VolumeX,
  Wrench,
  Search,
  ChevronDown,
  ChevronRight,
  Eye,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { useToast } from './Toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalHealthModal({ isOpen, onClose }: Props) {
  const { showError } = useToast();
  const [scanResult, setScanResult] = useState<GlobalScanResult | null>(null);
  const [expandedDecks, setExpandedDecks] = useState<Set<number>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [previewingNoteId, setPreviewingNoteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: () => scanAllDecks(),
    onSuccess: (result) => {
      setScanResult(result);
      setError(null);
      // Auto-expand first deck with issues
      if (result.decks.length > 0 && result.decks[0].cards_with_issues.length > 0) {
        setExpandedDecks(new Set([result.decks[0].deck_id]));
      }
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      setError(msg);
      showError(msg);
    },
  });

  const fixAll = useMutation({
    mutationFn: () => fixAllDecks(),
    onSuccess: () => {
      scan.mutate();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Fix failed';
      setError(msg);
      showError(msg);
    },
  });

  const fixDeck = useMutation({
    mutationFn: (deckId: number) => fixDeckFields(deckId),
    onSuccess: (_, deckId) => {
      // Remove all cards with issues from this deck
      if (scanResult) {
        const newDecks = scanResult.decks.map(deck => {
          if (deck.deck_id === deckId) {
            return { ...deck, cards_with_issues: [] };
          }
          return deck;
        }).filter(deck => deck.cards_with_issues.length > 0 || deck.cards_without_audio > 0);

        const totalIssues = newDecks.reduce((sum, d) => sum + d.cards_with_issues.length, 0);

        setScanResult({
          ...scanResult,
          cards_with_issues: totalIssues,
          decks: newDecks,
        });
      }
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Fix deck failed';
      setError(msg);
      showError(msg);
    },
  });

  const fixCard = useMutation({
    mutationFn: (noteId: number) => fixCardFields(noteId),
    onSuccess: (_, noteId) => {
      // Remove fixed card from results
      if (scanResult) {
        const newDecks = scanResult.decks.map(deck => ({
          ...deck,
          cards_with_issues: deck.cards_with_issues.filter(c => c.note_id !== noteId)
        })).filter(deck => deck.cards_with_issues.length > 0 || deck.cards_without_audio > 0);

        const totalIssues = newDecks.reduce((sum, d) => sum + d.cards_with_issues.length, 0);

        setScanResult({
          ...scanResult,
          cards_with_issues: totalIssues,
          decks: newDecks,
        });
      }
      setPreviewData(null);
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Fix card failed'),
  });

  const preview = useMutation({
    mutationFn: (noteId: number) => previewCardFix(noteId),
    onMutate: (noteId) => setPreviewingNoteId(noteId),
    onSuccess: (result) => setPreviewData(result),
    onSettled: () => setPreviewingNoteId(null),
    onError: (err) => showError(err instanceof Error ? err.message : 'Preview failed'),
  });

  const toggleDeck = (deckId: number) => {
    const newExpanded = new Set(expandedDecks);
    if (newExpanded.has(deckId)) {
      newExpanded.delete(deckId);
    } else {
      newExpanded.add(deckId);
    }
    setExpandedDecks(newExpanded);
  };

  const toggleCard = (noteId: number) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(noteId)) {
      newExpanded.delete(noteId);
    } else {
      newExpanded.add(noteId);
    }
    setExpandedCards(newExpanded);
  };

  if (!isOpen) return null;

  const isScanning = scan.isPending;
  const isFixingAll = fixAll.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold dark:text-white flex items-center gap-2">
            <Activity size={20} />
            Deck Health Report
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Scan button if no results */}
          {!scanResult && !isScanning && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Click the button below to scan all decks for field issues and missing audio.
              </p>
              <button
                onClick={() => scan.mutate()}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 mx-auto"
              >
                <Search size={18} />
                Scan All Decks
              </button>
            </div>
          )}

          {/* Loading state */}
          {isScanning && (
            <div className="text-center py-12">
              <Loader2 size={40} className="animate-spin mx-auto text-blue-500 mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Scanning all decks...</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">This may take a while</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded mb-4">
              {error}
            </div>
          )}

          {/* Results */}
          {scanResult && !isScanning && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="grid grid-cols-4 gap-3">
                <SummaryCard label="Decks" value={scanResult.total_decks} />
                <SummaryCard label="Cards" value={scanResult.total_cards} />
                <SummaryCard
                  label="Field Issues"
                  value={scanResult.cards_with_issues}
                  variant={scanResult.cards_with_issues > 0 ? 'warning' : 'success'}
                />
                <SummaryCard
                  label="No Audio"
                  value={scanResult.cards_without_audio}
                  variant={scanResult.cards_without_audio > 0 ? 'error' : 'success'}
                />
              </div>

              {/* All good message */}
              {scanResult.decks.length === 0 && (
                <div className="text-center py-8 text-green-600 dark:text-green-400">
                  <CheckCircle size={48} className="mx-auto mb-3" />
                  <p className="text-lg font-medium">All decks are healthy!</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    No field issues or missing audio found.
                  </p>
                </div>
              )}

              {/* Deck list */}
              {scanResult.decks.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  {scanResult.decks.map((deck) => (
                    <DeckSection
                      key={deck.deck_id}
                      deck={deck}
                      isExpanded={expandedDecks.has(deck.deck_id)}
                      onToggle={() => toggleDeck(deck.deck_id)}
                      expandedCards={expandedCards}
                      onToggleCard={toggleCard}
                      onPreview={(noteId) => preview.mutate(noteId)}
                      onFix={(noteId) => fixCard.mutate(noteId)}
                      onFixDeck={() => fixDeck.mutate(deck.deck_id)}
                      previewingNoteId={previewingNoteId}
                      fixingNoteId={fixCard.isPending ? fixCard.variables : null}
                      isFixingDeck={fixDeck.isPending && fixDeck.variables === deck.deck_id}
                    />
                  ))}
                </div>
              )}

              {/* Re-scan button */}
              <div className="flex justify-center">
                <button
                  onClick={() => scan.mutate()}
                  disabled={isScanning}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                >
                  <Search size={14} />
                  Re-scan
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {scanResult && scanResult.cards_with_issues > 0 && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
            <button
              onClick={() => fixAll.mutate()}
              disabled={isFixingAll}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2"
            >
              {isFixingAll ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Wrench size={16} />
              )}
              Fix All Issues ({scanResult.cards_with_issues})
            </button>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewData && (
        <PreviewModal
          data={previewData}
          onClose={() => setPreviewData(null)}
          onFix={() => fixCard.mutate(previewData.note_id)}
          isFixing={fixCard.isPending}
        />
      )}
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: number;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

function SummaryCard({ label, value, variant = 'default' }: SummaryCardProps) {
  const colorClasses = {
    default: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200',
    success: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    warning: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  };

  return (
    <div className={`p-3 rounded-lg ${colorClasses[variant]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-75">{label}</div>
    </div>
  );
}

interface DeckSectionProps {
  deck: DeckHealthDetail;
  isExpanded: boolean;
  onToggle: () => void;
  expandedCards: Set<number>;
  onToggleCard: (noteId: number) => void;
  onPreview: (noteId: number) => void;
  onFix: (noteId: number) => void;
  onFixDeck: () => void;
  previewingNoteId: number | null;
  fixingNoteId: number | null;
  isFixingDeck: boolean;
}

function DeckSection({
  deck,
  isExpanded,
  onToggle,
  expandedCards,
  onToggleCard,
  onPreview,
  onFix,
  onFixDeck,
  previewingNoteId,
  fixingNoteId,
  isFixingDeck,
}: DeckSectionProps) {
  const shortName = deck.deck_name.split('::').slice(-2).join(' › ');
  const issueCount = deck.cards_with_issues.length;

  return (
    <div className="border-b border-gray-200 dark:border-gray-600 last:border-b-0">
      {/* Deck header */}
      <div className="flex items-center gap-2 p-3 hover:bg-gray-50 dark:hover:bg-gray-700">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 text-left"
        >
          {isExpanded ? (
            <ChevronDown size={16} className="text-gray-400 shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-gray-400 shrink-0" />
          )}
          <span className="flex-1 font-medium dark:text-white">{shortName}</span>
        </button>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {deck.total_cards} cards
        </span>
        {issueCount > 0 && (
          <span className="flex items-center gap-1 text-sm text-orange-600 dark:text-orange-400">
            <AlertTriangle size={14} />
            {issueCount}
          </span>
        )}
        {deck.cards_without_audio > 0 && (
          <span className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <VolumeX size={14} />
            {deck.cards_without_audio}
          </span>
        )}
        {issueCount > 0 && (
          <button
            onClick={onFixDeck}
            disabled={isFixingDeck}
            className="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1"
          >
            {isFixingDeck ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
            Fix Deck
          </button>
        )}
      </div>

      {/* Cards with issues */}
      {isExpanded && issueCount > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700/50 px-4 pb-3">
          {deck.cards_with_issues.map((card) => (
            <CardIssueRow
              key={card.note_id}
              card={card}
              isExpanded={expandedCards.has(card.note_id)}
              onToggle={() => onToggleCard(card.note_id)}
              onPreview={() => onPreview(card.note_id)}
              onFix={() => onFix(card.note_id)}
              isPreviewing={previewingNoteId === card.note_id}
              isFixing={fixingNoteId === card.note_id}
            />
          ))}
        </div>
      )}

      {/* Only audio issues */}
      {isExpanded && issueCount === 0 && deck.cards_without_audio > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
          {deck.cards_without_audio} cards without audio (no field issues)
        </div>
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
  isPreviewing: boolean;
  isFixing: boolean;
}

function CardIssueRow({
  card,
  isExpanded,
  onToggle,
  onPreview,
  onFix,
  isPreviewing,
  isFixing,
}: CardIssueRowProps) {
  const issuesByField = card.issues.reduce((acc, issue) => {
    if (!acc[issue.field_name]) acc[issue.field_name] = [];
    acc[issue.field_name].push(issue);
    return acc;
  }, {} as Record<string, typeof card.issues>);

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded mt-2 bg-white dark:bg-gray-800">
      <div
        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
        onClick={onToggle}
      >
        {isExpanded ? (
          <ChevronDown size={14} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-gray-400 shrink-0" />
        )}
        <span className="font-medium dark:text-white">{card.word}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">{card.pinyin}</span>
        <span className="ml-auto text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
          {card.issues.length} issue{card.issues.length > 1 ? 's' : ''}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onPreview(); }}
          disabled={isPreviewing}
          className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 flex items-center gap-1"
        >
          {isPreviewing ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
          Preview
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onFix(); }}
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-medium dark:text-white flex items-center gap-2">
            <Eye size={18} />
            Preview: {data.word}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

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
                  <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded">
                    <div className="text-xs text-red-600 dark:text-red-400 mb-1">Original</div>
                    <div className="text-sm dark:text-gray-200 break-all font-mono">
                      {change.original || <span className="text-gray-400">[Empty]</span>}
                    </div>
                  </div>
                  <ArrowRight size={20} className="text-gray-400" />
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
              {isFixing ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
              Apply Fix
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
