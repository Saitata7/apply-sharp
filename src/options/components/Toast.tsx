import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';

interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  showToast: (text: string, type?: ToastMessage['type']) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const idCounter = useRef(0);

  const showToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = ++idCounter.current;
    setToasts((prev) => [...prev, { id, text, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const colors = {
    success: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    error: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  };
  const c = colors[toast.type];

  return (
    <div
      className="toast-item"
      role="alert"
      style={{
        background: c.bg,
        borderLeft: `4px solid ${c.border}`,
        color: c.text,
        padding: '10px 14px',
        borderRadius: '6px',
        fontSize: '13px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        animation: 'toast-slide-in 0.2s ease-out',
      }}
    >
      <span style={{ flex: 1 }}>{toast.text}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: c.text,
          fontSize: '16px',
          lineHeight: 1,
          padding: '0 2px',
        }}
        aria-label="Dismiss"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
