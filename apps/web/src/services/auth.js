import { apiRequest } from './api.js';

export async function login(credentials) {
  const payload = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

  if (!payload?.token || !payload?.user) {
    throw new Error('Respons login dari server tidak valid.');
  }

  return payload;
}
