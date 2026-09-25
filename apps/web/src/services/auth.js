import { apiRequest } from './api.js';

export function saveSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user || {}));
}

export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  // PO/Kas are demo-only while their backend modules are unavailable.
  localStorage.removeItem('po_data');
  localStorage.removeItem('po_seq');
  localStorage.removeItem('kas_data');
  localStorage.removeItem('kas_seq');
  localStorage.removeItem('income_claims');
  localStorage.removeItem('income_claim_seq');
}

export async function login(credentials) {
  const payload = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

  if (!payload?.token || !payload?.user) {
    throw new Error('Respons login dari server tidak valid.');
  }

  saveSession(payload.token, payload.user);
  try {
    const currentUser = await getCurrentUser();
    return { ...payload, user: currentUser };
  } catch (error) {
    if (error?.status === 401) {
      clearSession();
      throw error;
    }
    return payload;
  }
}

export async function getHealth() {
  return apiRequest('/api/health');
}

export async function getCurrentUser() {
  const user = await apiRequest('/api/auth/me');
  if (!user?.id) throw new Error('Respons sesi dari server tidak valid.');
  localStorage.setItem('user', JSON.stringify(user));
  return user;
}
