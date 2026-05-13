// =============================================================================
// NammaRail — Navbar Component
// =============================================================================
//
// WHY READ FROM AuthContext?
// ─────────────────────────────────────────────────────────────────────────────
// The Navbar is the single source of truth for "is anyone logged in?".
// Instead of receiving `user` as a prop (which requires App → Layout → Navbar
// prop drilling), it reads directly from AuthContext.
// If the user logs out anywhere in the app, AuthContext updates, and this
// Navbar re-renders automatically — no prop chain needed.
//
// MOBILE MENU PATTERN:
// ─────────────────────────────────────────────────────────────────────────────
// useState(false) tracks whether the hamburger menu is open.
// Clicking the hamburger sets it to true (slide open).
// Clicking a link or the backdrop sets it back to false (close).
// =============================================================================

import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../ui/ThemeToggle';

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 select-none">
      {/* Unicode train emoji as a quick logo — replace with SVG if desired */}
      <span className="text-xl">🚆</span>
      <span className="text-lg font-bold tracking-tight" style={{ color: 'var(--brand)' }}>
        NammaRail
      </span>
    </Link>
  );
}

// ─── Desktop Navigation Links ─────────────────────────────────────────────────
function DesktopNav({ user, onLogout }) {
  const navLinkClass = ({ isActive }) =>
    `text-sm font-medium transition-colors duration-150 ${
      isActive ? 'text-brand border-b-2 border-brand pb-0.5' : 'hover:text-brand'
    }`;

  return (
    <div className="hidden md:flex items-center gap-6">
      {user ? (
        <>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Hi, {user.name.split(' ')[0]} 👋
          </span>
          <NavLink to="/my-bookings" className={navLinkClass} style={{ color: 'var(--text-primary)' }}>
            My Bookings
          </NavLink>
          <button onClick={onLogout} className="btn-outline text-sm px-4 py-2">
            Logout
          </button>
        </>
      ) : (
        <>
          <NavLink to="/login" className={navLinkClass} style={{ color: 'var(--text-primary)' }}>
            Login
          </NavLink>
          <Link to="/register" className="btn-primary text-sm px-4 py-2">
            Register
          </Link>
        </>
      )}
      <ThemeToggle />
    </div>
  );
}

// ─── Mobile Menu (slide-down) ─────────────────────────────────────────────────
function MobileMenu({ user, onLogout, onClose }) {
  return (
    <div
      className="md:hidden border-t py-4 flex flex-col gap-3 px-4"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
    >
      {user ? (
        <>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Hi, {user.name} 👋
          </p>
          <Link to="/my-bookings" onClick={onClose}
            className="text-sm font-medium py-2" style={{ color: 'var(--text-primary)' }}>
            My Bookings
          </Link>
          <button onClick={() => { onLogout(); onClose(); }} className="btn-outline text-sm text-left">
            Logout
          </button>
        </>
      ) : (
        <>
          <Link to="/login" onClick={onClose}
            className="text-sm font-medium py-2" style={{ color: 'var(--text-primary)' }}>
            Login
          </Link>
          <Link to="/register" onClick={onClose} className="btn-primary text-sm text-center">
            Register
          </Link>
        </>
      )}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Toggle theme</span>
      </div>
    </div>
  );
}

// ─── Hamburger Icon ───────────────────────────────────────────────────────────
function HamburgerIcon({ isOpen }) {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      {isOpen
        ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      }
    </svg>
  );
}

// ─── Main Navbar ──────────────────────────────────────────────────────────────
export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b shadow-sm"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
    >
      <div className="container-app flex items-center justify-between h-16">
        <Logo />
        <DesktopNav user={user} onLogout={handleLogout} />
        {/* Hamburger — only visible on mobile */}
        <button
          className="md:hidden p-2 rounded-lg"
          style={{ color: 'var(--text-secondary)' }}
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          <HamburgerIcon isOpen={menuOpen} />
        </button>
      </div>

      {/* Slide-down mobile menu */}
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
