const API_BASE_URL = String(import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, errors = [], payload = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.payload = payload;
  }
}

function isJsonBody(body, headers) {
  if (!body || typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof body !== 'string') return false;
  return !headers.has('content-type');
}

function clearTokenAndNotify() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('auth:unauthorized'));
  }
}

async function readPayload(response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();
  if (!raw) return null;
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem('token');

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (isJsonBody(options.body, headers)) headers.set('Content-Type', 'application/json');

  let response;
  let payload;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: options.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Server tidak dapat dihubungi. Periksa koneksi Anda.', { payload: error });
  }

  if (!response.ok) {
    if (response.status === 401) clearTokenAndNotify();
    const message = typeof payload === 'object' && payload?.message
      ? payload.message
      : typeof payload === 'string' && payload
        ? payload
        : 'Permintaan ke server gagal.';
    throw new ApiError(message, {
      status: response.status,
      errors: typeof payload === 'object' ? payload?.errors || [] : [],
      payload,
    });
  }

  if (payload?.meta) return { data: payload.data, ...payload.meta };
  return payload?.data ?? payload;
}

export { API_BASE_URL };
