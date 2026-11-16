/** Rute: akun (daftar), akun/new, akun/:id. Balikan `{ view, userId }` atau null. */
export function parseAccountRoute(route) {
  const parts = String(route).split('/');
  if (parts[0] !== 'akun') return null;
  if (parts.length === 1) return { view: 'list', userId: null };
  if (parts.length === 2 && parts[1] === 'new') return { view: 'new', userId: null };
  if (parts.length === 2 && /^\d+$/.test(parts[1])) return { view: 'edit', userId: Number(parts[1]) };
  return null;
}
