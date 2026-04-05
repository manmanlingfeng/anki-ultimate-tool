import { useState, useEffect } from 'react';
import { getVoices, setVoice, type Voice } from '../../api/audio';
import { Volume2, Settings, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface VoiceSettings {
  current: string;
  voices: Voice[];
  providers: string[];
  speaking_rate: number;
  pitch: number;
  style: string;
  available_styles: string[];
}

interface Props {
  onSettingsChange?: () => void;
}

export function VoiceSettingsCard({ onSettingsChange }: Props) {
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedGender, setSelectedGender] = useState<string>('Female');
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getVoices();
      setSettings(data);
      const currentVoice = data.voices.find(v => v.id === data.current);
      if (currentVoice) {
        setSelectedProvider(currentVoice.provider);
        setSelectedGender(currentVoice.gender);
      } else if (data.providers.length > 0) {
        setSelectedProvider(data.providers[0]);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  const currentVoice = settings?.voices.find(v => v.id === settings.current);
  const filteredVoices = settings?.voices.filter(
    v => v.provider === selectedProvider && v.gender === selectedGender
  ) ?? [];

  const handleVoiceChange = async (voiceId: string) => {
    if (!settings) return;
    await setVoice({
      voice_id: voiceId,
      speaking_rate: settings.speaking_rate,
      pitch: settings.pitch,
      style: settings.style,
    });
    setSettings({ ...settings, current: voiceId });
    onSettingsChange?.();
  };

  const handleRateChange = async (rate: number) => {
    if (!settings) return;
    await setVoice({
      voice_id: settings.current,
      speaking_rate: rate,
      pitch: settings.pitch,
      style: settings.style,
    });
    setSettings({ ...settings, speaking_rate: rate });
    onSettingsChange?.();
  };

  const handlePitchChange = async (pitch: number) => {
    if (!settings) return;
    await setVoice({
      voice_id: settings.current,
      speaking_rate: settings.speaking_rate,
      pitch,
      style: settings.style,
    });
    setSettings({ ...settings, pitch });
    onSettingsChange?.();
  };

  const handleStyleChange = async (style: string) => {
    if (!settings) return;
    await setVoice({
      voice_id: settings.current,
      speaking_rate: settings.speaking_rate,
      pitch: settings.pitch,
      style,
    });
    setSettings({ ...settings, style });
    onSettingsChange?.();
  };

  const previewVoice = (voiceId: string) => {
    setPreviewingVoice(voiceId);
    const audio = new Audio(`${API_BASE}/api/audio/preview/${voiceId}`);
    audio.onended = () => setPreviewingVoice(null);
    audio.onerror = () => setPreviewingVoice(null);
    audio.play();
  };

  if (loading) {
    return (
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg animate-pulse">
        <div className="h-5 w-40 bg-blue-200 dark:bg-blue-700 rounded mb-2" />
        <div className="h-4 w-60 bg-blue-100 dark:bg-blue-800 rounded" />
      </div>
    );
  }

  if (!settings || !currentVoice) {
    return (
      <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
        <div className="text-orange-700 dark:text-orange-300 text-sm">
          Voice settings not available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
      {/* Summary Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium text-blue-800 dark:text-blue-200 flex items-center gap-2">
            <Volume2 size={16} />
            Current Voice Settings
          </div>
          <button
            onClick={() => setShowEditor(!showEditor)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <Settings size={14} />
            {showEditor ? 'Hide' : 'Change'}
            {showEditor ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <div className="flex items-center gap-4 flex-wrap">
            <span>
              <span className="opacity-70">Provider:</span>{' '}
              <span className="font-medium capitalize">
                {currentVoice.provider === 'speechactors' ? 'Speech Actors' : currentVoice.provider}
              </span>
            </span>
            <span>
              <span className="opacity-70">Voice:</span>{' '}
              <span className="font-medium">{currentVoice.name}</span>
            </span>
            <span>
              <span className="opacity-70">Gender:</span>{' '}
              <span className="font-medium">{currentVoice.gender}</span>
            </span>
          </div>
          {currentVoice.provider === 'google' && (
            <div className="flex items-center gap-4">
              <span>
                <span className="opacity-70">Rate:</span>{' '}
                <span className="font-medium">{settings.speaking_rate.toFixed(1)}x</span>
              </span>
              <span>
                <span className="opacity-70">Pitch:</span>{' '}
                <span className="font-medium">
                  {settings.pitch > 0 ? '+' : ''}{settings.pitch} semitones
                </span>
              </span>
            </div>
          )}
          {currentVoice.provider === 'speechactors' && (
            <div>
              <span className="opacity-70">Style:</span>{' '}
              <span className="font-medium capitalize">{settings.style}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Editor */}
      {showEditor && (
        <div className="p-4 bg-white dark:bg-gray-800 border-t border-blue-200 dark:border-blue-800 space-y-4">
          {/* Provider Selector */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Provider</label>
            <div className="flex gap-1">
              {settings.providers.map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedProvider(p)}
                  className={`flex-1 px-3 py-1.5 text-sm rounded capitalize transition-colors ${
                    selectedProvider === p
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-gray-200'
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
                      : 'bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-gray-200'
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
                    settings.current === v.id
                      ? 'bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700'
                      : 'bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
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

          {/* Provider-specific settings */}
          {selectedProvider === 'google' && (
            <>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                  Speaking Rate: {settings.speaking_rate.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={settings.speaking_rate}
                  onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                  Pitch: {settings.pitch > 0 ? '+' : ''}{settings.pitch} semitones
                </label>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="1"
                  value={settings.pitch}
                  onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </>
          )}
          {selectedProvider === 'speechactors' && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Style</label>
              <select
                value={settings.style}
                onChange={(e) => handleStyleChange(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded px-2 py-1.5 text-sm capitalize"
              >
                {settings.available_styles.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
