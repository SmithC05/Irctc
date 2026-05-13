// =============================================================================
// NammaRail — Passenger Form Page
// =============================================================================
//
// REACT ROUTER location.state:
// ─────────────────────────────────────────────────────────────────────────────
// When you call navigate('/passengers', { state: { ... } }), React Router
// stores the state object in the browser's History entry for that page.
// The receiving page reads it via useLocation().state.
//
// ✅ Pros: clean, no URL pollution, handles complex objects (fare breakdown, etc.)
// ⚠️ Cons: state is LOST on page refresh. For a checkout flow this is fine —
//    the user should restart the flow if they refresh. If they need to
//    bookmark/share the page, use query params or a server-stored draft instead.
//
// BOOKING TYPE TOGGLE (useState):
// ─────────────────────────────────────────────────────────────────────────────
// A "toggle" between Normal and Tatkal is just a boolean stored in useState.
// When the user clicks "Tatkal", we set bookingType to 'tatkal'.
// The fare displayed in the summary updates reactively because it reads
// from the same state — no extra event handler needed.
// =============================================================================

import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { createBooking } from '../api/bookingApi';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/layout/Layout';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PASSENGERS  = 6;
const GENDERS         = ['Male', 'Female', 'Other'];
const emptyPassenger  = () => ({ name: '', age: '', gender: 'Male' });

const CLASS_LABELS = {
  '1A': 'First AC', '2A': 'Second AC', '3A': 'Third AC',
  'SL': 'Sleeper',  'CC': 'Chair Car', '2S': 'Second Sitting',
};

// ─── Booking Summary Card ─────────────────────────────────────────────────────

