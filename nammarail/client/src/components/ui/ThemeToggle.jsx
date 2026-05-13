// =============================================================================
// NammaRail — Theme Toggle Button (Sun / Moon)
// =============================================================================
//
// WHY TOGGLE A CLASS ON <html> INSTEAD OF REACT STATE?
// ─────────────────────────────────────────────────────────────────────────────
// Tailwind's dark mode works by checking whether the <html> element has the
// "dark" class:
//   - <html class="">          → light mode styles apply
//   - <html class="dark">     → all dark: prefixed classes activate
//
// If we stored "isDark" in React state, the Tailwind dark classes wouldn't
// react to it — Tailwind processes classes statically at build time and
// checks the DOM at runtime.  The only way to trigger Tailwind's dark mode
// is to actually add/remove the class on the <html> element in the DOM.
//
// We also save the preference to localStorage so the next visit starts
// in the user's preferred mode (main.jsx reads this before React renders).
// =============================================================================

import { useState, useEffect } from 'react';

// Sun icon (light mode indicator)
function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

// Moon icon (dark mode indicator)
function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function ThemeToggle() {
  // Sync component state with whatever class is on <html> right now.
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  );

  function toggle() {
    const html = document.documentElement;

    if (isDark) {
      html.classList.remove('dark');
      localStorage.setItem('nammarail_theme', 'light');
    } else {
      html.classList.add('dark');
      localStorage.setItem('nammarail_theme', 'dark');
    }

    setIsDark(!isDark);
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="
        p-2 rounded-lg transition-colors duration-200
        hover:bg-bg-tertiary
      "
      style={{ color: 'var(--text-secondary)' }}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
