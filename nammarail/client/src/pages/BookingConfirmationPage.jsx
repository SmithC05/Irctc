// =============================================================================
// NammaRail — Booking Confirmation Page ("Ticket" page)
// =============================================================================

import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import StatusBadge from '../components/ui/StatusBadge';
import Layout from '../components/layout/Layout';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CLASS_LABELS = {
  '1A': 'First AC', '2A': 'Second AC', '3A': 'Third AC',
  'SL': 'Sleeper',  'CC': 'Chair Car', '2S': 'Second Sitting',
};

function FareRow({ label, value, bold }) {
  return (
    <div className={`flex justify-between gap-2 py-1.5 ${bold ? 'border-t mt-1 pt-2.5' : ''}`}
      style={{ borderColor: 'var(--border)' }}>
      <span className={bold ? 'font-bold' : 'text-sm'} style={{ color: bold ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
        {label}
      </span>
      <span className={bold ? 'font-bold text-lg' : 'text-sm font-medium'} style={{ color: bold ? 'var(--brand)' : 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

// ─── Ticket Header (gold strip) ───────────────────────────────────────────────

function TicketHeader({ passengers, pnr }) {
  const hasWL  = passengers.some(p => p.status?.toUpperCase().startsWith('WL'));
  const hasRAC = passengers.some(p => p.status?.toUpperCase().startsWith('RAC'));
  const allCNF = passengers.every(p => p.status?.toUpperCase() === 'CNF');

  return (
    <div className="rounded-t-xl px-6 py-5 text-white" style={{ background: 'linear-gradient(135deg, var(--brand), var(--brand-hover))' }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold opacity-80 mb-0.5">🚆 NammaRail</p>
          <h1 className="text-xl font-bold">
            {allCNF ? '✅ Booking Confirmed' : hasWL ? '⏳ Booking Received (WL)' : '🟡 Booking Received'}
          </h1>
          <p className="text-sm opacity-80 mt-1">PNR: <span className="font-mono font-bold tracking-widest">{pnr}</span></p>
        </div>
        {hasRAC || hasWL ? (
          <div className="text-right text-xs opacity-80 max-w-[120px]">
            Check status before travel
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BookingConfirmationPage() {
  const { state }  = useLocation();
  const navigate   = useNavigate();

  if (!state?.bookingData) return <Navigate to="/" replace />;

  const { bookingData, bookingMeta, passengers, bookingType } = state;
  const bookingPassengers = bookingData.passengers ?? [];
  const pnr = (bookingData.bookingIds?.[0] ?? '').toUpperCase().slice(0, 8);

  const fare        = bookingMeta?.fare;
  const totalFare   = fare
    ? (bookingType === 'tatkal' && fare.tatkal_fare > 0 ? fare.tatkal_fare : fare.total_fare) * passengers.length
    : 0;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Ticket card */}
        <div className="rounded-xl overflow-hidden shadow-card-hover mb-5" style={{ border: '1px solid var(--border)' }}>
          <TicketHeader passengers={bookingPassengers} pnr={pnr} />

          {/* Ticket body */}
          <div className="p-5 md:p-6" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {/* Train info */}
            <div className="mb-5">
              <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{bookingMeta?.trainName}</p>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>#{bookingMeta?.trainNumber}</p>
            </div>

            {/* Route row */}
            <div className="flex items-center gap-4 mb-5 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <div className="text-center">
                <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fare?.['departure_time'] ?? bookingMeta?.fromStation}</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>{bookingMeta?.fromStation}</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>{bookingMeta?.journeyDate}</p>
                <div className="flex items-center gap-1">
                  <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: 'var(--border)' }} />
                  <span className="text-xs">→</span>
                  <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: 'var(--border)' }} />
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {CLASS_LABELS[bookingMeta?.classCode] ?? bookingMeta?.classCode} · {bookingType === 'tatkal' ? '⚡ Tatkal' : 'Normal'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{bookingMeta?.toStation}</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>{bookingMeta?.toStation}</p>
              </div>
            </div>

            {/* Passenger table */}
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--brand)' }}>Passengers</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                      <th className="text-left pb-2 font-semibold">Name</th>
                      <th className="text-center pb-2 font-semibold">Age</th>
                      <th className="text-center pb-2 font-semibold">Gender</th>
                      <th className="text-center pb-2 font-semibold">Seat</th>
                      <th className="text-right pb-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookingPassengers.map((p, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-2 font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</td>
                        <td className="py-2 text-center" style={{ color: 'var(--text-secondary)' }}>{p.age}</td>
                        <td className="py-2 text-center" style={{ color: 'var(--text-secondary)' }}>{p.gender}</td>
                        <td className="py-2 text-center font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {p.seat_number ?? '—'}
                        </td>
                        <td className="py-2 text-right">
                          <StatusBadge status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Fare breakdown */}
            {fare && (
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--brand)' }}>Fare Breakdown</p>
                <FareRow label={`Base fare × ${passengers.length}`} value={`₹${fare.base_fare * passengers.length}`} />
                <FareRow label="Reservation charge"                  value={`₹${fare.reservation_charge}`} />
                <FareRow label="Superfast charge"                    value={`₹${fare.superfast_charge}`} />
                <FareRow label="Service tax"                         value={`₹${fare.service_tax}`} />
                <FareRow label="Total"                               value={`₹${totalFare}`} bold />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => alert('Download ticket — coming soon!')}
                className="btn-outline flex-1 py-3"
              >
                ↓ Download Ticket
              </button>
              <button
                onClick={() => navigate('/my-bookings')}
                className="btn-primary flex-1 py-3"
              >
                View All Bookings
              </button>
            </div>
          </div>
        </div>

        {/* Notices */}
        <div className="rounded-xl p-4 text-sm bg-amber-50 border border-amber-200 text-amber-800
          dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
          <p className="font-semibold mb-1">📋 Important Information</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Carry a valid government-issued photo ID during travel.</li>
            <li>Ticket is valid only for the booked passengers.</li>
            {bookingPassengers.some(p => p.status?.startsWith('WL')) && (
              <li className="font-semibold">
                WL tickets are not confirmed. Check status before travel. Full refund if not confirmed.
              </li>
            )}
            {bookingType === 'tatkal' && (
              <li className="font-semibold">Tatkal tickets are non-refundable on cancellation.</li>
            )}
          </ul>
        </div>
      </div>
    </Layout>
  );
}
