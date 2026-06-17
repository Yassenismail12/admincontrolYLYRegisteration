import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { adminApi } from '../lib/adminApi';

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await adminApi.login(username, password);
      router.push('/');
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-root">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <title>Sign in · YLY Admin</title>
      </Head>
      <div className="admin-login-wrap">
        <div className="admin-login-card">
          <div className="admin-login-brand">
            <img src="/assets/YLY-logo.png" alt="YLY" />
            <div>
              <div className="admin-login-title">YLY Admin</div>
              <div className="admin-login-sub">Sign in to manage registrations</div>
            </div>
          </div>

          {error && <div className="admin-error-banner">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="admin-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                className="admin-input"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="admin-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="admin-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="admin-btn admin-btn-primary admin-login-submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
