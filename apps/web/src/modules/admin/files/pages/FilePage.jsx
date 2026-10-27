import { useEffect, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, Notice } from '../../project/components/ProjectUi.jsx';
import { formatDate, formatDateTime } from '../../project/utils/projectFormat.js';
import { hasPermission } from '../../../../services/permissions.js';
import { flattenFolders, getDownloadUrl, getProjectFile, restoreFile, trashFile, updateProjectFile } from '../services/projectFiles.js';
import { filesHref } from '../utils/filesRoute.js';
import { fileKind, formatBytes, projectCrumbs, stageLabel } from '../utils/filesFormat.js';

/** Pratinjau & detail satu berkas project. */
export default function FilePage({ type, projectId, directory, folderId, fileId, onDeleted, onMoved }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ file: null, url: '', error: '' });
  const [notice, setNotice] = useState({ tone: 'success', text: '' });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', folderId: '' });
  const [busy, setBusy] = useState(false);
  const canUpdate = hasPermission('project-file:update');
  const canDelete = hasPermission('project-file:delete');
  const userFolders = flattenFolders(directory).filter((folder) => folder.kind === 'user');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const file = await getProjectFile(fileId);
        // URL bertanda tangan berumur pendek — diminta saat halaman dibuka. Berkas
        // di sampah tidak punya URL unduh, jadi kegagalannya tidak menggagalkan halaman.
        const url = file.trashedAt ? '' : await getDownloadUrl(file.file.id).catch(() => '');
        if (!cancelled) setState({ file, url, error: '' });
      } catch (error) {
        if (!cancelled) setState({ file: null, url: '', error: error.message });
      }
    })();
    return () => { cancelled = true; };
  }, [fileId, reloadKey]);

  const { file, url, error } = state;
  const backHref = filesHref.folder(type, projectId, folderId);
  if (error) return <EmptyPanel icon="🔎" title="Berkas tidak ditemukan" action={<a href={backHref} className="btn btn-secondary text-xs">← Kembali ke folder</a>}>{error}</EmptyPanel>;
  if (!file) return <LoadingPanel>Memuat berkas...</LoadingPanel>;

  const kind = fileKind(file);
  const folder = userFolders.find((row) => row.id === file.folderId);

  const run = async (action, onDone) => {
    setBusy(true);
    try {
      const result = await action();
      onDone(result);
    } catch (requestError) {
      setNotice({ tone: 'error', text: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!window.confirm(`Pindahkan ${file.name} ke sampah? Masih bisa dipulihkan selama 30 hari.`)) return;
    run(() => trashFile(file.id), () => onDeleted(`${file.name} dipindahkan ke sampah.`));
  };

  const restore = () => run(() => restoreFile(file.id), () => { setNotice({ tone: 'success', text: `${file.name} dipulihkan.` }); setReloadKey((key) => key + 1); });

  const startEdit = () => {
    setForm({ name: file.name, description: file.description || '', folderId: String(file.folderId) });
    setEditing(true);
  };

  const saveEdit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) { setNotice({ tone: 'error', text: 'Nama dokumen wajib diisi.' }); return; }
    const changes = {};
    if (form.name.trim() !== file.name) changes.name = form.name.trim();
    if ((form.description.trim() || null) !== (file.description || null)) changes.description = form.description.trim() || null;
    if (Number(form.folderId) !== file.folderId) changes.folderId = Number(form.folderId);
    if (!Object.keys(changes).length) { setEditing(false); return; }
    run(() => updateProjectFile(file.id, changes), (saved) => {
      setEditing(false);
      if (changes.folderId) { onMoved(saved); return; }
      setNotice({ tone: 'success', text: 'Perubahan berkas tersimpan.' });
      setReloadKey((key) => key + 1);
    });
  };

  const preview = () => {
    if (!url) {
      return (
        <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-[repeating-linear-gradient(135deg,#f8fafc_0_12px,#f1f5f9_12px_24px)] p-6 text-center">
          <span className={`flex h-20 w-20 items-center justify-center rounded-2xl text-4xl ${kind.tone}`}>{kind.icon}</span>
          <p className="text-sm font-semibold text-slate-700">{file.trashedAt ? 'Berkas ada di sampah' : 'Pratinjau tidak bisa dimuat'}</p>
          <p className="max-w-sm text-xs text-slate-500">{file.trashedAt ? 'Pulihkan berkas untuk membuka atau mengunduhnya.' : 'Coba muat ulang halaman.'}</p>
        </div>
      );
    }
    if (kind.kind === 'image') return <img src={url} alt={file.name} className="max-h-[70vh] w-full bg-slate-900/5 object-contain" />;
    if (kind.kind === 'pdf') return <iframe src={url} title={file.name} className="h-[70vh] w-full" />;
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 p-6 text-center">
        <span className={`flex h-20 w-20 items-center justify-center rounded-2xl text-4xl ${kind.tone}`}>{kind.icon}</span>
        <p className="text-sm font-semibold text-slate-700">Pratinjau tidak tersedia untuk jenis berkas ini</p>
        <a href={url} className="btn btn-primary mt-2 text-xs">↓ Unduh untuk membuka</a>
      </div>
    );
  };

  return (
    <>
      <Breadcrumb items={projectCrumbs(type, directory, { label: file.folderName, href: filesHref.folder(type, projectId, file.folderId) }, { label: file.name })} />
      <div className="mb-5 mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${kind.tone}`} aria-hidden="true">{kind.icon}</span>
          <div className="min-w-0">
            <h1 className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{file.name}</h1>
            <p className="truncate font-mono text-xs text-slate-500">{file.file.originalName}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          {url && <a href={url} className="btn btn-primary text-xs">↓ Unduh</a>}
          {url && <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary text-xs">↗ Tab baru</a>}
          {canUpdate && !file.trashedAt && <button type="button" onClick={startEdit} className="btn btn-secondary text-xs">✎ Ubah</button>}
          {canDelete && (file.trashedAt
            ? <button type="button" disabled={busy} onClick={restore} className="btn btn-secondary text-xs">↺ Pulihkan</button>
            : <button type="button" disabled={busy} onClick={remove} className="btn btn-ghost text-xs text-red-600 hover:bg-red-50">🗑 Sampah</button>)}
        </div>
      </div>

      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      {file.trashedAt && <Notice tone="warning">Berkas ini ada di sampah sejak {formatDateTime(file.trashedAt)}{file.trashedBy?.fullName ? ` (oleh ${file.trashedBy.fullName})` : ''} dan akan terhapus permanen pada {formatDate(file.purgeAt)}.</Notice>}

      {editing && (
        <form onSubmit={saveEdit} className="card-panel mb-5 grid gap-3 p-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-600" htmlFor="editName">Nama Dokumen
            <input id="editName" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={150} className="input-control mt-1 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-slate-600" htmlFor="editFolder">Folder
            <select id="editFolder" value={form.folderId} onChange={(event) => setForm((current) => ({ ...current, folderId: event.target.value }))} className="input-control mt-1 text-sm">
              {userFolders.map((row) => <option key={row.id} value={row.id}>{row.name} · {stageLabel(row.stage)}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600 sm:col-span-2" htmlFor="editDescription">Deskripsi
            <textarea id="editDescription" rows={2} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={500} className="input-control mt-1 h-auto resize-y text-sm" />
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary text-xs">Batal</button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs">{busy ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </form>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="card-panel overflow-hidden" aria-label="Pratinjau">{preview()}</section>
        <aside className="card-panel h-fit p-4 text-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Detail Berkas</p>
          <dl className="mt-3 space-y-2.5">
            {[
              ['Ukuran', formatBytes(file.file.sizeBytes)],
              ['Jenis', file.file.mimeType || '-'],
              ['Diunggah', formatDateTime(file.file.uploadedAt)],
              ['Pengunggah', file.file.uploadedBy?.fullName || '-'],
              ['Folder', `${file.folderName}${folder ? ` · ${stageLabel(folder.stage)}` : ''}`],
              ['Project', `${directory.project.name} · ${directory.project.code}`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
                <dd className="mt-0.5 break-words text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          {file.description && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deskripsi</p>
              <p className="mt-1 whitespace-pre-line text-slate-700">{file.description}</p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
