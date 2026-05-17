// NammaRail — Why Choose Us Section
import { motion } from 'framer-motion';
import { Zap, ShieldCheck, RefreshCw, Smartphone, Search, HeadphonesIcon } from 'lucide-react';

const ease = [0.22, 1, 0.36, 1];

const features = [
  {
    Icon: Zap,
    title: 'Instant Booking',
    desc: 'Reserve seats in under 60 seconds. No forms, no friction — just fast, confirmed bookings.',
  },
  {
    Icon: ShieldCheck,
    title: 'Secure Payments',
    desc: 'Bank-grade encryption on every transaction. Your payment details are never stored or shared.',
  },
  {
    Icon: RefreshCw,
    title: 'Real-time Availability',
    desc: 'Live seat counts synced directly with the national railway database. What you see is accurate.',
  },
  {
    Icon: Search,
    title: 'Smart Search',
    desc: 'Search by intermediate stops, not just endpoints. Finds trains others miss.',
  },
  {
    Icon: Smartphone,
    title: 'Mobile Optimised',
    desc: 'Built mobile-first. Works flawlessly on any screen, with or without a stable connection.',
  },
  {
    Icon: HeadphonesIcon,
    title: 'Dedicated Support',
    desc: 'Human support available for cancellations, refunds, and booking issues — 7 days a week.',
  },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease } },
};

function FeatureCard({ Icon, title, desc }) {
  return (
    <motion.div
      variants={itemVariants}
      className="rounded-2xl p-6 flex flex-col gap-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--border) 30%, var(--brand) 70%)';
        e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'var(--shadow-card)';
      }}
    >
      {/* Icon container */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--brand-gradient)' }}>
        <Icon size={18} strokeWidth={2} color="#FFFDF5" />
      </div>

      <div>
        <h3 className="text-[15px] font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {desc}
        </p>
      </div>
    </motion.div>
  );
}

export default function WhyChooseUs() {
  return (
    <section className="py-16 md:py-20">
      {/* Faint divider at top */}
      <div className="h-px mb-16"
        style={{ background: 'linear-gradient(to right, transparent, var(--border) 20%, var(--border) 80%, transparent)' }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease }}
        className="text-center mb-10"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-3"
          style={{ color: 'var(--brand)' }}>
          Platform Benefits
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3"
          style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
          Why Choose NammaRail
        </h2>
        <p className="text-[15px] max-w-sm mx-auto" style={{ color: 'var(--text-secondary)' }}>
          Built for the modern Indian traveller. Fast, secure, and always available.
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants} initial="hidden"
        whileInView="show" viewport={{ once: true, margin: '-40px' }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {features.map((f, i) => <FeatureCard key={i} {...f} />)}
      </motion.div>
    </section>
  );
}
