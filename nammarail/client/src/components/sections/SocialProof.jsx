// NammaRail — Platform Stats + Testimonials Section
import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

const ease = [0.22, 1, 0.36, 1];

const stats = [
  { value: '2.4M+',  label: 'Bookings Processed' },
  { value: '8,500+', label: 'Routes Covered'      },
  { value: '620K+',  label: 'Active Travellers'   },
  { value: '980+',   label: 'Train Partners'       },
];

function StatCard({ value, label, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.44, ease, delay: index * 0.07 }}
      whileHover={{ y: -2, boxShadow: 'var(--shadow-card-hover)' }}
      className="text-center py-7 px-5 rounded-2xl"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
        transition: 'border-color 0.2s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--border) 40%, var(--brand) 60%)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <p className="text-3xl sm:text-4xl font-bold mb-2 tracking-tight"
        style={{
          backgroundImage: 'var(--brand-gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: '-0.03em',
        }}>
        {value}
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em]"
        style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </p>
    </motion.div>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────
const testimonials = [
  {
    name: 'Priya Ramesh',
    role: 'Software Engineer, Bangalore',
    quote: "Finally a booking platform that doesn't feel like it's from 2010. Booked Chennai to Bangalore in under two minutes.",
    rating: 5, initials: 'PR',
  },
  {
    name: 'Karthik Selvam',
    role: 'Business Analyst, Chennai',
    quote: "The intermediate stop search is a game changer. Found a train others said didn't exist. Impressive.",
    rating: 5, initials: 'KS',
  },
  {
    name: 'Ananya Iyer',
    role: 'Postgraduate Student, Madurai',
    quote: "Tatkal booking was seamless and the no-refund warning upfront is appreciated. Honest and clean UX.",
    rating: 4, initials: 'AI',
  },
];

function StarRating({ count }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={12} strokeWidth={0}
          fill={i < count ? 'var(--brand)' : 'var(--border)'} />
      ))}
    </div>
  );
}

function TestimonialCard({ name, role, quote, rating, initials, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.48, ease, delay: index * 0.08 }}
      className="rounded-2xl p-6 flex flex-col gap-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <StarRating count={rating} />
        {/* Decorative quote mark */}
        <Quote size={16} strokeWidth={1.5} style={{ color: 'var(--border)', flexShrink: 0 }} />
      </div>

      <p className="text-[13px] leading-relaxed flex-1"
        style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
        {quote}
      </p>

      {/* Author row */}
      <div className="flex items-center gap-3 pt-1 mt-auto">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
                     text-xs font-bold"
          style={{ background: 'var(--brand-gradient)', color: 'var(--text-inverted)' }}
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {name}
          </p>
          <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
            {role}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export default function SocialProof() {
  return (
    <>
      {/* ── Stats ── */}
      <section className="py-14 md:py-20" aria-labelledby="stats-heading">
        <div className="section-divider mb-14" />

        <motion.div
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease }}
          className="text-center mb-10"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2.5"
            style={{ color: 'var(--brand)' }}>By the Numbers</p>
          <h2 id="stats-heading"
            className="text-2xl sm:text-3xl font-bold"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
            Trusted Across India
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {stats.map((s, i) => <StatCard key={i} {...s} index={i} />)}
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="pb-16 md:pb-24" aria-labelledby="testimonials-heading">
        <motion.div
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease }}
          className="text-center mb-10"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2.5"
            style={{ color: 'var(--brand)' }}>Traveller Reviews</p>
          <h2 id="testimonials-heading"
            className="text-2xl sm:text-3xl font-bold mb-3"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
            What Travellers Say
          </h2>
          <p className="text-[14px] sm:text-[15px] max-w-sm mx-auto leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}>
            Real feedback from people who've booked on NammaRail.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {testimonials.map((t, i) => <TestimonialCard key={i} {...t} index={i} />)}
        </div>
      </section>
    </>
  );
}
