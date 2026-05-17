// =============================================================================
// NammaRail — Toast Notification System
// =============================================================================
//
// A lightweight, zero-dependency toast system built with Framer Motion.
//
// ARCHITECTURE:
//   ToastProvider  — wraps the app, holds toast state, renders the portal
//   useToast       — hook that returns { toast } for any component to use
//   toast(options) — imperative API: toast({ message, type, duration })
//
// WHY A PORTAL?
//   Toasts must render above all page content (z-index top). If we render them
//   inside the component tree they may be clipped by parent overflow:hidden.
//   ReactDOM.createPortal renders into document.body directly, so z-index
//   always works correctly.
//
// TYPES: 'success' | 'error' | 'info' | 'warning'
// =============================================================================

import {
  createContext, useContext, useState, useCallback, useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';

// ─── Context ──────────────────────────────────────────────────────────────────
const ToastContext = createContext(null);

// ─── Config per type ──────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  success: {
    Icon: CheckCircle2,
    iconColor: '#22C55E',
    bg: 'rgba(34, 197, 94, 0.08)',
    border: 'rgba(34, 197, 94, 0.20)',
  },
  error: {
    Icon: XCircle,
    iconColor: 'var(--error)',
    bg: 'var(--error-bg)',
    border: 'var(--error-border)',
  },
  warning: {
    Icon: AlertCircle,
    iconColor: 'var(--warning)',
    bg: 'var(--warning-bg)',
    border: 'var(--warning-border)',
  },
  info: {
    Icon: Info,
    iconColor: 'var(--brand)',
    bg: 'var(--brand-light)',
    border: 'color-mix(in srgb, var(--brand) 20%, transparent)',
  },
};

// ─── Single Toast Item ────────────────────────────────────────────────────────
function ToastItem({ id, message, type = 'info', onDismiss }) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.info;
  const { Icon, iconColor, bg, border } = config;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: 8,  scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-lg min-w-[260px] max-w-[360px]"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: `1px solid ${border}`,
        boxShadow: 'var(--shadow-card-hover)',
        // Subtle left accent bar
        borderLeft: `3px solid ${iconColor}`,
      }}
      role="alert"
      aria-live="polite"
    >
      <Icon
        size={16} strokeWidth={2}
        style={{ color: iconColor, flexShrink: 0, marginTop: 1 }}
      />
      <p className="text-[13px] font-medium leading-snug flex-1"
        style={{ color: 'var(--text-primary)' }}>
        {message}
      </p>
      <button
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="flex-shrink-0 transition-opacity duration-150 hover:opacity-60"
        style={{ color: 'var(--text-tertiary)', marginTop: 1 }}
      >
        <X size={13} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

// ─── Toast Container (portal) ─────────────────────────────────────────────────
function ToastContainer({ toasts, onDismiss }) {
  return createPortal(
    <div
      aria-label="Notifications"
      className="fixed bottom-5 right-5 flex flex-col gap-2.5 z-[9999] pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem {...t} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // toast({ message, type, duration }) — returns id for manual dismiss
  const toast = useCallback(({ message, type = 'info', duration = 3500 }) => {
    const id = ++counterRef.current;
    setToasts(prev => [...prev.slice(-4), { id, message, type }]); // max 5
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
