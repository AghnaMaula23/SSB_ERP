const LIST_TABS = ['antrean', 'po', 'kas'];
// Layar review yang hanya dibuka dari antrean (wajib ber-id).
const DETAIL_ONLY = ['alat', 'material'];

/**
 * Rute Pusat Approval Divisi Admin:
 *   admin/approvals               → tab Antrean (default)
 *   admin/approvals/antrean       antrean lintas sumber (Approval Center)
 *   admin/approvals/po            antrean purchase request
 *   admin/approvals/po/:id        detail purchase request
 *   admin/approvals/alat/:id      review Request Alat internal
 *   admin/approvals/material/:id  review Request Material
 *   admin/approvals/kas           antrean verifikasi kas lapangan
 *   admin/approvals/kas/:id       detail klaim kas
 */
export function parseApprovalRoute(route) {
  const parts = String(route).split('/');
  if (parts[0] !== 'admin' || parts[1] !== 'approvals') return null;
  const [, , tab = 'antrean', id, ...extra] = parts;
  if (extra.length) return null;
  if (id !== undefined && !/^\d+$/.test(id)) return null;
  if (DETAIL_ONLY.includes(tab)) return id ? { tab, recordId: Number(id) } : null;
  if (!LIST_TABS.includes(tab) || (tab === 'antrean' && id)) return null;
  return { tab, recordId: id ? Number(id) : null };
}
