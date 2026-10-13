// Halaman di dalam satu tahapan. `mock: true` = belum ada API, memakai data contoh.
export const SUB_PAGES = [
  { key: 'volume', label: 'Kontrak Volume', icon: '📈' },
  { key: 'alat', label: 'Alat', icon: '🚜' },
  { key: 'timesheet', label: 'Timesheet Alat', icon: '⏱️' },
  { key: 'inventory', label: 'Inventory', icon: '📦', mock: true },
  { key: 'pekerja', label: 'Pekerja', icon: '👷', mock: true },
];

const SUB_PAGE_KEYS = SUB_PAGES.map((page) => page.key);

// Form di bawah satu halaman tahapan: `<subPage>/<segmen>` → nama form.
const SUB_FORMS = {
  'volume/new': 'progress-new',
  'volume/:id/edit': 'progress-edit',
  'alat/new': 'allocation-new',
  'timesheet/new': 'workhour-new',
  'inventory/new': 'inventory-new',
  'inventory/:id/mutasi': 'inventory-movement',
  'pekerja/new': 'worker-new',
  'pekerja/:id/edit': 'worker-edit',
};

/**
 * Rute menu Project Divisi Admin:
 *   admin/projects                                   dashboard (pilih project)
 *   admin/projects/new                               form project baru
 *   admin/projects/:projectId                        ringkasan project
 *   admin/projects/:projectId/edit                   form ubah project
 *   admin/projects/:projectId/pool                   equipment pool project
 *   admin/projects/:projectId/pool/:poolId/item/new  form tambah item pool
 *   admin/projects/:projectId/sub/new                form sub-project baru
 *   admin/projects/:projectId/sub/:subId/edit        form ubah sub-project
 *   admin/projects/:projectId/sub/:subId/<halaman>   lihat SUB_PAGES
 *   admin/projects/:projectId/sub/:subId/<halaman>/… lihat SUB_FORMS
 * Balikan null untuk rute lain supaya App bisa mengarahkan ulang.
 */
export function parseProjectRoute(route) {
  const empty = { projectId: null, projectPage: null, subProjectId: null, subPage: null, form: null, recordId: null, poolId: null };
  const parts = String(route).split('/');
  if (parts[0] !== 'admin' || parts[1] !== 'projects') return null;
  const rest = parts.slice(2);
  const isId = (value) => /^\d+$/.test(value || '');

  if (rest.length === 0) return empty;
  if (rest.length === 1 && rest[0] === 'new') return { ...empty, form: 'project-new' };
  if (!isId(rest[0])) return null;

  const base = { ...empty, projectId: Number(rest[0]) };
  const [, section, a, b, c] = rest;

  if (rest.length === 1) return { ...base, projectPage: 'overview' };
  if (rest.length === 2 && section === 'edit') return { ...base, form: 'project-edit' };
  if (section === 'pool') {
    if (rest.length === 2) return { ...base, projectPage: 'pool' };
    if (rest.length === 5 && isId(a) && b === 'item' && c === 'new') return { ...base, projectPage: 'pool', form: 'pool-item-new', poolId: Number(a) };
    return null;
  }
  if (section !== 'sub') return null;
  if (rest.length === 3 && a === 'new') return { ...base, form: 'sub-new' };
  if (!isId(a)) return null;

  const sub = { ...base, subProjectId: Number(a) };
  const tail = rest.slice(3);
  if (tail.length === 0) return { ...sub, subPage: 'volume' };
  if (tail.length === 1 && tail[0] === 'edit') return { ...sub, form: 'sub-edit' };
  if (!SUB_PAGE_KEYS.includes(tail[0])) return null;
  if (tail.length === 1) return { ...sub, subPage: tail[0] };

  const pattern = tail.length === 2 ? `${tail[0]}/${tail[1]}` : `${tail[0]}/:id/${tail[2]}`;
  if (tail.length === 3 && !isId(tail[1])) return null;
  const form = tail.length <= 3 ? SUB_FORMS[pattern] : undefined;
  if (!form) return null;
  return { ...sub, subPage: tail[0], form, recordId: tail.length === 3 ? tail[1] : null };
}
