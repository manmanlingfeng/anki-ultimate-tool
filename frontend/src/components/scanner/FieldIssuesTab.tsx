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
} from '../../api/fields';
import type { ScanMode } from '../../api/ai';
import {
  Loader2,
  AlertTriangle,
  CheckCircle,
  Wrench,
  Search,
  ChevronDown,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { useToast } from '../Toast';
import { CardPreviewModal } from '../CardPreviewModal';

interface Props {
  scanMode: ScanMode;
  selectedDeckId: number | null;
  onScanComplete?: (result: GlobalScanResult) => void;
}

export function FieldIssuesTab({ scanMode, selectedDeckId, onScanComplete }: Props) {
  const { showError } = useToast();
  const [scanResult, setScanResult] = useState<GlobalScanResult | null>(null);
  const [expandedDecks, setExpandedDecks] = useState<Set<number>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [previewingNoteId, setPreviewingNoteId] = useState<number | null>(null);
  const [previewWord, setPreviewWord] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: () => scanAllDecks(selectedDeckId || undefined, scanMode),
    onSuccess: (result) => {
      setScanResult(result);
      setError(null);
      onScanComplete?.(result);
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
    mutationFn: () => fixAllDecks(selectedDeckId || undefined, scanMode),
    onSuccess: () => scan.mutate(),
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Fix failed';
      setError(msg);
      showError(msg);
    },
  });

  const fixDeck = useMutation({
    mutationFn: (deckId: number) => fixDeckFields(deckId),
    onSuccess: (_, deckId) => {
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
    mutationFn: ({ noteId }: { noteId: number; word: string }) => previewCardFix(noteId),
    onMutate: ({ noteId, word }) => {
      setPreviewingNoteId(noteId);
      setPreviewWord(word);
    },
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

  const isScanning = scan.isPending;
  const isFixingAll = fixAll.isPending;

  return (
    <div className="space-y-4">
      {/* Scan button if no results */}
      {!scanResult && !isScanning && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Scan{scanMode === 'all' ? ' all decks' : ' selected decks'} for field formatting issues (HTML tags, extra spaces, etc.)
          </p>
          <button
            onClick={() => scan.mutate()}
            disabled={scanMode !== 'all' && !selectedDeckId}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
          >
            <Search size={18} />
            {scanMode === 'all' ? 'Scan Field Issues' : 'Scan Selected Decks'}
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
        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
          {error}
        </div>
      )}

      {/* Results */}
      {scanResult && !isScanning && (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Decks" value={scanResult.total_decks} />
            <SummaryCard label="Cards" value={scanResult.total_cards} />
            <SummaryCard
              label="Field Issues"
              value={scanResult.cards_with_issues}
              variant={scanResult.cards_with_issues > 0 ? 'warning' : 'success'}
            />
          </div>

          {/* All good message */}
          {scanResult.cards_with_issues === 0 && (
            <div className="text-center py-8 text-green-600 dark:text-green-400">
              <CheckCircle size={48} className="mx-auto mb-3" />
              <p className="text-lg font-medium">No field issues found!</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                All field formatting is correct.
              </p>
            </div>
          )}

          {/* Deck list with issues */}
          {scanResult.cards_with_issues > 0 && (
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
              {scanResult.decks
                .filter(deck => deck.cards_with_issues.length > 0)
                .map((deck) => (
                  <DeckSection
                    key={deck.deck_id}
                    deck={deck}
                    isExpanded={expandedDecks.has(deck.deck_id)}
                    onToggle={() => toggleDeck(deck.deck_id)}
                    expandedCards={expandedCards}
                    onToggleCard={toggleCard}
                    onPreview={(noteId, word) => preview.mutate({ noteId, word })}
                    onFix={(noteId) => fixCard.mutate(noteId)}
                    onFixDeck={() => fixDeck.mutate(deck.deck_id)}
                    previewingNoteId={previewingNoteId}
                    fixingNoteId={fixCard.isPending ? fixCard.variables : null}
                    isFixingDeck={fixDeck.isPending && fixDeck.variables === deck.deck_id}
                  />
                ))}
            </div>
          )}

          {/* Footer with fix all and re-scan */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => scan.mutate()}
              disabled={isScanning}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
            >
              <Search size={14} />
              Re-scan
            </button>
            {scanResult.cards_with_issues > 0 && (
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
            )}
          </div>
        </>
      )}

      {/* Preview Modal */}
      {previewData && (
        <CardPreviewModal
          isOpen={true}
          noteId={previewData.note_id}
          word={previewWord || previewData.word}
          changes={previewData.changes.map((c) => ({
            fieldName: c.field,
            beforeValue: c.original,
            afterValue: c.cleaned,
          }))}
          onClose={() => setPreviewData(null)}
          onApply={async () => {
            await fixCard.mutateAsync(previewData.note_id);
          }}
          onSkip={() => setPreviewData(null)}
          isApplying={fixCard.isPending}
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
  onPreview: (noteId: number, word: string) => void;
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
  const shortName = deck.deck_name.split('::').slice(-2).join(' > ');
  const issueCount = deck.cards_with_issues.length;

  return (
    <div className="border-b border-gray-200 dark:border-gray-600 last:border-b-0">
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
        <span className="flex items-center gap-1 text-sm text-orange-600 dark:text-orange-400">
          <AlertTriangle size={14} />
          {issueCount} issue{issueCount > 1 ? 's' : ''}
        </span>
        <button
          onClick={onFixDeck}
          disabled={isFixingDeck}
          className="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1"
        >
          {isFixingDeck ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
          Fix Deck
        </button>
      </div>

      {isExpanded && issueCount > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700/50 px-4 pb-3">
          {deck.cards_with_issues.map((card) => (
            <CardIssueRow
              key={card.note_id}
              card={card}
              isExpanded={expandedCards.has(card.note_id)}
              onToggle={() => onToggleCard(card.note_id)}
              onPreview={(word) => onPreview(card.note_id, word)}
              onFix={() => onFix(card.note_id)}
              isPreviewing={previewingNoteId === card.note_id}
              isFixing={fixingNoteId === card.note_id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardIssueRowProps {
  card: CardIssue;
  isExpanded: boolean;
  onToggle: () => void;
  onPreview: (word: string) => void;
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
          onClick={(e) => { e.stopPropagation(); onPreview(card.word); }}
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

