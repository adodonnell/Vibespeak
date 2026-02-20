import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
  actions?: { label: string; onClick: () => void }[];
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id'>): string => {
    const id = `toast_${++toastId}`;
    const newToast: Toast = { ...toast, id };
    setToasts(prev => [...prev, newToast]);
    return id;
  }, []);

  const success = useCallback((title: string, message?: string) => 
    addToast({ type: 'success', title, message }), [addToast]);

  const error = useCallback((title: string, message?: string) => 
    addToast({ type: 'error', title, message, duration: 6000 }), [addToast]);

  const info = useCallback((title: string, message?: string) => 
    addToast({ type: 'info', title, message }), [addToast]);

  const warning = useCallback((title: string, message?: string) => 
    addToast({ type: 'warning', title, message }), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, info, warning }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

// Toast icon components
const ToastIcons = {
  success: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
    </svg>
  ),
  error: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
    </svg>
  ),
  warning: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
    </svg>
  ),
};

const ToastContainer: React.FC<{ toasts: Toast[]; removeToast: (id: string) => void }> = ({ toasts, removeToast }) => {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: Toast; onClose: () => void }> = ({ toast, onClose }) => {
  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(onClose, toast.duration || 4000);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, onClose]);

  return (
    <div className={`toast toast-${toast.type}`} role="alert">
      <div className="toast-icon">{ToastIcons[toast.type]}</div>
      <div className="toast-content">
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
        {toast.actions && (
          <div className="toast-actions">
            {toast.actions.map((action, i) => (
              <button key={i} className="toast-action-btn" onClick={() => { action.onClick(); onClose(); }}>
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="toast-close" onClick={onClose} aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default ToastContext;