// =============================================================================
// NammaRail — Navbar Component
// =============================================================================
//
// Reads auth state directly from AuthContext — no prop drilling.
// backdrop-blur gives the frosted glass effect on scroll.
// =============================================================================

import { useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, BookOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../ui/ThemeToggle';

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 select-none group">
      <div
        className="flex items-center justify-center w-7 h-7 rounded-lg"
        style={{ background: 'var(--brand-gradient)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#FFFDF5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h18M3 6h18M3 18h18" />
          <circle cx="7" cy="18" r="2" fill="#FFFDF5" stroke="none" />
          <circle cx="17" cy="18" r="2" fill="#FFFDF5" stroke="none" />
        </svg>
      </div>
      <span
        className="text-[16px] font-bold tracking-tight"
        style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
      >
        Namma<span style={{ color: 'var(--brand)' }}>Rail</span>
      </span>
    </Link>
  );
}

// ─── Vertical separator ───────────────────────────────────────────────────────
function Sep() {
  return (
    <div
      className="h-4 w-px mx-1"
      style={{ backgroundColor: 'var(--border)' }}
    />
  );
}

// ─── Desktop nav ──────────────────────────────────────────────────────────────
function DesktopNav({ user, onLogout }) {
  const linkClass = ({ isActive }) =>
    `text-sm font-medium transition-colors duration-150 rounded px-1 ${
      isActive ? '' : 'hover:opacity-80'
    }`;

  return (
    <div className="hidden md:flex items-center gap-4">
      {user ? (
        <>
          <span className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
            {user.name.split(' ')[0]}
          </span>
          <Sep />
          <NavLink
            to="/my-bookings"
            className={linkClass}
            style={({ isActive }) => ({
              color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
            })}
          >
            My Bookings
          </NavLink>
          <button onClick={onLogout} className="btn-outline text-xs px-3 py-1.5">
            Sign out
          </button>
        </>
      ) : (
        <>
          <NavLink
            to="/login"
            className={linkClass}
            style={{ color: 'var(--text-secondary)' }}
          >
            Sign in
          </NavLink>
          <Link to="/register" className="btn-primary text-xs px-4 py-2">
            Get started
          </Link>
        </>
      )}
      <Sep />
      <ThemeToggle />
    </div>
  );
}

// ─── Mobile menu ──────────────────────────────────────────────────────────────
function MobileMenu({ user, onLogout, onClose }) {
  return (
    <div
      className="md:hidden border-t px-5 py-4 flex flex-col gap-0.5"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      {user ? (
        <>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.08em] px-3 py-2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {user.name}
          </p>
          <Link
            to="/my-bookings"
            onClick={onClose}
            className="flex items-center gap-3 text-sm font-medium px-3 py-2.5 rounded-xl
                       transition-colors duration-150"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <BookOpen size={15} strokeWidth={1.75} style={{ color: 'var(--text-tertiary)' }} />
            My Bookings
          </Link>
          <button
            onClick={() => { onLogout(); onClose(); }}
            className="flex items-center gap-3 text-sm font-medium px-3 py-2.5 rounded-xl
                       transition-colors duration-150 text-left w-full"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Sign out
          </button>
        </>
      ) : (
        <>
          <Link
            to="/login"
            onClick={onClose}
            className="text-sm font-medium px-3 py-2.5 rounded-xl
                       transition-colors duration-150"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Sign in
          </Link>
          <Link
            to="/register"
            onClick={onClose}
            className="btn-primary text-sm text-center mt-1"
          >
            Get started
          </Link>
        </>
      )}

      <div
        className="flex items-center gap-2.5 px-3 pt-3 mt-2 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <ThemeToggle />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Switch appearance
        </span>
      </div>
    </div>
  );
}

// ─── Main Navbar ──────────────────────────────────────────────────────────────
export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const location         = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Explain why Navbar is hidden on homepage:
  // The existing Navbar needs to be HIDDEN on the homepage
  // because the homepage has its own top bar and nav built in.
  if (location.pathname === '/') return null;

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{
        // Semi-transparent frosted-glass background
        backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 88%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-navbar)',
      }}
    >
      <div className="container-app flex items-center justify-between h-[58px]">
        <Logo />
        <DesktopNav user={user} onLogout={handleLogout} />

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg
                     transition-colors duration-150"
          style={{ color: 'var(--text-secondary)' }}
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {menuOpen
            ? <X size={18} strokeWidth={2} />
            : <Menu size={18} strokeWidth={2} />
          }
        </button>
      </div>

      {menuOpen && (
        <MobileMenu
          user={user}
          onLogout={handleLogout}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </nav>
  );
}
