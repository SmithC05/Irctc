// =============================================================================
// NammaRail — HomePage
// =============================================================================
//
// This file orchestrates the complete homepage layout.
// It does NOT contain any form logic — that's inside SearchCard.
// It does NOT contain any nav logic — that's inside HomeNav.
//
// LAYOUT (top to bottom):
//   [HomeNav]       — top bar + navbar (section 1+2)
//   [MAIN]          — two-column flex row (section 3)
//     [SearchCard]  — 420px fixed left column
//     [HeroPanel]   — flex:1 right column (hidden on mobile)
//   [StatsBar]      — full-width 3-column stats (section 4)
//   [NoticeBar]     — amber notice (section 5)
//   [QuickServices] — 4-card row (section 6)
//   [Footer]        — dark navy strip (section 7)
//
// GLOBAL STYLES injected here:
//   - @keyframes for slideInLeft, fadeIn, goldPulse, spin, fieldFadeUp
//   - .fade-up-* stagger classes for form fields
//   - .btn-search pulse animation
//   - .qs-visible for quick services reveal
//   - Mobile responsive grid override for QuickServices
// =============================================================================

import React from 'react';
import HomeNav       from '../components/home/HomeNav';
import SearchCard    from '../components/home/SearchCard';
import HeroPanel     from '../components/home/HeroPanel';
import StatsBar      from '../components/home/StatsBar';
import QuickServices from '../components/home/QuickServices';

// ── All homepage-scoped keyframe animations ────────────────────────────────────
// These are injected as a <style> tag rather than added to index.css
// to keep homepage concerns co-located with the page component.
const PAGE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  /* Apply Plus Jakarta Sans to the entire page */
  body { font-family: 'Plus Jakarta Sans', sans-serif !important; }

  /* ── Entry animations ────────────────────────────────────────────────────
     slideInLeft: Card slides from left (translateX -20px → 0) + fade in.
     fadeIn:      Simple opacity 0 → 1, used for the hero panel.
     fieldFadeUp: Each form field starts 8px lower and fades up sequentially.
                  Stagger delays (0.1s–0.5s) make the form feel alive on load.
  ── */
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-20px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes fieldFadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Staggered form field animations — each delayed 0.1s more than the last */
  .fade-up-1 { animation: fieldFadeUp 0.45s ease-out both; animation-delay: 0.15s; opacity: 0; }
  .fade-up-2 { animation: fieldFadeUp 0.45s ease-out both; animation-delay: 0.25s; opacity: 0; }
  .fade-up-3 { animation: fieldFadeUp 0.45s ease-out both; animation-delay: 0.35s; opacity: 0; }
  .fade-up-4 { animation: fieldFadeUp 0.45s ease-out both; animation-delay: 0.45s; opacity: 0; }
  .fade-up-5 { animation: fieldFadeUp 0.45s ease-out both; animation-delay: 0.55s; opacity: 0; }

  /* Gold pulse on search button while idle — draws attention to the primary CTA */
  @keyframes goldPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(240,192,64,0.5); }
    50%       { box-shadow: 0 0 0 8px rgba(240,192,64,0); }
  }
  .btn-search { animation: goldPulse 2s ease infinite; }
  .btn-search:hover { animation: none !important; }
  .btn-search:disabled { animation: none !important; }

  /* Spinner for loading state */
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Dot blink for "Finding trains..." */
  @keyframes dotBlink {
    0%, 100% { opacity: 0.2; }
    50%       { opacity: 1;   }
  }
  .dot-1 { animation: dotBlink 1.2s infinite; }
  .dot-2 { animation: dotBlink 1.2s infinite; animation-delay: 0.2s; }
  .dot-3 { animation: dotBlink 1.2s infinite; animation-delay: 0.4s; }

  /* Train animation (used in HeroPanel) */
  @keyframes trainMove {
    0%   { left: -50px; }
    100% { left: calc(100% + 50px); }
  }

  /* QuickServices reveal */
  .qs-visible { opacity: 1 !important; }

  /* Mobile: QuickServices 2×2 grid */
  @media (max-width: 640px) {
    .qs-grid { grid-template-columns: repeat(2, 1fr) !important; }
  }

  /* Mobile: SearchCard fills full width */
  @media (max-width: 767px) {
    #search-card { width: 100% !important; border-right: none !important; }
  }

  /* Override station dropdown z-index on homepage to be extra safe */
  .station-dropdown { z-index: 9999 !important; }

  /* Dark mode adjustments for inline-styled elements */
  .dark #search-card { background: #1a1a1a !important; }
  .dark .select-field { background: #272519 !important; color: #ede9dc !important; }
`;

export default function HomePage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-primary)',
    }}>
      {/* Inject scoped keyframes and overrides */}
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />

      {/* ── SECTION 1 + 2: Top Bar + Navbar ─────────────────────────────── */}
      <HomeNav />

      {/* ── SECTION 3: MAIN CONTENT (two-column) ─────────────────────────── */}
      {/* flex-row: SearchCard (420px fixed) + HeroPanel (flex:1).
          min-height: 480px ensures the hero has a meaningful presence.
          On mobile, HeroPanel is hidden (display:none via Tailwind 'hidden md:flex')
          and SearchCard expands to full width. */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        minHeight: 480,
        flex: 1,
      }}>
        <SearchCard />
        <HeroPanel />
      </div>

      {/* ── SECTION 4: STATS BAR ─────────────────────────────────────────── */}
      <StatsBar />

      {/* ── SECTION 5: NOTICE BAR ────────────────────────────────────────── */}
      {/* Amber background signals informational content (not error, not success).
          navy NOTICE badge + muted brown text keeps it official, not alarming. */}
      <div style={{
        background: '#FFF8E6',
        borderTop: '1px solid rgba(240,192,64,0.35)',
        borderBottom: '1px solid rgba(240,192,64,0.35)',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{
          background: '#1a3a5c',
          color: '#fff',
          fontSize: 10,
          padding: '2px 8px',
          borderRadius: 3,
          fontWeight: 600,
          letterSpacing: '0.03em',
          flexShrink: 0,
        }}>
          NOTICE
        </span>
        <p style={{ fontSize: 11, color: '#5a4a2a', margin: 0, lineHeight: 1.5 }}>
          Tatkal booking opens 1 day before journey. No refund applicable on cancellation of Tatkal tickets.
        </p>
      </div>

      {/* ── SECTION 6: QUICK SERVICES ────────────────────────────────────── */}
      <QuickServices />

      {/* ── SECTION 7: FOOTER STRIP ──────────────────────────────────────── */}
      {/* Single-line footer — this is a portal footer, not a marketing footer.
          Privacy Policy and Terms links are legally required. */}
      <div style={{
        background: '#0f2744',
        padding: '10px 24px',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 'auto',
      }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          © 2026 NammaRail · Ministry of Railways, Government of India
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {['Privacy Policy', 'Terms of Use'].map((link, i) => (
            <React.Fragment key={link}>
              {i > 0 && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>·</span>
              )}
              <a href="#" style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.4)',
                textDecoration: 'none',
                transition: 'color 0.15s',
              }}
                onMouseEnter={e => e.target.style.color = 'rgba(255,255,255,0.8)'}
                onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'}>
                {link}
              </a>
            </React.Fragment>
          ))}
        </div>
      </div>

    </div>
  );
}
