/**
 * Rute Pusat Approval Divisi Admin:
 *   admin/approvals            → tab PO (default)
 *   admin/approvals/po         antrean purchase request
 *   admin/approvals/po/:id     detail purchase request
 *   admin/approvals/kas        antrean verifikasi kas lapangan
 *   admin/approvals/kas/:id    detail klaim kas
 */
export function parseApprovalRoute(route) {
  const parts = String(route).split('/');
  if (parts[0] !== 'admin' || parts[1] !== 'approvals') return null;
  const [, , tab = 'po', id, ...extra] = parts;
  if (!['po', 'kas'].includes(tab) || extra.length) return null;
  if (id !== undefined && !/^\d+$/.test(id)) return null;
  return { tab, recordId: id ? Number(id) : null };
}
