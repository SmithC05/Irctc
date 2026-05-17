// NammaRail — Popular Routes Section
import { motion } from 'framer-motion';
import { ArrowRight, Clock, Train, IndianRupee } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ease = [0.22, 1, 0.36, 1];

const routes = [
  { from: 'Chennai',    fromCode: 'MAS',  to: 'Bengaluru', toCode: 'SBC',  duration: '5h 30m',  trains: '14/day', fare: '285',  tag: 'Most Popular'      },
  { from: 'Madurai',    fromCode: 'MDU',  to: 'Chennai',   toCode: 'MAS',  duration: '8h 15m',  trains: '9/day',  fare: '340',  tag: 'Frequently Booked' },
  { from: 'Coimbatore', fromCode: 'CBE',  to: 'Hyderabad', toCode: 'HYB',  duration: '14h 40m', trains: '5/day',  fare: '680',  tag: 'Long Distance'     },
  { from: 'Mumbai',     fromCode: 'CSMT', to: 'Delhi',     toCode: 'NDLS', duration: '17h 00m', trains: '12/day', fare: '990',  tag: 'Premier Route'     },
  { from: 'Kolkata',    fromCode: 'HWH',  to: 'Patna',     toCode: 'PNBE', duration: '6h 10m',  trains: '18/day', fare: '210',  tag: 'Budget Friendly'   },
  { from: 'Pune',       fromCode: 'PUNE', to: 'Goa',       toCode: 'MAO',  duration: '10h 45m', trains: '4/day',  fare: '510',  tag: 'Weekend Favourite' },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.48, ease } },
};

function RouteCard({ route }) {
  const navigate = useNavigate();

  function handleBook() {
    // Pre-fill the search by navigating home with query params isn't possible
    // without knowing a real train number — so we navigate home for the user to search.
    navigate('/');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -4, boxShadow: 'var(--shadow-card-hover)' }}
      transition={{ duration: 0.22, ease }}
      className="rounded-2xl p-5 flex flex-col gap-4 group"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
        transition: 'border-color 0.2s ease',
        cursor: 'pointer',
      }}
      onClick={handleBook}
      role="button"
      tabIndex={0}
      aria-label={`Search trains from ${route.from} to ${route.to}`}
      onKeyDown={e => e.key === 'Enter' && handleBook()}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--border) 30%, var(--brand) 70%)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      {/* Tag pill */}
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.07em] px-2 py-1 rounded-full"
          style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}
        >
          {route.tag}
        </span>
        {/* Trains per day badge */}
        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          <Train size={10} strokeWidth={2} />
          {route.trains}
        </span>
      </div>

      {/* Route row */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider mb-0.5"
            style={{ color: 'var(--text-tertiary)' }}>{route.fromCode}</p>
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {route.from}
          </p>
        </div>

        {/* Arrow connector */}
        <div className="flex items-center gap-1 flex-shrink-0 px-1">
          <div className="w-4 h-px" style={{ backgroundColor: 'var(--border)' }} />
          <ArrowRight
            size={13}
            strokeWidth={2.5}
            style={{
              color: 'var(--brand)',
              transition: 'transform 0.2s ease',
            }}
            className="group-hover:translate-x-0.5"
          />
          <div className="w-4 h-px" style={{ backgroundColor: 'var(--border)' }} />
        </div>

        <div className="flex-1 min-w-0 text-right">
          <p className="text-[11px] font-bold uppercase tracking-wider mb-0.5"
            style={{ color: 'var(--text-tertiary)' }}>{route.toCode}</p>
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {route.to}
          </p>
        </div>
      </div>

      {/* Meta footer */}
      <div className="h-px" style={{
        background: 'linear-gradient(to right, transparent, var(--border), transparent)',
      }} />
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          <Clock size={10} strokeWidth={2} />
          {route.duration}
        </span>
        <span className="flex items-center gap-0.5 text-[12px] font-bold"
          style={{ color: 'var(--brand)' }}>
          <IndianRupee size={10} strokeWidth={2.5} />
          {route.fare}
          <span className="text-[10px] font-normal ml-0.5" style={{ color: 'var(--text-tertiary)' }}>
            onwards
          </span>
        </span>
      </div>
    </motion.div>
  );
}

export default function PopularRoutes() {
  return (
    <section className="py-14 md:py-20" aria-labelledby="popular-routes-heading">
      {/* Top divider */}
      <div className="section-divider mb-14" />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease }}
        className="text-center mb-10"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2.5"
          style={{ color: 'var(--brand)' }}>Trending</p>
        <h2 id="popular-routes-heading"
          className="text-2xl sm:text-3xl font-bold mb-3"
          style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
          Popular Routes
        </h2>
        <p className="text-[14px] sm:text-[15px] max-w-sm mx-auto leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}>
          Most-booked journeys on NammaRail — tap any route to start searching.
        </p>
      </motion.div>

      {/* Cards grid */}
      <motion.div
        variants={containerVariants} initial="hidden"
        whileInView="show" viewport={{ once: true, margin: '-40px' }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5"
      >
        {routes.map((r, i) => <RouteCard key={i} route={r} />)}
      </motion.div>
    </section>
  );
}
