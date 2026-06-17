import { useEffect, useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { adminApi } from '../lib/adminApi';
import { GOVERNORATES, STUDY_YEARS } from '../lib/formOptions';

const PAGE_SIZE = 25;

const COLUMNS = [
  { key: 'full_name', label: 'Name' },
  { key: 'national_id', label: 'National ID', mono: true },
  { key: 'whatsapp', label: 'WhatsApp', mono: true },
  { key: 'age', label: 'Age' },
  { key: 'governorate', label: 'Governorate' },
  { key: 'university', label: 'University' },
  { key: 'study_year', label: 'Study year' },
  { key: 'egyptian', label: 'Egyptian' },
  { key: 'submitted_at', label: 'Submitted' },
];

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(`${value.replace(' ', 'T')}Z`);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminApplicants() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState('submitted_at');
  const [order, setOrder] = useState('desc');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [studyYear, setStudyYear] = useState('');
  const [egyptian, setEgyptian] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    adminApi
      .getApplicants({ page, pageSize: PAGE_SIZE, search, governorate, study_year: studyYear, egyptian, sort, order })
      .then((data) => {
        setRows(data.data || []);
        setTotal(data.total || 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, search, governorate, studyYear, egyptian, sort, order]);

  function handleSort(columnKey) {
    if (sort === columnKey) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(columnKey);
      setOrder('desc');
    }
    setPage(1);
  }

  function resetFilters() {
    setSearchInput('');
    setSearch('');
    setGovernorate('');
    setStudyYear('');
    setEgyptian('');
    setPage(1);
  }

  const exportUrl = adminApi.exportApplicantsUrl({ search, governorate, study_year: studyYear, egyptian, sort, order });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * PAGE_SIZE);

  return (
    <AdminLayout title="Applicants" subtitle={`${total} total`}>
      {error && <div className="admin-error-banner">{error}</div>}

      <div className="admin-filter-bar">
        <input
          className="admin-input admin-input-search"
          type="text"
          placeholder="Search name, national ID, WhatsApp, or email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          className="admin-select"
          value={governorate}
          onChange={(e) => { setGovernorate(e.target.value); setPage(1); }}
        >
          <option value="">All governorates</option>
          {GOVERNORATES.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          className="admin-select"
          value={studyYear}
          onChange={(e) => { setStudyYear(e.target.value); setPage(1); }}
        >
          <option value="">All study years</option>
          {STUDY_YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          className="admin-select"
          value={egyptian}
          onChange={(e) => { setEgyptian(e.target.value); setPage(1); }}
        >
          <option value="">Egyptian + non-Egyptian</option>
          <option value="true">Egyptian only</option>
          <option value="false">Non-Egyptian only</option>
        </select>
        <button type="button" className="admin-btn admin-btn-ghost" onClick={resetFilters}>
          Clear filters
        </button>
        <a className="admin-btn admin-btn-primary" href={exportUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', marginInlineStart: 'auto' }}>
          Export CSV
        </a>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key}>
                  <button type="button" onClick={() => handleSort(col.key)}>
                    {col.label}{sort === col.key ? (order === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.full_name}</td>
                <td className="admin-mono">{row.national_id}</td>
                <td className="admin-mono">{row.whatsapp}</td>
                <td>{row.age ?? '—'}</td>
                <td>{row.governorate || '—'}</td>
                <td>{row.university || '—'}</td>
                <td>{row.study_year || '—'}</td>
                <td>
                  <span className={`admin-badge ${row.egyptian ? 'success' : 'muted'}`}>
                    {row.egyptian ? 'Egyptian' : 'Non-Egyptian'}
                  </span>
                </td>
                <td>{formatDate(row.submitted_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <div className="admin-empty-state">No applicants match these filters.</div>
        )}
        {loading && <div className="admin-loading" style={{ padding: 16 }}>Loading…</div>}
      </div>

      <div className="admin-pagination">
        <span className="admin-pagination-info">
          {total === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
