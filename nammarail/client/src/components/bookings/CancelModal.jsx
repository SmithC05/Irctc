// =============================================================================
// NammaRail — CancelModal Component
// =============================================================================
//
// WHY A MODAL FOR CANCELLATION?
// ─────────────────────────────────────────────────────────────────────────────
// Cancellation is IRREVERSIBLE — once processed, the booking is gone and the
// WL cascade begins (other passengers get bumped up). We show a modal so the
// user must CONFIRM their intent with a deliberate second click. This prevents
// accidental cancellations from a single misclick (e.g. fat-fingering on mobile).
// This pattern is called a "confirmation dialog" and is standard UX for any
// DESTRUCTIVE action — deleting files, removing accounts, cancelling orders.
//
// Z-INDEX LAYERING EXPLAINED:
// ─────────────────────────────────────────────────────────────────────────────
// The backdrop overlay uses z-40 and the modal card uses z-50.
// Order matters:
//   • z-40 backdrop: sits above all page content (Navbar is z-30)
//                    but below the modal card
//   • z-50 modal:    sits on top of everything — backdrop included
// If both used z-50, the backdrop would sometimes appear IN FRONT of the modal
// depending on DOM order. The explicit split guarantees the modal is always
// on top, with a dimmed-but-visible backdrop underneath.
// =============================================================================

import { useEffect, useRef } from 'react';
import { useRefundPreview }  from '../../hooks/useRefundPreview';
import StatusBadge           from '../ui/StatusBadge';

// ─── Helper: format date ───────────────────────────────────────────────────────
// Intl.DateTimeFormat is the BUILT-IN JavaScript date formatter.
// No external library (moment.js, date-fns) is needed.
// It uses the browser's locale engine to produce localised strings.
// Example: new Intl.DateTimeFormat('en-IN', { weekday:'short', … }) →  "Sun, 15 Jun 2026"
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

