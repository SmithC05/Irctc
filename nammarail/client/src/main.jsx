// =============================================================================
// NammaRail — Vite Entry Point
// =============================================================================
//
// DARK MODE INITIALIZATION:
// ─────────────────────────────────────────────────────────────────────────────
// We apply the "dark" class to <html> BEFORE React renders.
// Why? React renders asynchronously. If we applied the class inside a
// useEffect (which runs after render), the user would see a flash of the
// wrong theme for a fraction of a second on every page load.
//
// By running the localStorage check here — before createRoot — the DOM
// gets the correct class before any paint, eliminating the flash.
// =============================================================================

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// ─── Apply saved theme preference before React renders ────────────────────────
const savedTheme = localStorage.getItem('nammarail_theme');

if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
} else {
  // Default to light mode if no preference is stored.
  document.documentElement.classList.remove('dark');
}

// ─── Mount React app ──────────────────────────────────────────────────────────
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
