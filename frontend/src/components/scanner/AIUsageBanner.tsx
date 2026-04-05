import { useState, useEffect } from 'react';
import { getAIUsage, setAILimit, type AIUsage } from '../../api/ai';
import { DollarSign, Settings, AlertTriangle, Check, X } from 'lucide-react';

interface Props {
  onLimitReached?: () => void;
}

export function AIUsageBanner({ onLimitReached }: Props) {
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editLimit, setEditLimit] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUsage();
  }, []);

  useEffect(() => {
    if (usage?.limit_reached) {
      onLimitReached?.();
    }
  }, [usage?.limit_reached, onLimitReached]);

  const loadUsage = async () => {
    try {
      const data = await getAIUsage();
      setUsage(data);
      setEditLimit(data.monthly_limit.toString());
    } catch {
      // Ignore
    }
  };

  const handleSaveLimit = async () => {
    const newLimit = parseFloat(editLimit);
    if (isNaN(newLimit) || newLimit < 0) return;

    setSaving(true);
    try {
      await setAILimit(newLimit);
      await loadUsage();
      setShowSettings(false);
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  };

  if (!usage) return null;

  const progressColor = usage.usage_percent >= 90
    ? 'bg-red-500'
    : usage.usage_percent >= 70
    ? 'bg-orange-500'
    : 'bg-green-500';

  const bannerColor = usage.limit_reached
    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
    : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';

  return (
    <div className={`p-3 border rounded-lg ${bannerColor}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <DollarSign size={16} className={usage.limit_reached ? 'text-red-500' : 'text-blue-500'} />
          <span className={usage.limit_reached ? 'text-red-700 dark:text-red-300' : 'text-blue-700 dark:text-blue-300'}>
            AI Usage This Month
          </span>
          {usage.limit_reached && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs bg-red-100 dark:bg-red-900/50 px-2 py-0.5 rounded">
              <AlertTriangle size={12} />
              Limit Reached
            </span>
          )}
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-1 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded"
          title="Edit limit"
        >
          <Settings size={14} className="text-gray-500" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs mb-1">
          <span className={usage.limit_reached ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}>
            ${usage.total_cost.toFixed(3)} used
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            ${usage.monthly_limit.toFixed(2)} limit
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${progressColor}`}
            style={{ width: `${Math.min(100, usage.usage_percent)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>{usage.total_requests} requests</span>
        <span>${usage.remaining.toFixed(3)} remaining</span>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
            Monthly Limit (USD)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.5"
              min="0"
              value={editLimit}
              onChange={(e) => setEditLimit(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded text-sm"
              placeholder="5.00"
            />
            <button
              onClick={handleSaveLimit}
              disabled={saving}
              className="p-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
              title="Save"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => {
                setEditLimit(usage.monthly_limit.toString());
                setShowSettings(false);
              }}
              className="p-1.5 bg-gray-400 text-white rounded hover:bg-gray-500"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Set AI_MONTHLY_LIMIT env var for persistence
          </p>
        </div>
      )}
    </div>
  );
}
