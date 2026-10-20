const isId = (value) => /^\d+$/.test(value || '');

// Detail yang dibuka dari Approval Center. Semuanya di bawah `antrean/` supaya
// setelah memutuskan, user kembali ke Approval Center — bukan ke tab sumbernya.
const QUEUE_DETAILS = ['po', 'alat', 'material'];

/**
 * Rute Pusat Approval Divisi Admin:
 *   admin/approvals                                   → Approval Center (default)
 *   admin/approvals/antrean                           Approval Center Admin — antrean lintas sumber
 *   admin/approvals/antrean/po/:id                    review purchase request
 *   admin/approvals/antrean/alat/:id                  review Request Alat internal
 *   admin/approvals/antrean/material/:id              review Request Material
 *   admin/approvals/antrean/progress/:subId/:logId    review progress harian
 *   admin/approvals/po[/:id]                          riwayat & detail purchase request
 *   admin/approvals/kas[/:id]                         verifikasi kas lapangan (data contoh)
 * Balikan `{ tab, detail, recordId, subProjectId }` atau null.
 */
export function parseApprovalRoute(route) {
  const parts = String(route).split('/');
  if (parts[0] !== 'admin' || parts[1] !== 'approvals') return null;
  const [, , tab = 'antrean', ...rest] = parts;
  const empty = { tab, detail: null, recordId: null, subProjectId: null };

  if (tab === 'antrean') {
    if (rest.length === 0) return empty;
    const [kind, first, second, ...extra] = rest;
    if (extra.length) return null;
    if (kind === 'progress') {
      return isId(first) && isId(second) ? { ...empty, detail: 'progress', subProjectId: Number(first), recordId: Number(second) } : null;
    }
    if (QUEUE_DETAILS.includes(kind) && isId(first) && second === undefined) return { ...empty, detail: kind, recordId: Number(first) };
    return null;
  }

  if (!['po', 'kas'].includes(tab)) return null;
  const [id, ...extra] = rest;
  if (extra.length || (id !== undefined && !isId(id))) return null;
  return id ? { ...empty, detail: tab, recordId: Number(id) } : empty;
}
