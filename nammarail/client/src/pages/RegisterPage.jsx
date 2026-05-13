// =============================================================================
// NammaRail — Register Page
// =============================================================================

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register as registerApi } from '../api/authApi';
import Layout from '../components/layout/Layout';

// ─── Client-side validation ───────────────────────────────────────────────────
function validateForm({ name, email, password, confirmPassword }) {
  if (!name.trim())          return 'Name is required';
  if (!email.trim())         return 'Email is required';
  if (password.length < 6)   return 'Password must be at least 6 characters';
  if (password !== confirmPassword) return 'Passwords do not match';
  return null;
}

// ─── Form component ───────────────────────────────────────────────────────────
function RegisterForm({ form, onChange, onSubmit, error, success, isLoading }) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {[
        { id: 'name',            label: 'Full Name',       type: 'text',     placeholder: 'Priya Sharma' },
        { id: 'email',           label: 'Email',           type: 'email',    placeholder: 'priya@example.com' },
        { id: 'password',        label: 'Password',        type: 'password', placeholder: '6+ characters' },
        { id: 'confirmPassword', label: 'Confirm Password', type: 'password', placeholder: 'Repeat password' },
      ].map(({ id, label, type, placeholder }) => (
        <div key={id}>
          <label htmlFor={id} className="form-label">{label}</label>
          <input
            id={id}
            type={type}
            name={id}
            value={form[id]}
            onChange={onChange}
            placeholder={placeholder}
            className="form-input"
            required
          />
        </div>
      ))}

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-700 border border-red-200
          dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg px-4 py-3 text-sm bg-green-50 text-green-700 border border-green-200
          dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
          {success}
        </div>
      )}

      <button
        id="register-submit-btn"
        type="submit"
        disabled={isLoading}
        className="btn-primary w-full py-3 text-base disabled:opacity-60 disabled:cursor-not-allowed mt-2"
      >
        {isLoading ? 'Creating account…' : 'Create Account'}
      </button>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const navigate = useNavigate();
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
  });

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validationError = validateForm(form);
    if (validationError) return setError(validationError);

    setLoading(true);
    try {
      await registerApi(form.name, form.email, form.password);
      setSuccess('Account created! Redirecting to login…');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="min-h-[70vh] flex items-center justify-center py-10">
        <div className="w-full max-w-sm">
          <div className="card p-8">
            <div className="text-center mb-8">
              <div className="text-3xl mb-2">🚆</div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Create account</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                Join NammaRail and start booking
              </p>
            </div>

            <RegisterForm
              form={form}
              onChange={handleChange}
              onSubmit={handleSubmit}
              error={error}
              success={success}
              isLoading={isLoading}
            />

            <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              Already have an account?{' '}
              <Link to="/login" className="font-semibold" style={{ color: 'var(--brand)' }}>
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
