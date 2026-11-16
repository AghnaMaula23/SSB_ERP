import { apiRequest } from '../../../services/api.js';

// Manajemen akun — satu-satunya hak tulis super_admin (backlog E3). Akun baru
// lewat POST /api/auth/register, lalu role dipasang terpisah (PUT /users/:id/roles).
// Akun tidak dihapus: "hapus" = nonaktifkan lewat PUT /users/:id { isActive: false }.

const query = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const listUsers = (params = {}) => apiRequest(`/api/users${query({ limit: 15, ...params })}`);
export const getUser = (id) => apiRequest(`/api/users/${id}`);
export const listRoles = async () => (await apiRequest('/api/roles?limit=100')).data || [];

export const registerUser = ({ username, fullName, email, password }) => apiRequest('/api/auth/register', {
  method: 'POST',
  body: JSON.stringify({ username: username.trim(), fullName: fullName.trim(), email: email.trim(), password }),
});

export const updateUser = (id, changes) => apiRequest(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(changes) });

/** Mengganti SELURUH role. Role akun sendiri tidak bisa diubah (403); super_admin tidak bisa digabung (409). */
export const setUserRoles = (id, roleIds) => apiRequest(`/api/users/${id}/roles`, { method: 'PUT', body: JSON.stringify({ roleIds: roleIds.map(Number) }) });
