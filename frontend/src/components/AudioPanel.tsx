import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  runHealthCheck,
  startBatchGenerate,
  startAutoFix,
  getBatchStatus,
  getVoices,
  setVoice,
} from '../api/audio';
import type { HealthCheckResult, BatchJobStatus } from '../types';
import type { Voice } from '../api/audio';
import {
  AlertTriangle,
  CheckCircle,
  Play,
  Wrench,
  Loader2,
  RefreshCw,
  Settings,
  Volume2
} from 'lucide-react';
import { useToast } from './Toast';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface Props {
  deckId: number;
  deckName: string;
}

export function AudioPanel({ deckId }: Props) {
  const { showError } = useToast();
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<BatchJobStatus | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [currentVoice, setCurrentVoice] = useState<string>('');
  // Filters
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedGender, setSelectedGender] = useState<string>('Female');
  // Google settings
  const [speakingRate, setSpeakingRate] = useState<number>(0.9);
  const [pitch, setPitch] = useState<number>(0);
  // Speech Actors settings
  const [style, setStyle] = useState<string>('calm');
  const [availableStyles, setAvailableStyles] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  // Load voice settings
  useEffect(() => {
    getVoices().then((settings) => {
      setVoices(settings.voices);
      setProviders(settings.providers);
      setCurrentVoice(settings.current);
      setSpeakingRate(settings.speaking_rate);
      setPitch(settings.pitch);
      setStyle(settings.style);
      setAvailableStyles(settings.available_styles);
      // Set initial provider based on current voice
      const currentVoiceData = settings.voices.find(v => v.id === settings.current);
      if (currentVoiceData) {
        setSelectedProvider(currentVoiceData.provider);
        setSelectedGender(currentVoiceData.gender);
      } else if (settings.providers.length > 0) {
        setSelectedProvider(settings.providers[0]);
      }
    }).catch(() => {});
  }, []);

  // Sync filters when opening settings panel to match current voice
  const syncFiltersToCurrentVoice = () => {
    if (currentVoice && voices.length > 0) {
      const currentVoiceData = voices.find(v => v.id === currentVoice);
      if (currentVoiceData) {
        setSelectedProvider(currentVoiceData.provider);
        setSelectedGender(currentVoiceData.gender);
      }
    }
  };

  // Filter voices by provider and gender
  const filteredVoices = voices.filter(
    v => v.provider === selectedProvider && v.gender === selectedGender
  );

  const saveSettings = async (updates: Partial<{voice: string; rate: number; pitch: number; style: string}>) => {
    const voice = updates.voice ?? currentVoice;
    const rate = updates.rate ?? speakingRate;
    const p = updates.pitch ?? pitch;
    const s = updates.style ?? style;
    await setVoice({ voice_id: voice, speaking_rate: rate, pitch: p, style: s });
  };

  const handleVoiceChange = async (voiceId: string) => {
    setCurrentVoice(voiceId);
    await saveSettings({ voice: voiceId });
  };

  const handleRateChange = async (rate: number) => {
    setSpeakingRate(rate);
    await saveSettings({ rate });
  };

  const handlePitchChange = async (p: number) => {
    setPitch(p);
    await saveSettings({ pitch: p });
  };

  const handleStyleChange = async (s: string) => {
    setStyle(s);
    await saveSettings({ style: s });
  };

  const previewVoice = (voiceId: string) => {
    setPreviewingVoice(voiceId);
    const audio = new Audio(`${API_BASE}/api/audio/preview/${voiceId}`);
    audio.onended = () => setPreviewingVoice(null);
    audio.onerror = () => setPreviewingVoice(null);
    audio.play();
  };

  const healthCheck = useMutation({
    mutationFn: () => runHealthCheck(deckId),
    onSuccess: setHealthResult,
    onError: (err) => showError(err instanceof Error ? err.message : 'Health check failed'),
  });

  const batchGenerate = useMutation({
    mutationFn: (regenerate: boolean) => startBatchGenerate(deckId, regenerate),
    onSuccess: setJobId,
    onError: (err) => showError(err instanceof Error ? err.message : 'Batch generate failed'),
  });

  const autoFix = useMutation({
    mutationFn: () => startAutoFix(deckId),
    onSuccess: (id) => {
      if (id) setJobId(id);
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Auto fix failed'),
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
          healthCheck.mutate();
        }
      } catch {
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Reset state when deck changes
  useEffect(() => {
    setHealthResult(null);
    setJobId(null);
    setJobStatus(null);
  }, [deckId]);

  const isRunning = jobStatus?.status === 'running';

  return (
    <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium flex items-center gap-2 dark:text-white">
          <Wrench size={16} />
          Deck Tools
        </h3>
        <button
          onClick={() => {
            if (!showSettings) syncFiltersToCurrentVoice();
            setShowSettings(!showSettings);
          }}
          className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${showSettings ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
          title="Voice Settings"
        >
          <Settings size={16} className="dark:text-gray-400" />
        </button>
      </div>

      {showSettings && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded space-y-3">
          {/* Provider Selector */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Provider</label>
            <div className="flex gap-1">
              {providers.map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedProvider(p)}
                  className={`flex-1 px-3 py-1.5 text-sm rounded capitalize transition-colors ${
                    selectedProvider === p
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500 dark:text-gray-200'
                  }`}
                >
                  {p === 'speechactors' ? 'Speech Actors' : p}
                </button>
              ))}
            </div>
          </div>

          {/* Gender Selector */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Gender</label>
            <div className="flex gap-1">
              {['Female', 'Male'].map((g) => (
                <button
                  key={g}
                  onClick={() => setSelectedGender(g)}
                  className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
                    selectedGender === g
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500 dark:text-gray-200'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Voice List */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Voice</label>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {filteredVoices.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                    currentVoice === v.id
                      ? 'bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700'
                      : 'bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500'
                  }`}
                  onClick={() => handleVoiceChange(v.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate dark:text-gray-200">{v.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{v.quality}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      previewVoice(v.id);
                    }}
                    disabled={previewingVoice !== null}
                    className={`ml-2 p-1.5 rounded-full transition-colors ${
                      previewingVoice === v.id
                        ? 'bg-blue-500 text-white'
                        : 'hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-600 dark:text-gray-300'
                    }`}
                    title="Preview voice"
                  >
                    {previewingVoice === v.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Volume2 size={14} />
                    )}
                  </button>
                </div>
              ))}
              {filteredVoices.length === 0 && (
                <div className="text-sm text-gray-400 text-center py-2">
                  No voices available
                </div>
              )}
            </div>
          </div>

          {/* Provider-specific Settings */}
          {selectedProvider === 'google' && (
            <>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                  Speaking Rate: {speakingRate.toFixed(1)}x
                  <span className="text-gray-400 dark:text-gray-500 ml-1">(speed of speech)</span>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={speakingRate}
                  onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                  Pitch: {pitch > 0 ? '+' : ''}{pitch.toFixed(0)} semitones
                  <span className="text-gray-400 dark:text-gray-500 ml-1">(voice tone)</span>
                </label>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="1"
                  value={pitch}
                  onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </>
          )}
          {selectedProvider === 'speechactors' && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                Style <span className="text-gray-400 dark:text-gray-500">(emotion/tone)</span>
              </label>
              <select
                value={style}
                onChange={(e) => handleStyleChange(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-600 dark:text-gray-200 rounded px-2 py-1.5 text-sm capitalize"
              >
                {availableStyles.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => healthCheck.mutate()}
          disabled={!deckId || healthCheck.isPending || isRunning}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
        >
          {healthCheck.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Check Health
        </button>

        <button
          onClick={() => autoFix.mutate()}
          disabled={!deckId || isRunning || !healthResult?.issues.length}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 disabled:opacity-50"
        >
          <Wrench size={14} />
          Auto Fix ({healthResult?.issues.length || 0})
        </button>
      </div>

      <div className="space-y-2 mb-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Generate Audio</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => batchGenerate.mutate(false)}
            disabled={!deckId || isRunning}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
          >
            <Play size={14} />
            Missing Only
          </button>
          <button
            onClick={() => batchGenerate.mutate(true)}
            disabled={!deckId || isRunning}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-purple-500 text-white rounded text-sm hover:bg-purple-600 disabled:opacity-50"
          >
            <RefreshCw size={14} />
            Regenerate All
          </button>
        </div>
      </div>

      {healthResult && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 dark:text-gray-200">
              <CheckCircle size={14} className="text-green-600" />
              <span>With audio: {healthResult.cards_with_audio}</span>
            </div>
            <div className="flex items-center gap-2 dark:text-gray-200">
              <AlertTriangle size={14} className="text-red-500" />
              <span>Missing: {healthResult.cards_missing_audio}</span>
            </div>
            <div className="flex items-center gap-2 dark:text-gray-200">
              <AlertTriangle size={14} className="text-yellow-500" />
              <span>Wrong index: {healthResult.cards_wrong_index}</span>
            </div>
            <div className="flex items-center gap-2 dark:text-gray-200">
              <AlertTriangle size={14} className="text-purple-500" />
              <span>Orphaned: {healthResult.orphaned_audio}</span>
            </div>
          </div>
        </div>
      )}

      {jobStatus && jobStatus.status === 'running' && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1 dark:text-gray-300">
            <span>Processing...</span>
            <span>{jobStatus.progress} / {jobStatus.total}</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${(jobStatus.progress / jobStatus.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {jobStatus?.status === 'completed' && (
        <div className="p-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-sm">
          Completed! {jobStatus.errors.length > 0 && `(${jobStatus.errors.length} errors)`}
        </div>
      )}

      {jobStatus?.status === 'failed' && (
        <div className="p-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-sm">
          Failed: {jobStatus.error}
        </div>
      )}
    </div>
  );
}
