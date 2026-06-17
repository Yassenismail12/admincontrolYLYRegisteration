// Thin wrapper around the standalone admin Worker. Every request includes
// credentials so the signed session cookie set by /api/login is sent on
// every subsequent call.

function apiBase() {
  return process.env.NEXT_PUBLIC_API_URL || '';
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${apiBase()}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && body.error) message = body.error;
    } catch {
      // response wasn't JSON, keep the default message
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
}

function toQueryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, value);
  });
  const str = search.toString();
  return str ? `?${str}` : '';
}

export const adminApi = {
  login(username, password) {
    return request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  logout() {
    return request('/api/logout', { method: 'POST' });
  },

  me() {
    return request('/api/me');
  },

  getApplicants(params) {
    return request(`/api/applicants${toQueryString(params)}`);
  },

  getRecentApplicants(sinceId) {
    return request(`/api/applicants/recent${toQueryString({ sinceId })}`);
  },

  getAnalytics() {
    return request('/api/analytics');
  },

  getSettings() {
    return request('/api/settings');
  },

  updateSettings(registrationOpen) {
    return request('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ registration_open: registrationOpen }),
    });
  },

  exportApplicantsUrl(params) {
    return `${apiBase()}/api/applicants/export${toQueryString(params)}`;
  },
};

export { ApiError };
