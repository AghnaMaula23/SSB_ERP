const isId = (value) => /^\d+$/.test(value || '');

/** Enam antrean Pusat Approval, urut sesuai alur (lihat ApprovalWorkspacePage). */
export const APPROVAL_TABS = ['pr', 'material', 'alat', 'progress', 'kas', 'upah'];

// Tab yang punya layar detail dengan satu id. Progress memakai dua id
// (tahapan + log); klaim upah belum punya backend jadi belum ada detail.
const SINGLE_ID_DETAIL = ['pr', 'material', 'alat', 'kas'];

// Rute lama (sebelum dipecah per antrean) tetap dikenali supaya tautan &
// bookmark lama tidak berakhir di halaman 404.
const LEGACY_TAB = { antrean: 'pr', po: 'pr' };
const LEGACY_DETAIL = { po: 'pr', alat: 'alat', material: 'material', progress: 'progress' };

/**
 * Rute Pusat Approval Divisi Admin — satu tab per antrean:
 *   admin/approvals                          → tab pr (default)
 *   admin/approvals/pr[/:id]                 PR Divisi Alat — validasi / tolak
 *   admin/approvals/material[/:id]           Request Material — kuantitas, biaya, teruskan / tolak
 *   admin/approvals/alat[/:id]               Request Alat internal — teruskan / tolak
 *   admin/approvals/progress[/:subId/:logId] Validasi progress harian — validasi / tolak / cabut
 *   admin/approvals/kas[/:id]                Kas lapangan (data contoh — backend belum ada)
 *   admin/approvals/upah                     Klaim upah pekerja harian (backend belum ada)
 * Rute lama: antrean[/<po|alat|material|progress>/...] dan po[/:id].
 * Balikan `{ tab, detail, recordId, subProjectId }` atau null.
 */
export function parseApprovalRoute(route) {
  const parts = String(route).split('/');
  if (parts[0] !== 'admin' || parts[1] !== 'approvals') return null;
  let [, , tab = 'pr', ...rest] = parts;

  // antrean/<jenis>/<id...> → <jenis>/<id...>
  if (tab === 'antrean' && rest.length) {
    const kind = LEGACY_DETAIL[rest[0]];
    if (!kind) return null;
    tab = kind;
    rest = rest.slice(1);
  } else if (LEGACY_TAB[tab]) {
    tab = LEGACY_TAB[tab];
  }

  if (!APPROVAL_TABS.includes(tab)) return null;
  const empty = { tab, detail: null, recordId: null, subProjectId: null };
  if (rest.length === 0) return empty;

  if (tab === 'progress') {
    const [subId, logId, ...extra] = rest;
    return !extra.length && isId(subId) && isId(logId)
      ? { ...empty, detail: 'progress', subProjectId: Number(subId), recordId: Number(logId) }
      : null;
  }

  const [id, ...extra] = rest;
  if (extra.length || !SINGLE_ID_DETAIL.includes(tab) || !isId(id)) return null;
  return { ...empty, detail: tab, recordId: Number(id) };
}

/** Href daftar satu tab — dipakai breadcrumb & tombol kembali di layar detail. */
export const approvalTabHref = (tab) => `#/admin/approvals/${tab}`;
