import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi';
import { useAdminAuth } from '../../lib/useAdminAuth';
 
const NAV_ITEMS = [
  { href: '/', pathname: '/', label: 'Overview' },
  { href: '/applicants/', pathname: '/applicants', label: 'Applicants' },
];

export default function AdminLayout({ title, subtitle, children }) {
  const router = useRouter();
  const { status, username } = useAdminAuth();
  const [registrationOpen, setRegistrationOpen] = useState(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;

    const load = () => {
      adminApi
        .getSettings()
        .then((data) => {
          if (!cancelled) setRegistrationOpen(data.registration_open);
        })
        .catch(() => {});
    };

    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [status]);

  if (status !== 'authenticated') {
    return (
      <div className="admin-root">
        <div className="admin-loading" style={{ padding: 40 }}>
          {status === 'checking' ? 'Checking session…' : 'Redirecting to login…'}
        </div>
      </div>
    );
  }

  async function handleLogout() {
    try {
      await adminApi.logout();
    } finally {
      router.push('/login/');
    }
  }

  return (
    <div className="admin-root">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <title>{title ? `${title} · YLY Admin` : 'YLY Admin'}</title>
      </Head>

      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <img src="/assets/YLY-logo.png" alt="YLY" />
            <div className="admin-brand-text">
              <span className="admin-brand-title">YLY Admin</span>
              <span className="admin-brand-sub">Registration dashboard</span>
            </div>
          </div>

          <nav className="admin-nav">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-link ${router.pathname === item.pathname ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="admin-sidebar-footer">
            {registrationOpen !== null && (
              <div className="admin-status-pill">
                <span className={`admin-status-dot ${registrationOpen ? 'open' : 'closed'}`} />
                Registration {registrationOpen ? 'open' : 'closed'}
              </div>
            )}
            <div className="admin-user-row">
              <span className="admin-username">{username}</span>
              <button type="button" className="admin-logout-btn" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </div>
        </aside>

        <main className="admin-main">
          <div className="admin-page-header">
            <div>
              <div className="admin-page-title">{title}</div>
              {subtitle && <div className="admin-page-sub">{subtitle}</div>}
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
