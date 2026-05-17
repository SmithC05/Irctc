// =============================================================================
// NammaRail — Loading Spinner Component
// =============================================================================
// A centered CSS-only spinning ring in brand gold.
// No external library (react-spinners etc.) needed — keeps bundle size small.
// =============================================================================

export default function LoadingSpinner({ size = 'md', text = '' }) {
  // Size variants — maps a name to a Tailwind size class
  const sizes = {
    sm: 'w-6 h-6 border-2',
    md: 'w-10 h-10 border-[3px]',
    lg: 'w-16 h-16 border-4',
  };

  const ringClass = sizes[size] || sizes.md;

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      {/* 
        The spinner is a circle with:
          - A transparent background
          - A border on 3 sides matching bg-primary (invisible)
          - A border on the 4th side in brand gold (visible)
          - CSS animation: spin (360° rotation, 700ms, repeating)
        This creates the "one colored arc spinning" effect.
      */}
      <div
        className={`
          ${ringClass}
          rounded-full
          border-bg-tertiary
          animate-spin
        `}
        style={{ borderTopColor: 'var(--brand)' }}
        role="status"
        aria-label="Loading"
      />
      {text && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {text}
        </p>
      )}
    </div>
  );
}
