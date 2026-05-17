// NammaRail — Layout Wrapper
// Every page gets Navbar + Footer automatically by wrapping in <Layout>.
import Navbar from './Navbar';
import Footer from './Footer';

export default function Layout({ children, showSections = false }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Navbar />
      <main className="flex-1 container-app">
        {children}
      </main>
      <Footer />
    </div>
  );
}
