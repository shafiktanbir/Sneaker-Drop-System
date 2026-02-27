const API_BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export const api = {
  getDrops: (username) =>
    request(`/api/drops${username ? `?username=${encodeURIComponent(username)}` : ''}`),
  createDrop: (body) => request('/api/drops', { method: 'POST', body: JSON.stringify(body) }),
  reserve: (dropId, username) =>
    request('/api/reservations', {
      method: 'POST',
      body: JSON.stringify({ dropId, username }),
    }),
  purchase: (reservationId, username) =>
    request('/api/purchases', {
      method: 'POST',
      body: JSON.stringify({ reservationId, username }),
    }),
  getReservation: (id) => request(`/api/reservations/${id}`),
};
