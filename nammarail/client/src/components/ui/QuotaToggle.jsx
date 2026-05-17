// =============================================================================
// NammaRail — QuotaToggle Component
// =============================================================================
//
// WHAT IS A QUOTA IN INDIAN RAILWAYS?
// ─────────────────────────────────────────────────────────────────────────────
// Indian Railways divides each train's seats into "quotas" — pools allocated
// for different types of travellers:
//
//   General  → Normal booking. Opens 60 days before journey. Refunds apply
//              on cancellation (75% / 50% / 25% depending on how early).
//
//   Tatkal   → Emergency last-minute booking. Opens exactly 1 DAY before the
//              journey date (at 10:00 AM for AC classes, 11:00 AM for others).
//              A Tatkal surcharge is added on top of the base fare.
//              IF YOU CANCEL a Tatkal ticket: ZERO refund. No exceptions.
//              This is a real Indian Railways rule — it discourages people
//              from speculatively booking Tatkal seats they might not need,
//              which would otherwise block genuine last-minute travellers.
//
// ANIMATION STRATEGY:
// ─────────────────────────────────────────────────────────────────────────────
// Instead of changing the background-color of individual buttons (which causes
// an abrupt color flash), we render a single `layoutId` pill that slides
// between options using Framer Motion's shared layout animation.
// The pill is `position:absolute` inside a `position:relative` container.
// When `value` changes, Framer Motion smoothly translates the pill to the new
// position — creating the "sliding selector" feel of iOS segmented controls.
//
// PROPS:
//   value    — 'general' | 'tatkal'
//   onChange — function(newValue) called when user switches
// =============================================================================

import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';

const ease = [0.22, 1, 0.36, 1];

// ─── Tatkal info banner ───────────────────────────────────────────────────────
function TatkalBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: -4, scale: 0.98  }}
      transition={{ duration: 0.22, ease }}
      className="mt-3 rounded-xl px-4 py-3 text-sm border"
      style={{
        backgroundColor: 'var(--warning-bg)',
        borderColor: 'var(--warning-border)',
        color: 'var(--warning)',
      }}
    >
      <p className="font-semibold mb-1 flex items-center gap-1.5 text-[13px]">
        <Zap size={12} strokeWidth={2.5} />
        Tatkal booking selected
      </p>
      <ul className="text-xs space-y-0.5 opacity-80 list-disc list-inside"
        style={{ color: 'var(--text-secondary)' }}>
        <li>Higher fare applies — Tatkal surcharge added to base fare</li>
        <li>Opens 1 day before journey at 10:00 AM</li>
        <li>No refund on cancellation — policy strictly enforced</li>
      </ul>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const options = [
  { id: 'general', label: 'General' },
  { id: 'tatkal',  label: 'Tatkal'  },
];

/**
 * Two-option segmented control with a sliding active pill.
 * @param {'general'|'tatkal'} value
 * @param {Function} onChange
 */
export default function QuotaToggle({ value, onChange }) {
  return (
    <div>
      <label className="form-label">Quota</label>

      {/*
        Segmented control container.
        Each button is `relative z-10` so its text sits above the absolute pill.
        The pill uses `layoutId="quota-pill"` — Framer Motion identifies this
        element across renders and animates its position change automatically.
      */}
      <div
        className="relative inline-flex rounded-xl p-1 gap-0 w-full"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
        role="group"
        aria-label="Booking quota"
      >
        {options.map(opt => {
          const isActive = value === opt.id;
          return (
            <button
              key={opt.id}
              id={`quota-${opt.id}`}
              type="button"
              onClick={() => onChange(opt.id)}
              className="relative z-10 flex-1 px-3 py-2 rounded-lg text-sm font-semibold
                         transition-colors duration-200 select-none"
              style={{
                color: isActive ? '#FFFDF5' : 'var(--text-secondary)',
                // Text color transitions; background is handled by the sliding pill
              }}
              aria-pressed={isActive}
            >
              {/* Sliding pill — shared layout animation between buttons */}
              {isActive && (
                <motion.span
                  layoutId="quota-pill"
                  className="absolute inset-0 rounded-[10px]"
                  style={{ background: 'var(--brand-gradient)' }}
                  transition={{ duration: 0.25, ease }}
                />
              )}
              {/* Label text — sits above pill via z-index */}
              <span className="relative z-10">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tatkal warning — animates in/out */}
      <AnimatePresence>
        {value === 'tatkal' && <TatkalBanner key="tatkal-banner" />}
      </AnimatePresence>
    </div>
  );
}
