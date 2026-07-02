import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Layout from '../components/layout/Layout';

export default function Chart() {
  const [trainNumber, setTrainNumber] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chart, setChart] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!trainNumber.trim() || !date) return;

    setLoading(true);
    setError(null);
    setChart(null);

    try {
      const headers = {};
      const token = localStorage.getItem('token');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`http://localhost:5000/api/chart/${trainNumber.trim()}/${date}`, {
        headers
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch Chart');
      }

      setChart(data.chart);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-12 px-4">
        <h1 className="text-4xl font-bold mb-8 text-center" style={{ fontFamily: 'var(--font-slab)', color: 'var(--tk-navy)' }}>
          Reservation Chart
        </h1>

        <div className="tk-card p-8 mb-8">
          <form onSubmit={handleSearch} className="flex gap-4">
            <input
              type="text"
              placeholder="Train Number"
              value={trainNumber}
              onChange={(e) => setTrainNumber(e.target.value)}
              className="flex-1 px-4 py-3 border rounded font-mono text-lg"
              style={{ borderColor: 'var(--tk-sand-dark)' }}
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 px-4 py-3 border rounded text-lg"
              style={{ borderColor: 'var(--tk-sand-dark)' }}
            />
            <button
              type="submit"
              disabled={loading || !trainNumber.trim() || !date}
              className="tk-btn tk-btn-primary px-8 font-bold tracking-widest uppercase"
            >
              {loading ? 'Searching...' : 'View Chart'}
            </button>
          </form>
          {error && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 rounded" style={{ background: 'var(--tk-signal-red)', color: 'white' }}>
              {error}
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {chart && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tk-card p-8">
              <h3 className="text-lg font-bold mb-4 uppercase tracking-widest" style={{ color: 'var(--tk-ink-muted)' }}>Confirmed & Waitlisted Passengers</h3>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Age/Sex</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Seat</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {chart.length === 0 && (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-gray-500">No passengers found for this train and date.</td>
                      </tr>
                    )}
                    {chart.map((pax, idx) => (
                      <tr key={idx}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {pax.passenger_name.length > 2 
                            ? pax.passenger_name.substring(0, 2) + '*'.repeat(pax.passenger_name.length - 2) 
                            : pax.passenger_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pax.passenger_age} / {pax.passenger_gender}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold">{pax.seat_number || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" style={{
                            background: pax.status === 'CNF' ? 'var(--tk-signal-green)' : (pax.status.startsWith('RAC') ? 'var(--tk-signal-amber)' : 'var(--tk-signal-red)'),
                            color: pax.status === 'CNF' ? 'black' : 'white'
                          }}>
                            {pax.status}
                          </span>
                        </td>
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
