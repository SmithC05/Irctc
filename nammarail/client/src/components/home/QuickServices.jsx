// =============================================================================
// NammaRail — QuickServices (4-card quick links, full width)
// =============================================================================

import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SERVICES = [
  { emoji: '🎫', label: 'Book Ticket',     action: 'scroll' },
  { emoji: '📋', label: 'PNR Status',      action: 'toast',  toast: 'PNR Status — coming soon' },
  { emoji: '🚉', label: 'Train Schedule',  action: 'toast',  toast: 'Train Schedule — coming soon' },
  { emoji: '❌', label: 'Cancel Ticket',   action: 'nav',    to: '/my-bookings' },
];

export default function QuickServices() {
  const navigate = useNavigate();
  const ref = useRef(null);
  const [toast, setToast] = useState('');
  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Fade in when scrolled into view
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('qs-visible');
        observer.disconnect();
      }
    }, { threshold: 0.1 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  function handleClick(svc) {
    if (svc.action === 'scroll') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (svc.action === 'toast') {
      setToast(svc.toast);
      setTimeout(() => setToast(''), 2500);
    } else if (svc.action === 'nav') {
      navigate(svc.to);
    }
  }

  return (
    <div style={{ padding: '16px 24px 20px' }}>
      <h2 style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: '#888',
        marginBottom: 12,
        fontWeight: 600,
      }}>
        Quick Services
      </h2>

      {/* 4 cards — 1 row on desktop, 2×2 on mobile */}
      <div ref={ref} className="qs-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 10,
        opacity: 0,
        transition: 'opacity 0.5s ease',
      }}>
        {SERVICES.map((svc, i) => (
          <button
            key={svc.label}
            onClick={() => handleClick(svc)}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{
              border: `1px solid ${hoveredIdx === i ? '#1a3a5c' : '#e8e4d9'}`,
              borderRadius: 4,
              padding: '14px 10px',
              textAlign: 'center',
              cursor: 'pointer',
              background: hoveredIdx === i ? 'rgba(26,58,92,0.04)' : '#fff',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
            className="dark:bg-[#1e1c15] dark:border-[#302e22]"
          >
            <span style={{ fontSize: 22 }}>{svc.emoji}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a18' }}
              className="dark:text-gray-200">
              {svc.label}
            </span>
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0f2744',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: 6,
          fontSize: 13,
          zIndex: 9999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
