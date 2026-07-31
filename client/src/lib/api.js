function getToken() {
  return localStorage.getItem('adminToken') || '';
}

async function request(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['x-admin-token'] = token;
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};

export async function loginAdmin(pin) {
  const data = await request('POST', '/api/admin/login', { pin });
  localStorage.setItem('adminToken', data.token);
  return data.token;
}

export function logoutAdmin() {
  localStorage.removeItem('adminToken');
}

export function isAdmin() {
  return Boolean(getToken());
}
