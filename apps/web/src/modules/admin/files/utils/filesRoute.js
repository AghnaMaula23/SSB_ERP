// Jenis project di API berkas project (Swagger tag Project Files).
export const PROJECT_TYPES = ['construction', 'rental', 'supply'];

const SYSTEM_KEYS = ['delivery-notes', 'receipt-proofs', 'closing-archive'];

/**
 * Rute menu Files Divisi Admin (susunan L8: Project → Tahapan → Folder → Berkas):
 *   admin/files                                            daftar project
 *   admin/files/:type/:projectId                           direktori project (folder & tahapan)
 *   admin/files/:type/:projectId/trash                     sampah project
 *   admin/files/:type/:projectId/new                       folder baru tingkat project
 *   admin/files/:type/:projectId/sub/:subId/new            folder baru di satu tahapan
 *   admin/files/:type/:projectId/system/:key[/sub/:subId]  folder sistem (baca-saja)
 *   admin/files/:type/:projectId/folder/:folderId          isi folder user
 *   admin/files/:type/:projectId/folder/:folderId/upload   unggah berkas
 *   admin/files/:type/:projectId/folder/:folderId/file/:id detail berkas
 * Balikan null untuk rute lain supaya App bisa mengarahkan ulang.
 */
export function parseFilesRoute(route) {
  const parts = String(route).split('/');
  if (parts[0] !== 'admin' || parts[1] !== 'files') return null;
  const rest = parts.slice(2);
  const isId = (value) => /^\d+$/.test(value || '');
  if (rest.length === 0) return { view: 'projects' };

  const [type, projectIdRaw, section, a, b, c] = rest;
  if (!PROJECT_TYPES.includes(type) || !isId(projectIdRaw)) return null;
  const base = { type, projectId: Number(projectIdRaw) };

  if (rest.length === 2) return { ...base, view: 'project' };
  if (rest.length === 3 && section === 'trash') return { ...base, view: 'trash' };
  if (rest.length === 3 && section === 'new') return { ...base, view: 'folder-new', subProjectId: null };
  if (section === 'sub' && rest.length === 5 && isId(a) && b === 'new' && type === 'construction') {
    return { ...base, view: 'folder-new', subProjectId: Number(a) };
  }
  if (section === 'system' && SYSTEM_KEYS.includes(a)) {
    if (rest.length === 4) return { ...base, view: 'system', systemKey: a, subProjectId: null };
    if (rest.length === 6 && b === 'sub' && isId(c)) return { ...base, view: 'system', systemKey: a, subProjectId: Number(c) };
    return null;
  }
  if (section === 'folder' && isId(a)) {
    const folder = { ...base, folderId: Number(a) };
    if (rest.length === 4) return { ...folder, view: 'folder' };
    if (rest.length === 5 && b === 'upload') return { ...folder, view: 'upload' };
    if (rest.length === 6 && b === 'file' && isId(c)) return { ...folder, view: 'file', fileId: Number(c) };
  }
  return null;
}

/** Href helper — semua tautan di modul Files dibangun dari sini. */
export const filesHref = {
  projects: () => '#/admin/files',
  project: (type, projectId) => `#/admin/files/${type}/${projectId}`,
  trash: (type, projectId) => `#/admin/files/${type}/${projectId}/trash`,
  newFolder: (type, projectId, subProjectId) => (subProjectId
    ? `#/admin/files/${type}/${projectId}/sub/${subProjectId}/new`
    : `#/admin/files/${type}/${projectId}/new`),
  system: (type, projectId, key, subProjectId) => `#/admin/files/${type}/${projectId}/system/${key}${subProjectId ? `/sub/${subProjectId}` : ''}`,
  folder: (type, projectId, folderId) => `#/admin/files/${type}/${projectId}/folder/${folderId}`,
  upload: (type, projectId, folderId) => `#/admin/files/${type}/${projectId}/folder/${folderId}/upload`,
  file: (type, projectId, folderId, fileId) => `#/admin/files/${type}/${projectId}/folder/${folderId}/file/${fileId}`,
};
