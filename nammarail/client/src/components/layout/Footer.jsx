// NammaRail — Footer
import { Link } from 'react-router-dom';
import { Train, Globe, ExternalLink, Link2, Mail, Phone, MapPin } from 'lucide-react';

const links = {
  Platform: [
    { label: 'Search Trains',   to: '/'           },
    { label: 'My Bookings',     to: '/my-bookings' },
    { label: 'Login',           to: '/login'       },
    { label: 'Register',        to: '/register'    },
  ],
  Support: [
    { label: 'Help Centre',    to: '/' },
    { label: 'Cancellation Policy', to: '/' },
    { label: 'Refund Status',  to: '/' },
    { label: 'Report an Issue',to: '/' },
  ],
  Legal: [
    { label: 'Privacy Policy', to: '/' },
    { label: 'Terms of Use',   to: '/' },
    { label: 'Cookie Policy',  to: '/' },
    { label: 'Accessibility',  to: '/' },
  ],
};

const socials = [
  { Icon: Globe,        href: '#', label: 'Website'  },
  { Icon: ExternalLink, href: '#', label: 'GitHub'   },
  { Icon: Link2,        href: '#', label: 'LinkedIn' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <div className="container-app py-14">
        {/* Top grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">

          {/* Brand column — spans 2 cols on lg */}
          <div className="lg:col-span-2">
            {/* Logo */}
            <Link to="/" className="inline-flex items-center gap-2 mb-4 select-none">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg"
                style={{ background: 'var(--brand-gradient)' }}>
                <Train size={14} strokeWidth={2.5} color="#FFFDF5" />
              </div>
              <span className="text-[16px] font-bold tracking-tight"
                style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Namma<span style={{ color: 'var(--brand)' }}>Rail</span>
              </span>
            </Link>

            <p className="text-[13px] leading-relaxed mb-5 max-w-xs"
              style={{ color: 'var(--text-secondary)' }}>
              India's modern railway booking platform. Fast, secure, and designed for every Indian traveller.
            </p>

            {/* Contact snippets */}
            <div className="flex flex-col gap-2.5">
              {[
                { Icon: Mail,    text: 'support@nammarail.in' },
                { Icon: Phone,   text: '+91 98765 43210' },
                { Icon: MapPin,  text: 'Chennai, Tamil Nadu, India' },
              ].map(({ Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-[12px]"
                  style={{ color: 'var(--text-tertiary)' }}>
                  <Icon size={12} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                  {text}
                </div>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([group, items]) => (
            <div key={group}>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-4"
                style={{ color: 'var(--text-tertiary)' }}>
                {group}
              </p>
              <ul className="flex flex-col gap-2.5">
                {items.map(({ label, to }) => (
                  <li key={label}>
                    <Link
                      to={to}
                      className="text-[13px] transition-colors duration-150"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--brand)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px mb-7"
          style={{ background: 'linear-gradient(to right, transparent, var(--border) 20%, var(--border) 80%, transparent)' }} />

        {/* Bottom row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            © {year} NammaRail. Made with care for Indian travellers.
          </p>

          {/* Social icons */}
          <div className="flex items-center gap-2">
            {socials.map(({ Icon, href, label }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="w-8 h-8 rounded-lg flex items-center justify-center
                           transition-all duration-150"
                style={{
                  color: 'var(--text-tertiary)',
                  border: '1px solid var(--border)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--brand)';
                  e.currentTarget.style.color = 'var(--brand)';
                  e.currentTarget.style.backgroundColor = 'var(--brand-light)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.color = 'var(--text-tertiary)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Icon size={14} strokeWidth={1.75} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
