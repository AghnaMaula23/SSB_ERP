/**
 * Rute menu Files Divisi Admin:
 *   admin/files                              manajer folder proyek
 *   admin/files/new                          form folder baru
 *   admin/files/:folderId                    isi folder
 *   admin/files/:folderId/upload             form upload berkas
 *   admin/files/:folderId/file/:fileId       pratinjau / detail berkas
 */
export function parseFilesRoute(route) {
  const parts = String(route).split('/');
  if (parts[0] !== 'admin' || parts[1] !== 'files') return null;
  const rest = parts.slice(2);
  const isId = (value) => /^\d+$/.test(value || '');
  if (rest.length === 0) return { view: 'folders' };
  if (rest.length === 1 && rest[0] === 'new') return { view: 'folder-new' };
  if (!isId(rest[0])) return null;
  const folderId = Number(rest[0]);
  if (rest.length === 1) return { view: 'folder', folderId };
  if (rest.length === 2 && rest[1] === 'upload') return { view: 'upload', folderId };
  if (rest.length === 3 && rest[1] === 'file' && isId(rest[2])) return { view: 'file', folderId, fileId: Number(rest[2]) };
  return null;
}
