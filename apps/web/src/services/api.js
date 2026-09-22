const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function apiRequest(path, options = {}) {
  let response;
  let payload;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {}),
        ...options.headers,
      },
    });
    payload = await response.json().catch(() => ({}));
  } catch {
    throw new Error('Server tidak dapat dihubungi. Periksa koneksi Anda.');
  }

  if (!response.ok) {
    if (response.status === 401) localStorage.removeItem('token');
    throw new Error(payload.message || 'Permintaan ke server gagal.');
  }

  if (payload.meta) return { data: payload.data || [], ...payload.meta };
  return payload.data ?? payload;
}

export { API_BASE_URL };
