// =============================================================================
// NammaRail — Layout Wrapper
// =============================================================================
// Every page uses this layout so the Navbar and padding stay consistent.
// If you ever add a footer, add it here once — all pages get it automatically.
// =============================================================================

import Navbar from './Navbar';

/**
 * Wraps page content with the Navbar and consistent main padding.
 * Usage: <Layout><YourPage /></Layout>
 *
 * MOBILE-FIRST COMMENT:
 * We write base styles for mobile first, then add md:/lg: prefixes for larger screens.
 * Example: "pt-6 md:pt-10" means 24px top padding on mobile, 40px on tablet+.
 */
export default function Layout({ children }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Navbar />
      <main className="container-app pt-6 pb-16 md:pt-10">
        {children}
      </main>
    </div>
  );
}
