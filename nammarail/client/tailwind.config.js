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
        // Background layers (light mode = warm ivory scale, dark mode = dark grays)
        'bg-primary':   'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary':  'var(--bg-tertiary)',

        // Brand gold — the accent color for buttons, links, and highlights
        'brand':        'var(--brand)',
        'brand-hover':  'var(--brand-hover)',
        'brand-light':  'var(--brand-light)',

        // Text hierarchy (primary → secondary → tertiary = less emphasis each step)
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary':  'var(--text-tertiary)',

        // Subtle borders for cards, inputs, dividers
        'border-color': 'var(--border)',
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
      },

      // ── Box Shadow ──────────────────────────────────────────────────────
      // Soft shadow for cards — warmer tone than Tailwind's default blue-gray.
      boxShadow: {
        'card': '0 1px 4px 0 rgba(0,0,0,0.08), 0 4px 12px 0 rgba(0,0,0,0.06)',
        'card-hover': '0 4px 16px 0 rgba(0,0,0,0.12), 0 8px 24px 0 rgba(0,0,0,0.08)',
      },
    },
  },

  plugins: [],
};
