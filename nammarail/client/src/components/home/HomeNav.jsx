// =============================================================================
// NammaRail — HomeNav (Top Bar + Navbar combined)
// =============================================================================
//
// Two-row header specific to the homepage.
// Row 1 (TopBar): ministry text + language/help links
// Row 2 (Navbar): Indian flag + NammaRail logo, auth state, dark-mode toggle
//
// WHY A SEPARATE HOME NAV?
// The global Navbar.jsx is hidden on "/" (see Navbar.jsx: if path === '/' return null).
// The homepage needs its own navy-themed nav that matches the IRCTC portal aesthetic
// rather than the frosted-glass general Navbar used on inner pages.
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// ── Indian Flag (pure CSS, no images) ─────────────────────────────────────────
// Three coloured divs stacked: saffron / white / green
// The Ashoka Chakra (blue wheel) is omitted for simplicity at small size.
function IndianFlag() {
  return (
    <div className="flex flex-col gap-[1px] flex-shrink-0" aria-label="Indian flag">
      <div style={{ width: 18, height: 6, background: '#FF9933', borderRadius: 1 }} />
      <div style={{ width: 18, height: 6, background: '#ffffff', borderRadius: 1 }} />
      <div style={{ width: 18, height: 6, background: '#138808', borderRadius: 1 }} />
    </div>
  );
}

// ── Mobile hamburger / close icon ─────────────────────────────────────────────
function HamburgerIcon({ open }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {open ? (
        <>
          <line x1="18" y1="6"  x2="6"  y2="18" />
          <line x1="6"  y1="6"  x2="18" y2="18" />
        </>
      ) : (
        <>
          <line x1="3" y1="7"  x2="21" y2="7"  />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="17" x2="21" y2="17" />
        </>
      )}
    </svg>
  );
}

export default function HomeNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Theme toggle ────────────────────────────────────────────────────────────
  // Reads theme from localStorage so it persists across page reloads.
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  function handleLogout() {
    logout();
    navigate('/');
    setMenuOpen(false);
  }

  return (
    <header style={{ position: 'relative', zIndex: 20 }}>

      {/* ── ROW 1: Top Bar ──────────────────────────────────────────────────── */}
      {/* Ministry attribution on left, language links on right.
          Height is fixed at 32px per spec. Text is intentionally muted —
          it's legal boilerplate, not primary content. */}
      <div style={{
        background: '#0f2744',
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        fontSize: 11,
        color: 'rgba(255,255,255,0.55)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span className="hidden md:block">Ministry of Railways, Government of India</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}
            onMouseEnter={e => e.target.style.color = '#fff'}
            onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.55)'}>
            हिन्दी
          </a>
          <span style={{ opacity: 0.4 }}>·</span>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}
            onMouseEnter={e => e.target.style.color = '#fff'}
            onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.55)'}>
            தமிழ்
          </a>
          <span style={{ opacity: 0.4 }}>·</span>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}
            onMouseEnter={e => e.target.style.color = '#fff'}
            onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.55)'}>
            Help
          </a>
        </div>
      </div>

      {/* ── ROW 2: Main Navbar ──────────────────────────────────────────────── */}
      <nav style={{
        background: '#1a3a5c',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>

        {/* LEFT: Indian flag + NammaRail wordmark */}
        <Link to="/" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          textDecoration: 'none',
        }}>
          <IndianFlag />
          <span style={{
            color: '#f0c040',
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: '-0.01em',
          }}>
            NammaRail
          </span>
        </Link>

        {/* RIGHT: Auth links + dark mode toggle (desktop) */}
        <div className="hidden md:flex" style={{ alignItems: 'center', gap: 16 }}>
          {user ? (
            <>
              {/* Greeting — first name only to save space */}
              <span style={{ color: '#fff', fontSize: 12 }}>
                Hi, {user.name.split(' ')[0]}
              </span>
              <Link to="/my-bookings" style={{
                color: '#fff', fontSize: 12, textDecoration: 'none',
              }}
                onMouseEnter={e => { e.target.style.color = '#f0c040'; e.target.style.textDecoration = 'underline'; }}
                onMouseLeave={e => { e.target.style.color = '#fff';    e.target.style.textDecoration = 'none'; }}>
                My Bookings
              </Link>
              <button onClick={handleLogout} style={{
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.5)',
                background: 'transparent',
                borderRadius: 4,
                padding: '4px 12px',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" style={{ color: '#fff', fontSize: 12, textDecoration: 'none' }}
                onMouseEnter={e => { e.target.style.color = '#f0c040'; }}
                onMouseLeave={e => { e.target.style.color = '#fff';    }}>
                Login
              </Link>
              <Link to="/register" style={{
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.5)',
                background: 'transparent',
                borderRadius: 4,
                padding: '4px 12px',
                fontSize: 11,
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                Register
              </Link>
            </>
          )}

          {/* Dark/light toggle — always visible regardless of auth state.
              ☀ = currently dark (click to go light), 🌙 = currently light (click to go dark) */}
          <button onClick={toggleTheme} aria-label="Toggle theme" style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            marginLeft: 8,
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
        </div>

        {/* RIGHT (mobile): hamburger */}
        <div className="flex md:hidden" style={{ alignItems: 'center', gap: 10 }}>
          {/* Theme toggle always visible on mobile too */}
          <button onClick={toggleTheme} aria-label="Toggle theme" style={{
            width: 28, height: 28, borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'transparent', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: '#fff',
          }}>
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
          <button onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu"
            style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <HamburgerIcon open={menuOpen} />
          </button>
        </div>
      </nav>

      {/* ── Mobile slide-down menu ──────────────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden" style={{
          background: '#0f2744',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '12px 20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {user ? (
            <>
              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>
                Hi, {user.name}
              </span>
              <Link to="/my-bookings" onClick={() => setMenuOpen(false)}
                style={{ color: '#fff', fontSize: 13, textDecoration: 'none' }}>
                My Bookings
              </Link>
              <button onClick={handleLogout} style={{
                color: '#fff', fontSize: 13, background: 'none',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 4, padding: '6px 0', cursor: 'pointer', textAlign: 'left',
                paddingLeft: 12,
              }}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setMenuOpen(false)}
                style={{ color: '#fff', fontSize: 13, textDecoration: 'none' }}>
                Login
              </Link>
              <Link to="/register" onClick={() => setMenuOpen(false)}
                style={{
                  color: '#fff', fontSize: 13, textDecoration: 'none',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 4, padding: '6px 12px', display: 'inline-block',
                }}>
                Register
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