function BookingSummary({ booking, passengers, bookingType }) {
  if (!booking) return null;
  const fare       = bookingType === 'tatkal' && booking.fare?.tatkal_fare > 0
    ? booking.fare.tatkal_fare
    : booking.fare?.total_fare ?? 0;
  const count      = passengers.filter(p => p.name.trim()).length || 1;
  const total      = fare * count;

  return (
    <div className="card p-5">
      <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--brand)' }}>
        Booking Summary
      </p>
      <p className="font-bold text-sm mb-0.5" style={{ color: 'var(--text-primary)' }}>{booking.trainName}</p>
      <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>#{booking.trainNumber}</p>

      <div className="flex flex-col gap-1.5 text-sm border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <Row label="From → To" value={`${booking.fromStation} → ${booking.toStation}`} />
        <Row label="Date"      value={booking.journeyDate} />
        <Row label="Class"     value={CLASS_LABELS[booking.classCode] ?? booking.classCode} />
        <Row label="Type"      value={bookingType === 'tatkal' ? '⚡ Tatkal' : 'Normal'} />
        <Row label="Fare/pax"  value={`₹${fare}`} />
      </div>

      <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Total</span>
        <span className="text-lg font-bold" style={{ color: 'var(--brand)' }}>₹{total}</span>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="font-medium text-right" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

// ─── Passenger Row ────────────────────────────────────────────────────────────

function PassengerRow({ index, pax, onChange, onRemove, canRemove }) {
  return (
    <div className="p-4 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-tertiary)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold" style={{ color: 'var(--brand)' }}>Passenger {index + 1}</p>
        {canRemove && (
          <button onClick={() => onRemove(index)} className="text-red-500 hover:text-red-700 text-lg leading-none">×</button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3 sm:col-span-1">
          <label className="form-label">Full Name</label>
          <input
            value={pax.name}
            onChange={e => onChange(index, 'name', e.target.value)}
            placeholder="Name"
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Age</label>
          <input
            type="number"
            value={pax.age}
            onChange={e => onChange(index, 'age', e.target.value)}
            placeholder="Age"
            min={1} max={125}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Gender</label>
          <select
            value={pax.gender}
            onChange={e => onChange(index, 'gender', e.target.value)}
            className="form-input"
          >
            {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PassengerFormPage() {
  const { state }    = useLocation();
  const navigate     = useNavigate();
  const { user, isLoggedIn } = useAuth();

  const [passengers,   setPassengers]  = useState([emptyPassenger()]);
  const [bookingType,  setBookingType] = useState(state?.bookingType ?? 'normal');
  const [phone,        setPhone]       = useState('');
  const [agreed,       setAgreed]      = useState(false);
  const [isLoading,    setLoading]     = useState(false);
  const [error,        setError]       = useState('');

  // Guard: if no booking state (user navigated directly), go home
  if (!state?.trainNumber) return <Navigate to="/" replace />;
  if (!isLoggedIn)          return <Navigate to="/login" replace />;

  function updatePassenger(idx, field, value) {
    setPassengers(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function addPassenger() {
    if (passengers.length < MAX_PASSENGERS) setPassengers(p => [...p, emptyPassenger()]);
  }

  function removePassenger(idx) {
    setPassengers(p => p.filter((_, i) => i !== idx));
  }

  const allFilled = passengers.every(p => p.name.trim() && p.age);
  const canSubmit = allFilled && agreed && !isLoading;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');

    try {
      const res = await createBooking({
        trainNumber:  state.trainNumber,
        fromStation:  state.fromStation,
        toStation:    state.toStation,
        journeyDate:  state.journeyDate,
        classCode:    state.classCode,
        bookingType,
        passengers:   passengers.map(p => ({
          name:   p.name.trim(),
          age:    parseInt(p.age),
          gender: p.gender[0], // "M" / "F" / "O"
        })),
      });

      navigate(`/booking-confirmation/${res.data.bookingIds?.[0] ?? 'ok'}`, {
        state: {
          bookingData:  res.data,
          bookingMeta:  state,
          passengers,
          bookingType,
        },
      });
    } catch (err) {
      setError(err.response?.data?.error ?? 'Booking failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row gap-5">
        {/* LEFT — form */}
        <div className="flex-1 min-w-0">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Passengers */}
            <div className="card p-5">
              <p className="font-bold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
                Passenger Details
              </p>
              <div className="flex flex-col gap-3">
                {passengers.map((pax, idx) => (
                  <PassengerRow
                    key={idx}
                    index={idx}
                    pax={pax}
                    onChange={updatePassenger}
                    onRemove={removePassenger}
                    canRemove={passengers.length > 1}
                  />
                ))}
              </div>
              {passengers.length < MAX_PASSENGERS && (
                <button type="button" onClick={addPassenger} className="btn-outline text-sm mt-4">
                  + Add Passenger
                </button>
              )}
            </div>

            {/* Booking type toggle */}
            <div className="card p-5">
              <p className="font-bold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Booking Type</p>
              <div className="flex rounded-lg border overflow-hidden w-fit" style={{ borderColor: 'var(--border)' }}>
                {['normal', 'tatkal'].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setBookingType(type)}
                    className="px-6 py-2 text-sm font-semibold transition-all capitalize"
                    style={{
                      backgroundColor: bookingType === type ? 'var(--brand)' : 'transparent',
                      color: bookingType === type ? 'white' : 'var(--text-secondary)',
                    }}
                  >
                    {type === 'tatkal' ? '⚡ Tatkal' : 'Normal'}
                  </button>
                ))}
              </div>
              {bookingType === 'tatkal' && (
                <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                  ⚠️ Tatkal tickets are <strong>non-refundable</strong> on cancellation.
                </p>
              )}
            </div>

            {/* Contact */}
            <div className="card p-5">
              <p className="font-bold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Contact Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Phone</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="10-digit mobile" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input value={user?.email ?? ''} readOnly className="form-input opacity-60 cursor-not-allowed" />
                </div>
              </div>
            </div>

            {/* Terms + submit */}
            <div className="card p-5">
              <label className="flex items-start gap-3 cursor-pointer mb-4">
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 accent-amber-600 w-4 h-4" />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  I agree to the <span className="underline cursor-pointer" style={{ color: 'var(--brand)' }}>cancellation and refund policy</span>
                </span>
              </label>
              {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
              <button type="submit" disabled={!canSubmit} className="btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed">
                {isLoading ? 'Confirming…' : 'Confirm Booking'}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT — sticky summary */}
        <div className="lg:w-72 shrink-0">
          <BookingSummary booking={state} passengers={passengers} bookingType={bookingType} />
        </div>
      </div>
    </Layout>
  );
}
