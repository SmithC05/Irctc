// =============================================================================
// NammaRail — Status Badge Component
// =============================================================================
//
// WHY A CENTRALISED COMPONENT?
// ─────────────────────────────────────────────────────────────────────────────
// The CNF/RAC/WL badge appears in at least 4 places:
//   SearchResultsPage, BookingPage, MyBookingsPage, BookingDetailPage
//
// If we wrote the badge styles inline in each component, changing the color
// of "WL" from red to orange would require editing 4 files.
// With this component, we edit ONE place — and all 4 pages update instantly.
//
// This is the core principle of DRY (Don't Repeat Yourself).
// =============================================================================

// Status prefix mapping:
// "CNF"        → confirmed green
// "RAC 1"      → RAC amber
// "WL/3"       → WL red
// "WL"         → WL red
// anything else → neutral gray

function getStatusStyle(status) {
  if (!status) return 'bg-gray-100 text-gray-600 border-gray-200';

  const upper = status.toString().toUpperCase();

  if (upper === 'CNF')          return 'bg-green-50  text-green-700  border-green-200 dark:bg-green-900/20  dark:text-green-400  dark:border-green-800';
  if (upper.startsWith('RAC'))  return 'bg-amber-50  text-amber-700  border-amber-200 dark:bg-amber-900/20  dark:text-amber-400  dark:border-amber-800';
  if (upper.startsWith('WL'))   return 'bg-red-50    text-red-700    border-red-200   dark:bg-red-900/20    dark:text-red-400    dark:border-red-800';

  return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400';
}

/**
 * Pill badge that displays a booking status.
 * @param {string} status - "CNF", "RAC 1", "RAC-1", "WL/3", "WL", etc.
 */
export default function StatusBadge({ status }) {
  const styles = getStatusStyle(status);

  return (
    <span
      className={`
        inline-flex items-center justify-center
        px-2.5 py-0.5
        rounded-full border
        text-[11px] font-semibold tracking-wide
        ${styles}
      `}
    >
      {status ?? '—'}
    </span>
  );
}
