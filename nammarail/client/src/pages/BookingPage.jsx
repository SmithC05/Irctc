// =============================================================================
// NammaRail — Booking Page (Shell)
// =============================================================================

import Layout from '../components/layout/Layout';

export default function BookingPage() {
  return (
    <Layout>
      <div className="card p-10 text-center">
        <div className="text-4xl mb-4">🎫</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Booking Page
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Passenger form and seat selection coming soon.
        </p>
      </div>
    </Layout>
  );
}
