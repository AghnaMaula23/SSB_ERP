function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

/**
 * Tanpa bypass role: sejak 15 Okt 2026 super_admin hanya memantau (`*:read`
 * plus manajemen akun), dan permission di /api/auth/me sudah mencerminkan hak
 * aksesnya yang sebenarnya (backlog-fe E3).
 */
export function hasPermission(permission) {
  const user = readUser();
  return user.permissions?.includes(permission) || false;
}
