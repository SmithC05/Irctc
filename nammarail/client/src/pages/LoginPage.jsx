// =============================================================================
// NammaRail — Login Page
// =============================================================================

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { login as loginApi } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/layout/Layout';

// ─── Form ─────────────────────────────────────────────────────────────────────
function LoginForm({ form, onChange, onSubmit, error, isLoading }) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div>
        <label htmlFor="email" className="form-label">Email</label>
        <input
          id="email"
          type="email"
          name="email"
          value={form.email}
          onChange={onChange}
          placeholder="priya@example.com"
          className="form-input"
          autoComplete="email"
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="form-label">Password</label>
        <input
          id="password"
          type="password"
          name="password"
          value={form.password}
          onChange={onChange}
          placeholder="••••••••"
          className="form-input"
          autoComplete="current-password"
          required
        />
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-700 border border-red-200
          dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
          {error}
        </div>
      )}

      <button
        id="login-submit-btn"
        type="submit"
        disabled={isLoading}
        className="btn-primary w-full py-3 text-base disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const location    = useLocation();

  // ── Redirect-after-login ─────────────────────────────────────────────────
  // When ProtectedRoute redirects an unauthenticated user to /login, it passes
  // the intended destination in location.state.from (e.g. '/my-bookings').
  // After a successful login we send the user back there instead of always
  // going to the homepage — they land exactly where they wanted to be.
  // If there's no state.from (user navigated directly to /login), fall back to '/'.
  const redirectTo = location.state?.from || '/';

  const [error, setError]       = useState('');
  const [isLoading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await loginApi(form.email, form.password);
      // Save token + user to AuthContext (and localStorage via the context login function)
      login(res.data.user, res.data.token);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="min-h-[70vh] flex items-center justify-center py-10">
        <div className="w-full max-w-sm">
          <div className="card p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="text-3xl mb-2">🚆</div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Welcome back</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                Sign in to your NammaRail account
              </p>
            </div>

            <LoginForm
              form={form}
              onChange={handleChange}
              onSubmit={handleSubmit}
              error={error}
              isLoading={isLoading}
            />

            <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              Don't have an account?{' '}
              <Link to="/register" className="font-semibold" style={{ color: 'var(--brand)' }}>
                Register
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
