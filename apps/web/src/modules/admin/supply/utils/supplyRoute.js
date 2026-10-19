/**
 * Rute menu Supply Divisi Admin (tanpa panel samping — project dipilih di
 * halaman awal):
 *   admin/supply                              pilih project supply
 *   admin/supply/new                          form project supply baru
 *   admin/supply/:id                          detail + rekap ritase
 *   admin/supply/:id/edit                     form ubah project supply
 * Ritase tidak punya form di sini — dicatat Divisi Lapangan (backlog E15).
 * `:id` angka untuk kontrak dari API, atau `demo-N` untuk kontrak contoh
 * (dikembalikan sebagai string). Balikan null untuk rute lain.
 */
export function parseSupplyRoute(route) {
  const empty = { projectId: null, form: null };
  const parts = String(route).split('/');
  if (parts[0] !== 'admin' || parts[1] !== 'supply') return null;
  const rest = parts.slice(2);
  const isId = (value) => /^\d+$/.test(value || '');

  if (rest.length === 0) return empty;
  if (rest.length === 1 && rest[0] === 'new') return { ...empty, form: 'project-new' };
  const isDemo = /^demo-\d+$/.test(rest[0]);
  if (!isId(rest[0]) && !isDemo) return null;

  const base = { ...empty, projectId: isDemo ? rest[0] : Number(rest[0]) };
  if (rest.length === 1) return base;
  if (rest.length === 2 && rest[1] === 'edit') return { ...base, form: 'project-edit' };
  return null;
}
