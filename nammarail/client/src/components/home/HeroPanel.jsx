// =============================================================================
// NammaRail — HeroPanel (Right hero column)
// =============================================================================
//
// This is the right-side panel that fills all remaining viewport width after
// the 420px SearchCard. It is purely decorative / atmospheric — no interactive
// form elements live here.
//
// WATERMARK TEXT TECHNIQUE:
// "INDIAN RAILWAYS" is rendered at color: rgba(255,255,255,0.10).
// Near-transparent white on a dark navy background creates a faint watermark
// effect. The text is legible if you look for it, but doesn't compete with the
// hero stats or pillars text — it acts as a texture, not content.
//
// DECORATIVE CIRCLES — WHY PURE CSS?
// Two large outlined circles in the top-right corner suggest train wheels
// without importing any SVG or PNG. Pure CSS shapes:
//   - Load instantly (no network request)
//   - Scale perfectly at any resolution
//   - Animate cheaply with CSS transforms
// border: 1px solid rgba(240,192,64,0.1) gives a barely-visible gold ring,
// adding depth without visual noise.
//
// TRAIN ANIMATION:
// The train emoji rides a dotted gold "track" fixed to the bottom of this panel.
// overflow:hidden on the panel clips the train as it enters/exits the edges,
// so it never appears floating outside the component boundary.
// =============================================================================

import React from 'react';

// ── Mini stat box for hero preview ────────────────────────────────────────────
function HeroStat({ number, label }) {
  return (
    <div style={{
      background: 'rgba(15,39,68,0.6)',
      borderRadius: 6,
      padding: '10px 16px',
      textAlign: 'center',
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(240,192,64,0.12)',
    }}>
      <div style={{
        fontSize: 20,
        fontWeight: 700,
        color: '#f0c040',
        lineHeight: 1.2,
      }}>
        {number}
      </div>
      <div style={{
        fontSize: 10,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 3,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </div>
    </div>
  );
}

export default function HeroPanel() {
  return (
    // flex:1 fills all space the SearchCard doesn't take.
    // position:relative is required so the absolute-positioned decorative
    // circles, train track, and train emoji anchor correctly inside this panel.
    // overflow:hidden clips the train as it exits the left/right edges.
    <div style={{
      flex: 1,
      background: 'linear-gradient(135deg, #1a3a5c 0%, #0d2137 100%)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      animation: 'fadeIn 0.6s ease 0.1s both',
    }}
      // Hidden on mobile — the search card goes full width on small screens
      className="hidden md:flex"
    >

      {/* ── DECORATIVE CIRCLES (train-wheel motif) ──────────────────────── */}
      {/* Two concentric circles in the top-right corner.
          Pure CSS shapes: no images, no SVG files, zero network requests.
          Low opacity keeps them subtle — they add depth without distraction. */}
      <div style={{
        position: 'absolute',
        width: 320,
        height: 320,
        right: -110,
        top: -110,
        borderRadius: '50%',
        border: '1px solid rgba(240,192,64,0.10)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        width: 210,
        height: 210,
        right: -60,
        top: -60,
        borderRadius: '50%',
        border: '1px solid rgba(240,192,64,0.16)',
        pointerEvents: 'none',
      }} />

      {/* Smaller accent circle — bottom left */}
      <div style={{
        position: 'absolute',
        width: 160,
        height: 160,
        left: -60,
        bottom: 30,
        borderRadius: '50%',
        border: '1px solid rgba(240,192,64,0.07)',
        pointerEvents: 'none',
      }} />

      {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
      <div style={{ padding: '40px 40px 60px', position: 'relative', zIndex: 1 }}>

        {/* WATERMARK TEXT — extremely low opacity creates texture, not content.
            rgba(255,255,255,0.10) is ~10% white on dark navy.
            This is below the threshold where most users read it as text —
            it registers as a pattern, which is the intended visual effect. */}
        <div style={{
          fontSize: 38,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.08)',
          letterSpacing: '5px',
          textTransform: 'uppercase',
          marginBottom: 24,
          userSelect: 'none',
          lineHeight: 1,
        }}>
          INDIAN RAILWAYS
        </div>

        {/* THREE PILLARS ──────────────────────────────────────────────── */}
        {/* Safety | Security | Punctuality — the official IR brand promise.
            Gold separators (|) match the brand accent color. */}
        <div style={{
          fontSize: 17,
          color: 'rgba(255,255,255,0.72)',
          marginBottom: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <span>Safety</span>
          <span style={{ color: '#f0c040', opacity: 0.7 }}>|</span>
          <span>Security</span>
          <span style={{ color: '#f0c040', opacity: 0.7 }}>|</span>
          <span>Punctuality</span>
        </div>

        {/* MINI STATS ─────────────────────────────────────────────────── */}
        {/* These are static display values — full animated stats are below
            in the StatsBar component. Here they give immediate context. */}
        <div style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <HeroStat number="3,292+" label="Trains" />
          <HeroStat number="71,000+" label="Station Stops" />
          <HeroStat number="3.26L+" label="Fare Records" />
        </div>

        {/* Official portal badge */}
        <div style={{
          marginTop: 28,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(240,192,64,0.12)',
          border: '1px solid rgba(240,192,64,0.25)',
          borderRadius: 4,
          padding: '5px 12px',
        }}>
          <span style={{ fontSize: 10, color: '#f0c040', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            ✓ Official Booking Portal
          </span>
        </div>
      </div>

      {/* ── TRAIN ANIMATION (bottom strip) ─────────────────────────────── */}
      {/* The train runs across the bottom of this panel in an 8s loop.
          position:absolute + bottom:0 anchors it to the panel floor.
          overflow:hidden on the parent clips it at panel edges. */}

      {/* Gold dotted track */}
      <div style={{
        position: 'absolute',
        bottom: 24,
        left: 0,
        right: 0,
        height: 2,
        background: 'repeating-linear-gradient(to right, rgba(240,192,64,0.45) 0px, rgba(240,192,64,0.45) 10px, transparent 10px, transparent 20px)',
        pointerEvents: 'none',
      }} />

      {/* Train emoji riding the track */}
      <div style={{
        position: 'absolute',
        bottom: 26,
        fontSize: 22,
        lineHeight: 1,
        animation: 'trainMove 8s linear infinite',
        pointerEvents: 'none',
      }}>
        🚂
      </div>

    </div>
  );
}
