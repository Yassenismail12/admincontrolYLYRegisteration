import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import AdminLayout from '../components/admin/AdminLayout';
import { adminApi } from '../lib/adminApi';

const NAVY = '#1034a8';
const GOLD = '#e0b842';

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const diffMs = Date.now() - new Date(`${isoString.replace(' ', 'T')}Z`).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

function StatCard({ label, value }) {
  return (
    <div className="admin-card">
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value">{value}</div>
    </div>
  );
}

function RegistrationToggleCard({ open, onToggle, pending }) {
  return (
    <div className="admin-card admin-toggle-card">
      <div className="admin-toggle-copy">
        <span className="admin-stat-label">Registration</span>
        <strong style={{ fontSize: 15 }}>{open ? 'Open' : 'Closed'}</strong>
      </div>
      <button
        type="button"
        className={`admin-switch ${open ? 'on' : ''}`}
        onClick={() => onToggle(!open)}
        disabled={pending || open === null}
        aria-label="Toggle registration open/closed"
        aria-pressed={!!open}
      />
    </div>
  );
}

function BarChartCard({ title, data, dataKey, labelKey, layout = 'horizontal' }) {
  return (
    <div className="admin-card">
      <div className="admin-card-title">{title}</div>
      {data && data.length ? (
        <ResponsiveContainer width="100%" height={layout === 'vertical' ? Math.max(180, data.length * 28) : 220}>
          <BarChart data={data} layout={layout} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e6f0" />
            {layout === 'vertical' ? (
              <>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey={labelKey} width={130} tick={{ fontSize: 11 }} />
              </>
            ) : (
              <>
                <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              </>
            )}
            <Tooltip />
            <Bar dataKey={dataKey} fill={NAVY} radius={[4, 4, 4, 4]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="admin-empty-state">No data yet.</div>
      )}
    </div>
  );
}

export default function AdminOverview() {
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [registrationOpen, setRegistrationOpen] = useState(null);
  const [togglePending, setTogglePending] = useState(false);
  const [feed, setFeed] = useState([]);
  const maxIdRef = useRef(0);

  useEffect(() => {
    adminApi
      .getAnalytics()
      .then(setAnalytics)
      .catch((err) => setAnalyticsError(err.message));

    adminApi
      .getSettings()
      .then((data) => setRegistrationOpen(data.registration_open))
      .catch(() => {});
  }, []);

  // Seed the live feed with the most recent applicants, then poll for new ones.
  useEffect(() => {
    let cancelled = false;

    adminApi
      .getApplicants({ page: 1, pageSize: 15, sort: 'id', order: 'desc' })
      .then((data) => {
        if (cancelled) return;
        const rows = data.data || [];
        setFeed(rows.map((row) => ({ ...row, isNew: false })));
        maxIdRef.current = rows.reduce((max, row) => Math.max(max, row.id), 0);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const pollRecent = useCallback(() => {
    adminApi
      .getRecentApplicants(maxIdRef.current)
      .then((data) => {
        const newRows = data.data || [];
        if (!newRows.length) return;
        maxIdRef.current = newRows.reduce((max, row) => Math.max(max, row.id), maxIdRef.current);
        setFeed((prev) => {
          const withNew = [...newRows.reverse().map((row) => ({ ...row, isNew: true })), ...prev];
          return withNew.slice(0, 30);
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(pollRecent, 5000);
    return () => clearInterval(interval);
  }, [pollRecent]);

  async function handleToggle(nextOpen) {
    setTogglePending(true);
    try {
      const result = await adminApi.updateSettings(nextOpen);
      setRegistrationOpen(result.registration_open);
    } catch (err) {
      setAnalyticsError(err.message);
    } finally {
      setTogglePending(false);
    }
  }

  const byDayChart = analytics?.byDay ? [...analytics.byDay].reverse() : [];

  return (
    <AdminLayout title="Overview" subtitle="Live snapshot of registrations">
      {analyticsError && <div className="admin-error-banner">{analyticsError}</div>}

      <div className="admin-grid">
        <StatCard label="Total applicants" value={analytics ? analytics.total : '—'} />
        <StatCard label="Today" value={analytics ? analytics.today : '—'} />
        <StatCard label="Last 7 days" value={analytics ? analytics.last7Days : '—'} />
        <RegistrationToggleCard open={registrationOpen} onToggle={handleToggle} pending={togglePending} />
      </div>

      <div className="admin-charts-grid">
        <div className="admin-card">
          <div className="admin-card-title">Signups, last 30 days</div>
          {byDayChart.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={byDayChart} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e6f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke={GOLD} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="admin-empty-state">No data yet.</div>
          )}
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Live feed</div>
          <div className="admin-feed-list">
            {feed.length === 0 && <div className="admin-feed-empty">Waiting for new submissions…</div>}
            {feed.map((row) => (
              <div key={row.id} className={`admin-feed-item ${row.isNew ? 'is-new' : ''}`}>
                <span className="admin-feed-name">{row.full_name}</span>
                <span className="admin-feed-meta">
                  {row.governorate || '—'}
                  <br />
                  {formatRelativeTime(row.submitted_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-charts-grid">
        <BarChartCard
          title="By governorate"
          data={analytics?.byGovernorate}
          dataKey="count"
          labelKey="governorate"
          layout="vertical"
        />
        <BarChartCard
          title="By study year"
          data={analytics?.byStudyYear}
          dataKey="count"
          labelKey="study_year"
        />
      </div>

      <div className="admin-charts-grid">
        <BarChartCard
          title="Top universities"
          data={analytics?.byUniversity}
          dataKey="count"
          labelKey="university"
          layout="vertical"
        />
        <BarChartCard
          title="How they heard about us"
          data={analytics?.byHowKnowAboutUs}
          dataKey="count"
          labelKey="how_know_about_us"
        />
      </div>
    </AdminLayout>
  );
}
