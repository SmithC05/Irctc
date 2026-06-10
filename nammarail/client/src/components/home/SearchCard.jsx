// =============================================================================
// NammaRail — SearchCard (Left 420px booking card)
// =============================================================================
//
// WHY 420px FIXED WIDTH?
// ───────────────────────────────────────────────────────────────────────────
// The StationAutocomplete dropdown is positioned absolutely relative to its
// wrapper. If the card were fluid (e.g. 50% of viewport), a wide screen would
// make the dropdown extremely wide — overflowing into the hero image and
// looking broken. By fixing the card at 420px, the dropdown never overflows.
//
// CSS STACKING CONTEXT — complete trigger list (not just z-index):
// ───────────────────────────────────────────────────────────────────────────
// A new stacking context is created by ANY of these CSS properties:
//   • position + z-index (any value except auto)
//   • position + animation              ← THIS was our bug
//   • opacity < 1
//   • transform (any value other than none)
//   • filter (any value other than none)
//   • will-change (any of the above)
//   • isolation: isolate
//
// When an element creates a stacking context, every child z-index is
// evaluated WITHIN that context, not on the page. A dropdown with
// z-index:9999 inside a stacking-context parent is ranked 9999 WITHIN that
// parent — sibling flex children in the SAME parent paint on top of it
// regardless of the dropdown's z-index, because they share the same context.
//
// OUR SPECIFIC BUG:
// The card had animation: 'slideInLeft …'. Even without z-index, the
// animation property alone creates a stacking context. The flex children
// (swap row, To field, Date row…) therefore painted OVER the From dropdown
// in DOM order, ignoring its z-index:9999 entirely.
//
// THE FIX — two parts:
//
// PART 1 — Outer animation wrapper:
// We wrap the card in a plain div that carries the animation. This outer div
// creates the stacking context (via animation). The inner card div has
// position:relative (needed for dropdown anchor) but NO animation and NO
// z-index, so it does NOT create its own stacking context. The dropdown's
// z-index:9999 now escapes the card and applies to the outer wrapper's
// stacking context, which contains no obstructing siblings.
//
// PART 2 — isolation: isolate on lower siblings:
// isolation: isolate is the cleanest way to create a stacking context on an
// element. Unlike z-index it does not affect the element's position in the
// z-order relative to OUTER siblings — it just groups the element's own
// children into a self-contained painting group.
//
// We add it to:
//   • Swap button row       (between From and To)
//   • To field wrapper      (so its dropdown floats above Date/Quota rows)
//   • Date + Class row      (below both dropdowns — must not paint over them)
//   • Quota row             (below both dropdowns)
//   • Search button row     (below all dropdowns)
//
// We do NOT add it to:
//   • From field wrapper    (it must escape upward to float above all below it)
//
// The From dropdown floats above: swap row, To field, Date row, Quota row ✓
// The To dropdown floats above: Date row, Quota row, Search button row ✓
// =============================================================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StationAutocomplete from '../ui/StationAutocomplete';
import DatePicker from '../ui/DatePicker';

function getTodayStr() { return new Date().toISOString().slice(0, 10); }
function getMaxDateStr() {
  const d = new Date(); d.setDate(d.getDate() + 60);
  return d.toISOString().slice(0, 10);
}
function getDayName(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' });
}

// ── Inline style constants ────────────────────────────────────────────────────
const NAVY      = '#1a3a5c';
const GOLD      = '#f0c040';
const GOLD_DARK = '#c9980a';
const MUTED     = 'rgba(0,0,0,0.45)';
const BORDER_CLR = '#e8e4d9';

