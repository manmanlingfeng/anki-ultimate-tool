import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { scanAllDecks, type GlobalScanResult } from '../../api/fields';
import type { ScanMode } from '../../api/ai';
import { startBatchGenerate, getBatchStatus } from '../../api/audio';
import type { BatchJobStatus } from '../../types';
import { VoiceSettingsCard } from './VoiceSettingsCard';
import {
  Loader2,
  VolumeX,
  Volume2,
  Search,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Play,
} from 'lucide-react';
import { useToast } from '../Toast';

interface Props {
  scanMode: ScanMode;
  selectedDeckId: number | null;
  initialScanResult?: GlobalScanResult | null;
}

export function MissingAudioTab({ scanMode, selectedDeckId, initialScanResult }: Props) {
  const { showError, showSuccess } = useToast();
  const [scanResult, setScanResult] = useState<GlobalScanResult | null>(initialScanResult ?? null);
  const [expandedDecks, setExpandedDecks] = useState<Set<number>>(new Set());
  const [generatingDeckId, setGeneratingDeckId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<BatchJobStatus | null>(null);

  const scan = useMutation({
    mutationFn: () => scanAllDecks(selectedDeckId || undefined, scanMode),
    onSuccess: (result) => {
      setScanResult(result);
      // Auto-expand first deck with missing audio
      const firstWithAudio = result.decks.find(d => d.cards_without_audio > 0);
      if (firstWithAudio) {
        setExpandedDecks(new Set([firstWithAudio.deck_id]));
      }
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Scan failed'),
  });

  const generateForDeck = useMutation({
    mutationFn: (deckId: number) => startBatchGenerate(deckId, false),
    onMutate: (deckId) => setGeneratingDeckId(deckId),
    onSuccess: (id) => {
      setJobId(id);
      setJobStatus({ status: 'running', progress: 0, total: 0, errors: [] });
    },
    onError: (err) => {
      showError(err instanceof Error ? err.message : 'Generate failed');
      setGeneratingDeckId(null);
    },
  });

  // Generate for all decks sequentially
  const generateAll = useMutation({
    mutationFn: async () => {
      if (!scanResult) return;
      const decksToProcess = scanResult.decks.filter(d => d.cards_without_audio > 0);

      for (const deck of decksToProcess) {
        setGeneratingDeckId(deck.deck_id);
        const jobId = await startBatchGenerate(deck.deck_id, false);

        // Wait for this job to complete
        let status = await getBatchStatus(jobId);
        while (status.status === 'running') {
          setJobStatus(status);
          await new Promise(r => setTimeout(r, 500));
          status = await getBatchStatus(jobId);
        }
        setJobStatus(status);
      }
    },
    onSuccess: () => {
      showSuccess('Generated audio for all decks');
      setGeneratingDeckId(null);
      setJobId(null);
      scan.mutate(); // Refresh results
    },
    onError: (err) => {
      showError(err instanceof Error ? err.message : 'Generate all failed');
      setGeneratingDeckId(null);
    },
  });

  // Poll job status
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const status = await getBatchStatus(jobId);
        setJobStatus(status);

        if (status.status !== 'running') {
          clearInterval(interval);
          if (status.status === 'completed') {
            showSuccess(`Generated audio for ${status.progress} cards`);
            // Refresh scan results
            scan.mutate();
          }
          setJobId(null);
          setGeneratingDeckId(null);
        }
      } catch {
        clearInterval(interval);
        setJobId(null);
        setGeneratingDeckId(null);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [jobId]);

  const toggleDeck = (deckId: number) => {
    const newExpanded = new Set(expandedDecks);
    if (newExpanded.has(deckId)) {
      newExpanded.delete(deckId);
    } else {
      newExpanded.add(deckId);
    }
    setExpandedDecks(newExpanded);
  };

  const totalMissingAudio = scanResult?.cards_without_audio ?? 0;
  const decksWithMissingAudio = scanResult?.decks.filter(d => d.cards_without_audio > 0) ?? [];
  const isScanning = scan.isPending;
  const isGenerating = generatingDeckId !== null || generateAll.isPending;

  return (
    <div className="space-y-4">
      {/* Scan button if no results */}
      {!scanResult && !isScanning && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Scan{scanMode === 'all' ? ' all decks' : ' selected decks'} to find cards without audio files.
          </p>
          <button
            onClick={() => scan.mutate()}
            disabled={scanMode !== 'all' && !selectedDeckId}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
          >
            <Search size={18} />
            {scanMode === 'all' ? 'Scan for Missing Audio' : 'Scan Selected Decks'}
          </button>
        </div>
      )}

      {/* Loading state */}
      {isScanning && (
        <div className="text-center py-12">
          <Loader2 size={40} className="animate-spin mx-auto text-blue-500 mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Scanning all decks...</p>
        </div>
      )}

      {/* Results */}
      {scanResult && !isScanning && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
              <div className="text-2xl font-bold">{scanResult.total_decks}</div>
              <div className="text-sm opacity-75">Decks</div>
            </div>
            <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
              <div className="text-2xl font-bold">{scanResult.total_cards}</div>
              <div className="text-sm opacity-75">Total Cards</div>
            </div>
            <div className={`p-3 rounded-lg ${
              totalMissingAudio > 0
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            }`}>
              <div className="text-2xl font-bold">{totalMissingAudio}</div>
              <div className="text-sm opacity-75">Missing Audio</div>
            </div>
          </div>

          {/* Voice Settings Card */}
          {totalMissingAudio > 0 && (
            <VoiceSettingsCard />
          )}

          {/* All good message */}
          {totalMissingAudio === 0 && (
            <div className="text-center py-8 text-green-600 dark:text-green-400">
              <CheckCircle size={48} className="mx-auto mb-3" />
              <p className="text-lg font-medium">All cards have audio!</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                No missing audio files found.
              </p>
            </div>
          )}

          {/* Generation Progress */}
          {jobStatus && jobStatus.status === 'running' && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-blue-700 dark:text-blue-300 font-medium">
                  Generating audio...
                </span>
                <span className="text-blue-600 dark:text-blue-400">
                  {jobStatus.progress} / {jobStatus.total}
                </span>
              </div>
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${jobStatus.total > 0 ? (jobStatus.progress / jobStatus.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Decks with missing audio */}
          {decksWithMissingAudio.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
              {decksWithMissingAudio.map((deck) => {
                const shortName = deck.deck_name.split('::').slice(-2).join(' > ');
                const isExpanded = expandedDecks.has(deck.deck_id);
                const isThisDeckGenerating = generatingDeckId === deck.deck_id;

                return (
                  <div key={deck.deck_id} className="border-b border-gray-200 dark:border-gray-600 last:border-b-0">
                    <div className="flex items-center gap-2 p-3 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <button
                        onClick={() => toggleDeck(deck.deck_id)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown size={16} className="text-gray-400 shrink-0" />
                        ) : (
                          <ChevronRight size={16} className="text-gray-400 shrink-0" />
                        )}
                        <span className="flex-1 font-medium dark:text-white">{shortName}</span>
                      </button>
                      <span className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                        <VolumeX size={14} />
                        {deck.cards_without_audio} missing
                      </span>
                      <button
                        onClick={() => generateForDeck.mutate(deck.deck_id)}
                        disabled={isGenerating}
                        className="px-3 py-1.5 text-xs bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 flex items-center gap-1"
                      >
                        {isThisDeckGenerating ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Play size={12} />
                        )}
                        Generate
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-3">
                        <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                          <Volume2 size={14} className="text-green-500" />
                          {deck.total_cards - deck.cards_without_audio} cards with audio
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-1">
                          <VolumeX size={14} className="text-red-500" />
                          {deck.cards_without_audio} cards without audio
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer with generate all and re-scan */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => scan.mutate()}
              disabled={isScanning || isGenerating}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
            >
              <Search size={14} />
              Re-scan
            </button>
            {totalMissingAudio > 0 && (
              <button
                onClick={() => generateAll.mutate()}
                disabled={isGenerating || generateAll.isPending}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 flex items-center gap-2"
              >
                {generateAll.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Play size={16} />
                )}
                Generate All Missing ({totalMissingAudio})
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
