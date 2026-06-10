// =============================================================================
// NammaRail — StatsBar (Full-width 3-column stats)
// =============================================================================
//
// Fetches live stats from GET /api/trains/stats.
// Falls back to hardcoded values if the API fails — we never show zeros.
//
// WHY THE PREVIOUS VERSION SHOWED 0 FOR STOPS AND FARES:
// ─────────────────────────────────────────────────────────────────────────────
// The old useCountUp hook returned its own `ref` per counter. Only the first
// counter's ref (trains) was attached to the DOM. The other two hooks' refs
// were detached — their IntersectionObservers never saw the element enter the
// viewport, so their animations never fired and they stayed at 0.
//
// THE FIX — single shared IntersectionObserver:
// We attach ONE ref to the container div. A single IntersectionObserver watches
// that ref. When it triggers, we flip a shared `animated` state flag. All three
// useCountUp calls receive `animated` as the `shouldStart` param and start
// simultaneously when it becomes true.
//
// COUNT-UP ANIMATION:
// IntersectionObserver fires the animation only when the bar enters the viewport.
// Starting count-up immediately on page load would waste it if the user never
// scrolls down. IntersectionObserver ensures the animation plays exactly when
// the user first sees the numbers.
//
// INDIAN NUMBER FORMAT:
// India groups numbers differently: 3,26,643 (not 326,643).
// First group from right = 3 digits, subsequent groups = 2 digits.
// toLocaleString('en-IN') handles this automatically.
// Example: 326643 → "3,26,643"
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { getStats } from '../../api/trainApi';

const easeOut = t => 1 - Math.pow(1 - t, 3);

// useCountUp — counts from 0 to `target` over `duration` ms,
// but only starts when `shouldStart` becomes true.
// This decouples "when to start" from the hook itself.
function useCountUp(target, duration, shouldStart) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Guard: don't start if the trigger hasn't fired, or if target is still 0
    // (which happens before the API response arrives).
    if (!shouldStart || target === 0) return;

    let startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(easeOut(progress) * target));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  // Re-run if target changes (e.g. API response arrives after animated is true)
  // or if shouldStart flips to true.
  }, [target, shouldStart, duration]);

  return count;
}

// ── StatItem ──────────────────────────────────────────────────────────────────
function StatItem({ number, label, isLast }) {
  // toLocaleString('en-IN') gives Indian number grouping:
  //   326643 → "3,26,643"  (not "326,643")
  const formatted = number.toLocaleString('en-IN');

  return (
    <div style={{
      padding: '14px 12px',
      textAlign: 'center',
      borderRight: isLast ? 'none' : '1px solid #e8dfc8',
    }}>
      <div
        style={{ fontSize: 20, fontWeight: 700, color: '#1a3a5c', lineHeight: 1.2 }}
        className="dark:text-[#f0c040]"
      >
        {formatted}
      </div>
      <div style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#888',
        marginTop: 4,
      }}>
        {label}
      </div>
    </div>
  );
}

// ── StatsBar ──────────────────────────────────────────────────────────────────
export default function StatsBar() {
  const [stats, setStats]       = useState({ trainCount: 0, stationCount: 0, fareCount: 0 });
  const [animated, setAnimated] = useState(false);
  // ONE shared ref — attached to the grid container.
  // ONE IntersectionObserver watches it, flips `animated` once, then disconnects.
  const containerRef = useRef(null);

  // ── Fetch stats from API ─────────────────────────────────────────────────
  useEffect(() => {
    getStats()
      .then(res => {
        // res.data = { trainCount, stationCount, fareCount }
        setStats(res.data);
      })
      .catch(() => {
        // Fallback — never show zeros to the user
        setStats({ trainCount: 3292, stationCount: 71056, fareCount: 326643 });
      });
  }, []);

  // ── Single IntersectionObserver — shared by all three counters ───────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated) {
          setAnimated(true);
          observer.disconnect(); // fire once only
        }
      },
      { threshold: 0.5 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  // animated is in deps so we stop observing if it gets set to true
  }, [animated]);

  // ── Three count-up hooks, all sharing the same `animated` trigger ────────
  const trains = useCountUp(stats.trainCount,   2000, animated);
  const stops  = useCountUp(stats.stationCount, 2200, animated);
  const fares  = useCountUp(stats.fareCount,    2500, animated);

  const items = [
    { value: trains, label: 'Trains in Database' },
    { value: stops,  label: 'Station Stops'       },
    { value: fares,  label: 'Fare Records'         },
  ];

  return (
    <div
      ref={containerRef}
      className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]"
      style={{
        background: '#f5f0e6',
        borderTop: '1px solid #e8dfc8',
        borderBottom: '1px solid #e8dfc8',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
      }}
    >
      {items.map((item, i) => (
        <StatItem
          key={i}
          number={item.value}
          label={item.label}
          isLast={i === items.length - 1}
        />
      ))}
    </div>
  );
}
