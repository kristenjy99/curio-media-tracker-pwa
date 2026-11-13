import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);
  const push = useCallback(
    (message, { tone = 'success', duration = 4000 } = {}) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((list) => [...list.slice(-3), { id, message, tone }]);
      if (duration) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-lg">
            {toast.tone === 'error' ? <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-moss" />}
            <p className="flex-1 leading-relaxed">{toast.message}</p>
            <button type="button" onClick={() => dismiss(toast.id)} className="text-ink-muted hover:text-ink" aria-label="Đóng thông báo">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
