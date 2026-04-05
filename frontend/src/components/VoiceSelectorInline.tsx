import { useState, useEffect } from 'react';
import { Volume2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getVoices, setVoice, type VoiceSettings } from '../api/audio';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface Props {
  onVoiceChange?: () => void;
  compact?: boolean;
}

export function VoiceSelectorInline({ onVoiceChange, compact = false }: Props) {
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedGender, setSelectedGender] = useState<string>('Male');
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
    onVoiceChange?.();
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
    onVoiceChange?.();
  };

  const previewVoice = (voiceId: string) => {
    setPreviewingVoice(voiceId);
    const audio = new Audio(`${API_BASE}/api/audio/preview/${voiceId}`);
    audio.onended = () => setPreviewingVoice(null);
    audio.onerror = () => setPreviewingVoice(null);
    audio.play().catch(() => setPreviewingVoice(null));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#a6adc8] text-sm">
        <Loader2 size={14} className="animate-spin" />
        Loading voice...
      </div>
    );
  }

  if (!settings || !currentVoice) {
    return (
      <div className="text-[#f9e2af] text-sm">Voice settings unavailable</div>
    );
  }

  const providerName = currentVoice.provider === 'speechactors' ? 'Speech Actors' : currentVoice.provider;

  return (
    <div className="bg-[#313244]/50 rounded-lg overflow-hidden">
      {/* Summary - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-[#313244]/70 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm">
          <Volume2 size={14} className="text-[#89b4fa]" />
          <span className="text-[#a6adc8]">Voice:</span>
          <span className="text-[#cdd6f4] font-medium">
            {currentVoice.name}
          </span>
          {!compact && (
            <>
              <span className="text-[#6c7086]">•</span>
              <span className="text-[#a6adc8] capitalize">{providerName}</span>
              {currentVoice.provider === 'speechactors' && (
                <>
                  <span className="text-[#6c7086]">•</span>
                  <span className="text-[#a6adc8] capitalize">{settings.style}</span>
                </>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1 text-[#89b4fa] text-xs">
          Change
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div className="p-3 pt-0 space-y-3 border-t border-[#45475a]">
          {/* Provider */}
          <div className="flex gap-1 mt-3">
            {settings.providers.map((p) => (
              <button
                key={p}
                onClick={() => setSelectedProvider(p)}
                className={`flex-1 px-2 py-1 text-xs rounded capitalize transition-colors ${
                  selectedProvider === p
                    ? 'bg-[#89b4fa] text-[#1e1e2e]'
                    : 'bg-[#45475a] text-[#cdd6f4] hover:bg-[#585b70]'
                }`}
              >
                {p === 'speechactors' ? 'Speech Actors' : p}
              </button>
            ))}
          </div>

          {/* Gender */}
          <div className="flex gap-1">
            {['Female', 'Male'].map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGender(g)}
                className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                  selectedGender === g
                    ? 'bg-[#89b4fa] text-[#1e1e2e]'
                    : 'bg-[#45475a] text-[#cdd6f4] hover:bg-[#585b70]'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Voices */}
          <div className="max-h-32 overflow-y-auto space-y-1">
            {filteredVoices.map((v) => (
              <div
                key={v.id}
                onClick={() => handleVoiceChange(v.id)}
                className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                  settings.current === v.id
                    ? 'bg-[#89b4fa]/20 border border-[#89b4fa]/30'
                    : 'bg-[#45475a]/50 hover:bg-[#45475a]'
                }`}
              >
                <span className="text-sm text-[#cdd6f4]">{v.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    previewVoice(v.id);
                  }}
                  disabled={previewingVoice !== null}
                  className="p-1 rounded hover:bg-[#313244]"
                >
                  {previewingVoice === v.id ? (
                    <Loader2 size={12} className="animate-spin text-[#89b4fa]" />
                  ) : (
                    <Volume2 size={12} className="text-[#a6adc8]" />
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Style for Speech Actors */}
          {selectedProvider === 'speechactors' && (
            <div>
              <label className="text-xs text-[#a6adc8] block mb-1">Style</label>
              <select
                value={settings.style}
                onChange={(e) => handleStyleChange(e.target.value)}
                className="w-full bg-[#45475a] text-[#cdd6f4] border border-[#585b70] rounded px-2 py-1.5 text-sm capitalize"
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
