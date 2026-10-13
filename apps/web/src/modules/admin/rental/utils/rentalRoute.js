/**
 * Rute menu Rental Divisi Admin (tanpa panel samping — kontrak dipilih di
 * halaman awal, unit dipilih di dalam halaman kontrak):
 *   admin/rental                                  pilih kontrak rental
 *   admin/rental/new                              form transaksi baru
 *   admin/rental/:id                              kontrak + daftar unit
 *   admin/rental/:id/edit                         form ubah kontrak
 *   admin/rental/:id/unit/new                     form unit baru (Request Alat)
 *   admin/rental/:id/unit/:unitKey                timesheet satu unit
 *   admin/rental/:id/unit/:unitKey/sheet/new      form input sheet
 * `:id` angka (API) atau `demo-N` (data contoh). `:unitKey` = p<poolItemId>,
 * r<requestId>-<itemId>, atau d<n>-<n> untuk unit contoh.
 */
export function parseRentalRoute(route) {
  const empty = { projectId: null, form: null, unitKey: null };
  const parts = String(route).split('/');
  if (parts[0] !== 'admin' || parts[1] !== 'rental') return null;
  const rest = parts.slice(2);

  if (rest.length === 0) return empty;
  if (rest.length === 1 && rest[0] === 'new') return { ...empty, form: 'project-new' };

  const isDemo = /^demo-\d+$/.test(rest[0]);
  if (!/^\d+$/.test(rest[0]) && !isDemo) return null;
  const base = { ...empty, projectId: isDemo ? rest[0] : Number(rest[0]) };

  if (rest.length === 1) return base;
  if (rest.length === 2 && rest[1] === 'edit') return { ...base, form: 'project-edit' };
  if (rest[1] !== 'unit' || rest.length < 3) return null;
  if (rest.length === 3 && rest[2] === 'new') return { ...base, form: 'unit-new' };

  if (!/^(p\d+|r\d+-\d+|d\d+-\d+)$/.test(rest[2])) return null;
  const unit = { ...base, unitKey: rest[2] };
  if (rest.length === 3) return unit;
  if (rest.length === 5 && rest[3] === 'sheet' && rest[4] === 'new') return { ...unit, form: 'sheet-new' };
  return null;
}
