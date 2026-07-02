import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Layout from '../components/layout/Layout';

export default function PNRStatus() {
  const [pnr, setPnr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!pnr.trim()) return;

    setLoading(true);
    setError(null);
    setBooking(null);

    try {
      // Allow searching with or without auth, but we pass token if we have it
      const headers = {};
      const token = localStorage.getItem('token');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`http://localhost:5000/api/pnr/${pnr.trim()}`, {
        headers
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch PNR');
      }

      setBooking(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-12 px-4">
        <h1 className="text-4xl font-bold mb-8 text-center" style={{ fontFamily: 'var(--font-slab)', color: 'var(--tk-navy)' }}>
          PNR Status
        </h1>

        <div className="tk-card p-8 mb-8">
          <form onSubmit={handleSearch} className="flex gap-4">
            <input
              type="text"
              placeholder="Enter 10-digit PNR Number"
              value={pnr}
              onChange={(e) => setPnr(e.target.value)}
              className="flex-1 px-4 py-3 border rounded font-mono text-lg"
              style={{ borderColor: 'var(--tk-sand-dark)' }}
              maxLength={15}
            />
            <button
              type="submit"
              disabled={loading || !pnr.trim()}
              className="tk-btn tk-btn-primary px-8 font-bold tracking-widest uppercase"
            >
              {loading ? 'Searching...' : 'Check Status'}
            </button>
          </form>
          {error && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 rounded" style={{ background: 'var(--tk-signal-red)', color: 'white' }}>
              {error}
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {booking && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tk-card p-8">
              <div className="flex justify-between items-center mb-6 border-b pb-4" style={{ borderColor: 'var(--tk-sand-dark)' }}>
                <div>
                  <h2 className="text-xl font-bold uppercase" style={{ color: 'var(--tk-ink-muted)' }}>PNR Number</h2>
                  <p className="text-3xl font-mono font-bold" style={{ color: 'var(--tk-navy)' }}>{booking.pnrNumber}</p>
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-bold uppercase" style={{ color: 'var(--tk-ink-muted)' }}>Train</h2>
                  <p className="text-3xl font-mono font-bold" style={{ color: 'var(--tk-navy)' }}>{booking.trainId}</p>
                </div>
              </div>

              <div className="flex justify-between items-center mb-8 bg-gray-50 p-4 rounded-lg">
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">From</p>
                  <p className="text-2xl font-bold">{booking.fromStation}</p>
                </div>
                <div className="text-center px-4 flex-1">
                  <div className="border-t-2 border-dashed border-gray-300 relative top-3"></div>
                  <span className="bg-gray-50 px-2 relative z-10 text-sm font-bold text-gray-400">{booking.journeyDate} • {booking.classCode}</span>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">To</p>
                  <p className="text-2xl font-bold">{booking.toStation}</p>
                </div>
              </div>

              <h3 className="text-lg font-bold mb-4 uppercase tracking-widest" style={{ color: 'var(--tk-ink-muted)' }}>Passenger Details</h3>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Age/Sex</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Seat</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {booking.passengers.map((pax, idx) => (
                      <tr key={idx}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{idx + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{pax.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pax.age} / {pax.gender}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" style={{
                            background: pax.status === 'CNF' ? 'var(--tk-signal-green)' : (pax.status.startsWith('RAC') ? 'var(--tk-signal-amber)' : 'var(--tk-signal-red)'),
                            color: pax.status === 'CNF' ? 'black' : 'white'
                          }}>
                            {pax.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold">{pax.seatNumber || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
