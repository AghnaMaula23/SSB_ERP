import { SOURCE_SLUGS } from './incomeFormat.js';

/**
 * Rute menu Income Divisi Admin:
 *   admin/income                         daftar income record
 *   admin/income/new/<construction|rental|supply>  form pendapatan baru
 *   admin/income/:id                     detail record
 */
export function parseIncomeRoute(route) {
  const parts = String(route).split('/');
  if (parts[0] !== 'admin' || parts[1] !== 'income') return null;
  const rest = parts.slice(2);
  if (rest.length === 0) return { view: 'list' };
  if (rest[0] === 'new' && rest.length <= 2) {
    const slug = rest[1] || 'construction';
    return SOURCE_SLUGS[slug] ? { view: 'form', sourceType: SOURCE_SLUGS[slug] } : null;
  }
  if (rest.length === 1 && /^\d+$/.test(rest[0])) return { view: 'detail', recordId: Number(rest[0]) };
  return null;
}