export default function SearchCard() {
  const navigate = useNavigate();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [activeTab,   setActiveTab]   = useState('book');
  const [fromStation, setFromStation] = useState(null);
  const [toStation,   setToStation]   = useState(null);
  const [date,        setDate]        = useState(getTodayStr());
  const [classCode,   setClassCode]   = useState('');
  const [quota,       setQuota]       = useState('general');
  const [errors,      setErrors]      = useState({});
  const [isSearching, setIsSearching] = useState(false);
  const [swapRotate,  setSwapRotate]  = useState(false);

  // ── Swap stations ────────────────────────────────────────────────────────────
  function handleSwap() {
    setFromStation(toStation);
    setToStation(fromStation);
    setSwapRotate(r => !r);
  }

  // ── Search submission ────────────────────────────────────────────────────────
  function handleSearch(e) {
    e.preventDefault();
    const errs = {};
    if (!fromStation) errs.from = 'Select departure station';
    if (!toStation)   errs.to   = 'Select arrival station';
    if (fromStation && toStation && fromStation.code === toStation.code)
      errs.same = 'Departure and arrival cannot be the same';
    if (!date)        errs.date = 'Select a journey date';
    setErrors(errs);

    if (Object.keys(errs).length === 0) {
      setIsSearching(true);
      const params = new URLSearchParams({
        from: fromStation.code, to: toStation.code,
        fromName: fromStation.name, toName: toStation.name,
        date, quota, ...(classCode && { class: classCode }),
      });
      // 300ms delay makes the loading state visible before navigation.
      setTimeout(() => navigate(`/search-results?${params.toString()}`), 300);
    }
  }

  // ── Shared field styles ──────────────────────────────────────────────────────
  const fieldStyle = {
    padding: '12px 16px',
    borderBottom: `1px solid ${BORDER_CLR}`,
  };

  const labelStyle = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: MUTED,
    marginBottom: 6,
    display: 'block',
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  //
  // OUTER DIV: carries the slideInLeft animation.
  // The animation property creates a stacking context on this element.
  // Because it wraps the card, the card's children (including the dropdown)
  // are judged against THIS context — and nothing inside the card competes.
  //
  // INNER DIV (#search-card): position:relative (dropdown anchor) but NO
  // animation, NO z-index → does NOT create its own stacking context.
  // The dropdown's z-index:9999 therefore applies inside the outer wrapper's
  // context, floating above all card siblings freely.
  return (
    <div style={{ animation: 'slideInLeft 0.5s ease-out both', flexShrink: 0 }}>
      <div
        id="search-card"
        className="dark:bg-[#1a1a1a]"
        style={{
          width: 420,
          background: '#ffffff',
          borderRight: `1px solid ${BORDER_CLR}`,
          // position:relative — dropdown anchors to this bounding box.
          // NO z-index, NO animation → this div does NOT create a stacking
          // context, so the dropdown's z-index:9999 is free to float above
          // all flex siblings inside the card.
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >

        {/* ── TABS ROW ─────────────────────────────────────────────────────── */}
        {/* Darker navy tab bar (#0f2744) contrasts with the white card body.
            Active tab: white text + gold bottom border.
            Inactive tabs: disabled + muted — placeholders for future features. */}
        <div style={{ background: '#0f2744', display: 'flex', flexShrink: 0 }}>
          {[
            { key: 'book',   label: 'Book Ticket'    },
            { key: 'pnr',    label: 'PNR Status'     },
            { key: 'charts', label: 'Charts/Vacancy' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              disabled={tab.key !== 'book'}
              style={{
                padding: '10px 16px',
                fontSize: 12,
                fontWeight: 500,
                color: activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.45)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.key
                  ? `2px solid ${GOLD}` : '2px solid transparent',
                cursor: tab.key === 'book' ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── CARD TITLE ───────────────────────────────────────────────────── */}
        <div style={{
          padding: '16px 16px 10px',
          borderBottom: `1px solid ${BORDER_CLR}`,
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 15,
            fontWeight: 700,
            color: NAVY,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
            className="dark:text-[#f0c040]">
            Book Ticket
          </span>
        </div>

        <form onSubmit={handleSearch} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* ── FROM FIELD ────────────────────────────────────────────────── */}
          {/*
            NO isolation: isolate here.

            This wrapper must NOT create a stacking context. If it did, the
            dropdown (rendered as a child of StationAutocomplete, which is a
            child of this div) would be confined within this div's stacking
            context. The siblings below — swap row, To field, Date row — would
            all be in the CARD's stacking context and would paint over the
            dropdown in DOM order.

            By leaving this div stacking-context-free, the dropdown's z-index:9999
            is evaluated in the card's stacking context (which itself is clean —
            it has position:relative but no animation/z-index, so it inherits the
            outer wrapper's context). The dropdown floats above everything below it.

            overflow:visible (default) is also critical — overflow:hidden would clip
            the dropdown at this div's bottom edge regardless of z-index.
          */}
          <div style={fieldStyle} className="fade-up-1">
            <StationAutocomplete
              label="From"
              value={fromStation}
              onChange={setFromStation}
              excludeCode={toStation?.code}
              hasError={!!errors.from}
            />
            {errors.from && (
              <div style={{ color: '#c0392b', fontSize: 11, marginTop: 4 }}>{errors.from}</div>
            )}
          </div>

          {/* ── SWAP BUTTON ROW ───────────────────────────────────────────── */}
          {/*
            isolation: isolate — creates a stacking context for this row.

            Without this, the swap row (which comes AFTER the From field in DOM
            order) would paint over the From dropdown when they overlap vertically.
            isolation:isolate groups this row into its own painting unit. The From
            dropdown (z-index:9999, no isolation) is now clearly "above" this group.

            isolation:isolate does not affect layout or position — it only affects
            the CSS painter's algorithm. The row still occupies its normal flex slot.
          */}
          <div style={{
            padding: '4px 16px',
            borderBottom: `1px solid ${BORDER_CLR}`,
            display: 'flex',
            justifyContent: 'center',
            flexShrink: 0,
            isolation: 'isolate',
          }}>
            <button
              type="button"
              onClick={handleSwap}
              aria-label="Swap stations"
              style={{
                width: 28, height: 28,
                borderRadius: '50%',
                border: `1px solid ${BORDER_CLR}`,
                background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                transform: swapRotate ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.35s ease, background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0ede4'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="#666" strokeWidth="2.2" strokeLinecap="round">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 21l6-6" />
              </svg>
            </button>
          </div>

          {/* ── TO FIELD ──────────────────────────────────────────────────── */}
          {/*
            NO isolation: isolate here — same reasoning as the From field.

            The To field needs its own dropdown to float above the Date row and
            Quota row below it. If we gave this wrapper isolation:isolate, the To
            dropdown would be trapped inside and the Date/Quota rows (in the card
            stacking context) would paint over it.

            The swap row ABOVE the To field already has isolation:isolate, which
            prevents IT from painting over the From dropdown. The To field itself
            remains context-free so its dropdown can escape downward.
          */}
          <div style={fieldStyle} className="fade-up-2">
            <StationAutocomplete
              label="To"
              value={toStation}
              onChange={setToStation}
              excludeCode={fromStation?.code}
              hasError={!!errors.to || !!errors.same}
            />
            {errors.to && (
              <div style={{ color: '#c0392b', fontSize: 11, marginTop: 4 }}>{errors.to}</div>
            )}
            {errors.same && (
              <div style={{ color: '#c0392b', fontSize: 11, marginTop: 4 }}>{errors.same}</div>
            )}
          </div>

          {/* ── DATE + CLASS ROW ──────────────────────────────────────────── */}
          {/*
            isolation: isolate — this row must not paint over either dropdown.

            Both the From and To dropdowns can visually extend into this row's
            vertical space. Without isolation, this row (later in DOM order) paints
            on top. With isolation:isolate it forms a self-contained group that both
            dropdowns float above.
          */}
          <div className="fade-up-3" style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${BORDER_CLR}`,
            display: 'flex',
            gap: 12,
            isolation: 'isolate',
          }}>
            {/* Date field */}
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Date of Journey</label>
              <DatePicker value={date} onChange={setDate} minDate={getTodayStr()} maxDate={getMaxDateStr()} />
              {date && (
                <div style={{ fontSize: 11, color: NAVY, marginTop: 4 }}
                  className="dark:text-[#f0c040]">
                  {getDayName(date)}
                </div>
              )}
              {errors.date && (
                <div style={{ color: '#c0392b', fontSize: 11, marginTop: 4 }}>{errors.date}</div>
              )}
            </div>

            {/* Class field */}
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Class</label>
              <select
                value={classCode}
                onChange={e => setClassCode(e.target.value)}
                style={{
                  width: '100%',
                  border: `1px solid ${BORDER_CLR}`,
                  borderRadius: 4,
                  padding: '8px 32px 8px 10px',
                  fontSize: 13,
                  background: '#fff',
                  color: '#1a1a18',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2397948A' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  cursor: 'pointer',
                }}
              >
                <option value="">All Classes</option>
                <option value="SL">Sleeper (SL)</option>
                <option value="3A">Third AC (3A)</option>
                <option value="2A">Second AC (2A)</option>
                <option value="1A">First AC (1A)</option>
                <option value="CC">Chair Car (CC)</option>
              </select>
            </div>
          </div>

          {/* ── QUOTA ROW ─────────────────────────────────────────────────── */}
          {/*
            isolation: isolate — below both dropdowns, must not paint over them.
          */}
          <div className="fade-up-4" style={{
            padding: '8px 16px 12px',
            borderBottom: `1px solid ${BORDER_CLR}`,
            isolation: 'isolate',
          }}>
            <label style={labelStyle}>Quota</label>
            <div style={{ display: 'flex', gap: 0 }}>
              {[
                { key: 'general', label: 'General' },
                { key: 'tatkal',  label: 'Tatkal'  },
              ].map((q, i) => (
                <button
                  key={q.key}
                  type="button"
                  onClick={() => setQuota(q.key)}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    fontSize: 12,
                    fontWeight: quota === q.key ? 600 : 400,
                    background: quota === q.key ? NAVY : '#fff',
                    color: quota === q.key ? '#fff' : NAVY,
                    border: `1px solid ${quota === q.key ? NAVY : BORDER_CLR}`,
                    borderRadius: i === 0 ? '4px 0 0 4px' : '0 4px 4px 0',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {q.label}
                </button>
              ))}
            </div>

            {/* ⚡ Tatkal warning — shown only when Tatkal quota is active */}
            {quota === 'tatkal' && (
              <div style={{
                marginTop: 8,
                fontSize: 10,
                color: '#b45309',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                ⚡ Higher fare · No refund on cancellation
              </div>
            )}
          </div>

          {/* ── SEARCH BUTTON ─────────────────────────────────────────────── */}
          {/*
            isolation: isolate — lowest element, below all dropdowns.

            WHY GOLD BUTTON WITH DARK TEXT?
            Gold (#f0c040) on dark navy creates a strong visual contrast.
            Dark text (#1a1a18) on gold: ~8:1 contrast ratio.
            White on gold: only ~2.5:1 (fails WCAG AA). Dark text wins.
          */}
          <div className="fade-up-5" style={{
            padding: '12px 16px',
            marginTop: 'auto',
            isolation: 'isolate',
          }}>
            <button
              type="submit"
              disabled={isSearching}
              className="btn-search"
              style={{
                width: '100%',
                background: isSearching ? '#c9980a' : GOLD,
                color: '#1a1a18',
                fontWeight: 700,
                fontSize: 14,
                borderRadius: 4,
                padding: '12px 0',
                border: 'none',
                cursor: isSearching ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!isSearching) e.currentTarget.style.background = GOLD_DARK; }}
              onMouseLeave={e => { if (!isSearching) e.currentTarget.style.background = GOLD; }}
            >
              {isSearching ? (
                <>
                  <div style={{
                    width: 14, height: 14,
                    border: '2px solid rgba(26,26,24,0.2)',
                    borderTop: '2px solid #1a1a18',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  🚂 Finding trains
                  <span style={{ display: 'flex' }}>
                    <span className="dot-1">.</span>
                    <span className="dot-2">.</span>
                    <span className="dot-3">.</span>
                  </span>
                </>
              ) : (
                <>🔍 Search Trains</>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