// ─── Sub-component: Booking Summary inside modal ──────────────────────────────
function ModalBookingSummary({ booking }) {
  const CLASS_LABELS = {
    '1A': 'First AC', '2A': 'Second AC', '3A': 'Third AC',
    'SL': 'Sleeper',  'CC': 'Chair Car', '2S': 'Second Sitting',
  };
  const classLabel = CLASS_LABELS[booking.class_code] ?? booking.class_code ?? '—';
  const passengers = booking.passengers ?? [];

  return (
    <div
      className="rounded-xl p-4 mb-5 text-sm"
      style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
    >
      <p className="font-bold text-base mb-0.5" style={{ color: 'var(--text-primary)' }}>
        {booking.train_name}
      </p>
      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
        #{booking.train_number} · {formatDate(booking.journey_date)}
      </p>

      <div className="flex items-center gap-3 mb-3">
        <span className="font-bold text-sm" style={{ color: 'var(--brand)' }}>
          {booking.from_station}
        </span>
        <span style={{ color: 'var(--text-tertiary)' }}>──→</span>
        <span className="font-bold text-sm" style={{ color: 'var(--brand)' }}>
          {booking.to_station}
        </span>
        <span
          className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}
        >
          {classLabel}
        </span>
      </div>

      <div className="space-y-1">
        {passengers.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span style={{ color: 'var(--text-secondary)' }}>{p.name} · {p.age}</span>
            <StatusBadge status={p.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-component: Refund Preview box ────────────────────────────────────────
function RefundPreviewBox({ refundPreview }) {
  const { refundAmount, refundNote, hasRefund } = refundPreview;

  // Green box for refund > 0, red box for no refund
  const boxClass = hasRefund
    ? 'bg-green-50  border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300'
    : 'bg-red-50    border-red-200   text-red-800   dark:bg-red-900/20   dark:border-red-700   dark:text-red-300';

  return (
    <div className={`rounded-xl border p-4 mb-5 ${boxClass}`}>
      <p className="text-xs font-bold uppercase tracking-widest mb-1 opacity-70">
        Refund Estimate
      </p>
      <p className="text-sm font-medium">{refundNote}</p>
      {hasRefund && refundAmount > 0 && (
        <p className="text-xs mt-1 opacity-70">
          Credited to original payment method within 5–7 business days.
        </p>
      )}
    </div>
  );
}

// ─── Sub-component: Step views ────────────────────────────────────────────────

function StepConfirm({ booking, refundPreview, onKeep, onConfirm }) {
  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
          style={{ backgroundColor: 'var(--brand-light)' }}
        >
          🗑️
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Cancel this booking?
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            This action cannot be undone.
          </p>
        </div>
      </div>

      <ModalBookingSummary booking={booking} />
      <RefundPreviewBox refundPreview={refundPreview} />

      <div className="flex gap-3">
        <button
          id="modal-keep-btn"
          onClick={onKeep}
          className="flex-1 py-3 rounded-xl font-semibold text-sm border transition-all duration-150"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          Keep booking
        </button>
        <button
          id="modal-cancel-confirm-btn"
          onClick={onConfirm}
          className="flex-1 py-3 rounded-xl font-semibold text-sm bg-red-600 text-white
                     hover:bg-red-700 transition-all duration-150"
        >
          Yes, cancel
        </button>
      </div>
    </>
  );
}

function StepLoading() {
  return (
    <div className="text-center py-10">
      <div className="flex justify-center mb-4">
        <div
          className="w-10 h-10 rounded-full border-4 border-red-200 border-t-red-600
                     animate-spin"
        />
      </div>
      <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
        Processing cancellation…
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
        Please don't close this window.
      </p>
    </div>
  );
}

function StepSuccess({ refundPreview, onClose }) {
  const { refundAmount, hasRefund } = refundPreview;

  return (
    <div className="text-center py-8">
      <div className="text-5xl mb-4">✅</div>
      <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
        Booking cancelled
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        {hasRefund && refundAmount > 0
          ? `₹${refundAmount} will be refunded in 5–7 business days.`
          : 'No refund applicable for this booking.'}
      </p>
      <button
        id="modal-close-success-btn"
        onClick={onClose}
        className="btn-primary px-10 py-3"
      >
        Close
      </button>
    </div>
  );
}

function StepError({ message, onRetry, onClose }) {
  return (
    <div className="text-center py-8">
      <div className="text-5xl mb-4">❌</div>
      <h2 className="text-xl font-bold mb-2 text-red-600">Cancellation failed</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        {message}
      </p>
      <div className="flex gap-3 justify-center">
        <button
          id="modal-close-error-btn"
          onClick={onClose}
          className="btn-outline px-6 py-2.5"
        >
          Close
        </button>
        <button
          id="modal-retry-btn"
          onClick={onRetry}
          className="btn-primary px-6 py-2.5 bg-red-600 hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

// ─── Main CancelModal ──────────────────────────────────────────────────────────

/**
 * @param {Object}   booking    - Full booking object being cancelled
 * @param {'idle'|'loading'|'success'|'error'} step - Current modal step
 * @param {string}   errorMsg   - Error message (step === 'error')
 * @param {Function} onKeep     - Called when user clicks "Keep booking"
 * @param {Function} onConfirm  - Called when user clicks "Yes, cancel"
 * @param {Function} onClose    - Called when user closes after success/error
 * @param {Function} onRetry    - Called when user retries after error
 */
export default function CancelModal({
  booking,
  step,
  errorMsg,
  onKeep,
  onConfirm,
  onClose,
  onRetry,
}) {
  const refundPreview = useRefundPreview(booking);
  const overlayRef    = useRef(null);

  // Close on backdrop click (but not on modal card click)
  function handleBackdropClick(e) {
    if (e.target === overlayRef.current && step !== 'loading') onClose();
  }

  // Close on Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && step !== 'loading') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, onClose]);

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    // Backdrop: z-40 — above page content (Navbar is z-30), below modal card
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }}
      role="dialog"
      aria-modal="true"
      aria-label="Cancel booking confirmation"
    >
      {/*
        Modal card: z-50 — explicitly above the backdrop.
        On mobile: slides up from the bottom (rounded top corners only).
        On desktop (sm+): centered card with all corners rounded.
        Max width 480px prevents it from stretching too wide on large screens.
      */}
      <div
        className="w-full sm:max-w-[480px] p-6 rounded-t-2xl sm:rounded-2xl
                   shadow-2xl transition-all duration-300"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          zIndex: 50,
          position: 'relative',
        }}
      >
        {step === 'idle'    && booking && (
          <StepConfirm
            booking={booking}
            refundPreview={refundPreview}
            onKeep={onKeep}
            onConfirm={onConfirm}
          />
        )}
        {step === 'loading' && <StepLoading />}
        {step === 'success' && (
          <StepSuccess refundPreview={refundPreview} onClose={onClose} />
        )}
        {step === 'error'   && (
          <StepError message={errorMsg} onRetry={onRetry} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
