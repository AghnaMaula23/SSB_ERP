const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function login(credentials) {
  let response;
  let payload;

  try {
    response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    payload = await response.json();
  } catch {
    throw new Error('Server tidak dapat dihubungi. Periksa koneksi Anda.');
  }

  if (!response.ok) {
    throw new Error(payload.message || 'Kredensial tidak valid.');
  }

  if (!payload.data?.token || !payload.data?.user) {
    throw new Error('Respons login dari server tidak valid.');
  }

  return payload.data;
}
