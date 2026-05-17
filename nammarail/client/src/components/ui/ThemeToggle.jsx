// =============================================================================
// NammaRail — Theme Toggle (Sun / Moon via Lucide React)
// =============================================================================
//
// Tailwind's dark mode works by checking whether <html class="dark"> is set.
// We toggle that class directly in the DOM and persist the preference to
// localStorage so the next visit starts in the user's chosen mode.
// =============================================================================

import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
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
      className="flex items-center justify-center w-8 h-8 rounded-lg
                 transition-all duration-150"
      style={{
        color: 'var(--text-tertiary)',
        backgroundColor: 'transparent',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = 'var(--text-tertiary)';
      }}
    >
      {isDark
        ? <Sun size={16} strokeWidth={1.75} />
        : <Moon size={16} strokeWidth={1.75} />
      }
    </button>
  );
}
