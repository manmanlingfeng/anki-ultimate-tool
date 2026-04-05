import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { X, AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto dismiss after 5 seconds
    setTimeout(() => removeToast(id), 5000);
  }, [removeToast]);

  const showError = useCallback((message: string) => {
    showToast(message, 'error');
  }, [showToast]);

  const showSuccess = useCallback((message: string) => {
    showToast(message, 'success');
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-md">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastItemProps {
  toast: Toast;
  onClose: () => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  const icons = {
    success: <CheckCircle size={18} className="text-green-500 dark:text-[#a6e3a1]" />,
    error: <AlertCircle size={18} className="text-red-500 dark:text-[#f38ba8]" />,
    warning: <AlertTriangle size={18} className="text-orange-500 dark:text-[#fab387]" />,
    info: <Info size={18} className="text-blue-500 dark:text-[#89b4fa]" />,
  };

  const bgColors = {
    success: 'bg-green-50 dark:bg-[#a6e3a1]/10 border-green-200 dark:border-[#a6e3a1]/20',
    error: 'bg-red-50 dark:bg-[#f38ba8]/10 border-red-200 dark:border-[#f38ba8]/20',
    warning: 'bg-orange-50 dark:bg-[#fab387]/10 border-orange-200 dark:border-[#fab387]/20',
    info: 'bg-blue-50 dark:bg-[#89b4fa]/10 border-blue-200 dark:border-[#89b4fa]/20',
  };

  const textColors = {
    success: 'text-green-800 dark:text-[#a6e3a1]',
    error: 'text-red-800 dark:text-[#f38ba8]',
    warning: 'text-orange-800 dark:text-[#fab387]',
    info: 'text-blue-800 dark:text-[#89b4fa]',
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border shadow-lg dark:shadow-[#11111b]/50 animate-slide-in ${bgColors[toast.type]}`}
    >
      {icons[toast.type]}
      <p className={`flex-1 text-sm ${textColors[toast.type]}`}>{toast.message}</p>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600 dark:text-[#6c7086] dark:hover:text-[#a6adc8]"
      >
        <X size={16} />
      </button>
    </div>
  );
}
