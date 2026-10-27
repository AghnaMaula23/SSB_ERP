import { useEffect, useState } from 'react';
import { Breadcrumb, LoadingPanel, Notice } from '../../project/components/ProjectUi.jsx';
import { formatDate, formatDateTime } from '../../project/utils/projectFormat.js';
import { hasPermission } from '../../../../services/permissions.js';
import { ProjectTitle } from '../components/FilesUi.jsx';
import { TRASH_DAYS, listTrash, restoreFile } from '../services/projectFiles.js';
import { filesHref } from '../utils/filesRoute.js';
import { fileKind, formatBytes, projectCrumbs } from '../utils/filesFormat.js';

/** Sampah satu project — berkas terhapus permanen 30 hari setelah dibuang (L6). */
export default function TrashPage({ type, projectId, directory, onChanged }) {
  const [rows, setRows] = useState(null);
  const [notice, setNotice] = useState({ tone: 'success', text: '' });
  const [busyId, setBusyId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const canRestore = hasPermission('project-file:delete');

  useEffect(() => {
    let cancelled = false;
    listTrash(type, projectId)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((error) => { if (!cancelled) { setRows([]); setNotice({ tone: 'error', text: error.message }); } });
    return () => { cancelled = true; };
  }, [type, projectId, reloadKey]);

  const restore = async (file) => {
    setBusyId(file.id);
    try {
      await restoreFile(file.id);
      setNotice({ tone: 'success', text: `${file.name} dipulihkan ke folder ${file.folderName}.` });
      setReloadKey((key) => key + 1);
      onChanged();
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Breadcrumb items={projectCrumbs(type, directory, { label: 'Sampah' })} />
      <ProjectTitle type={type} directory={directory} title="🗑 Sampah" subtitle={`Berkas di sampah terhapus permanen ${TRASH_DAYS} hari setelah dibuang. Pulihkan sebelum tanggal itu.`} actions={<a href={filesHref.project(type, projectId)} className="btn btn-secondary text-xs">← Kembali</a>} />
      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>

      {!rows ? <LoadingPanel>Memuat sampah...</LoadingPanel> : (
        <section className="card-panel overflow-hidden" aria-label="Sampah">
          {rows.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">Sampah kosong.</p> : (
            <ul className="divide-y divide-slate-100">
              {rows.map((file) => {
                const kind = fileKind(file);
                return (
                  <li key={file.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg opacity-60 ${kind.tone}`} aria-hidden="true">{kind.icon}</span>
                    <div className="min-w-0 flex-1">
                      <a href={filesHref.file(type, projectId, file.folderId, file.id)} className="block truncate text-sm font-semibold text-slate-700 hover:text-brand-700">{file.name}</a>
                      <p className="truncate text-[11px] text-slate-500">
                        📂 {file.folderName} · {formatBytes(file.file?.sizeBytes)} · dibuang {formatDateTime(file.trashedAt)}{file.trashedBy?.fullName ? ` oleh ${file.trashedBy.fullName}` : ''}
                      </p>
                      <p className="text-[11px] font-medium text-red-600">Terhapus permanen {formatDate(file.purgeAt)}</p>
                    </div>
                    {canRestore && <button type="button" disabled={busyId === file.id} onClick={() => restore(file)} className="btn btn-secondary w-full text-xs sm:w-auto">↺ Pulihkan</button>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
