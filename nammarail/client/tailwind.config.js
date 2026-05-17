// =============================================================================
// NammaRail — Tailwind CSS Configuration
// =============================================================================
//
// EXTENDING vs OVERRIDING Tailwind:
// ─────────────────────────────────
// Tailwind ships with hundreds of built-in color classes (red-500, blue-200…).
// "Overriding" means replacing those entirely — you lose all built-in colors.
// "Extending" (what we do here with `theme.extend`) means we ADD our custom
// tokens ON TOP of everything Tailwind already provides.
// So `bg-brand` is new, but `bg-white` and `bg-red-500` still work fine.
//
// DARK MODE STRATEGY: "class"
// ───────────────────────────
// Tailwind supports two dark mode strategies:
//   "media"  → respects the OS preference (prefers-color-scheme).
//              You have no control — user can't toggle it in your app.
//   "class"  → dark mode activates when the html tag has class="dark".
//              We control it in JavaScript, so users can toggle it with a button.
// We use "class" so our ThemeToggle component can switch modes at runtime.
// =============================================================================

/** @type {import('tailwindcss').Config} */
export default {
  // Which files Tailwind should scan to find class names to include in the build.
  // "content" tells Tailwind not to include unused classes — keeps bundle tiny.
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],

  // "class" strategy: dark mode activates when <html class="dark"> is set.
  darkMode: 'class',

  theme: {
    extend: {
      // ── NammaRail Color Tokens ──────────────────────────────────────────
      // These map CSS variables defined in index.css to Tailwind utility classes.
      // Usage example: className="bg-bg-primary text-text-primary border-border"
      colors: {
        'bg-primary':    'var(--bg-primary)',
        'bg-secondary':  'var(--bg-secondary)',
        'bg-tertiary':   'var(--bg-tertiary)',
        'bg-elevated':   'var(--bg-elevated)',
        'brand':         'var(--brand)',
        'brand-hover':   'var(--brand-hover)',
        'brand-light':   'var(--brand-light)',
        'brand-glow':    'var(--brand-glow)',
        'text-primary':  'var(--text-primary)',
        'text-secondary':'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-inverted': 'var(--text-inverted)',
        'border-color':  'var(--border)',
        'error':         'var(--error)',
      },

      // ── Font Family ─────────────────────────────────────────────────────
      // System font stack — renders natively on every OS.
      // No network request needed → fastest possible font loading.
      fontFamily: {
        sans: [
          'system-ui', '-apple-system', 'BlinkMacSystemFont',
          '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial',
          'sans-serif',
        ],
      },

      // ── Border Radius ───────────────────────────────────────────────────
      borderRadius: {
        'xl':  '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },

      // ── Box Shadow ──────────────────────────────────────────────────────
      // Soft shadow for cards — warmer tone than Tailwind's default blue-gray.
      boxShadow: {
        'card':       '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.05)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.10), 0 16px 40px rgba(0,0,0,0.08)',
        'nav':        '0 1px 0 var(--border)',
        'input':      '0 1px 2px rgba(0,0,0,0.04)',
        'glow':       '0 0 0 3px var(--brand-glow)',
      },
    },
  },

  plugins: [],
};
