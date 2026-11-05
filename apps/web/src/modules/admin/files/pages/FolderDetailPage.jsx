import { useEffect, useMemo, useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { Breadcrumb, EmptyPanel, LoadingPanel, MetricCard, Notice } from '../../project/components/ProjectUi.jsx';
import { formatDateTime, initials, todayIso } from '../../project/utils/projectFormat.js';
import { Pager } from '../../approvals/components/ApprovalUi.jsx';
import { hasPermission } from '../../../../services/permissions.js';
import { ProjectTitle } from '../components/FilesUi.jsx';
import { deleteFolder, flattenFolders, listFolderFiles, renameFolder } from '../services/projectFiles.js';
import { filesHref } from '../utils/filesRoute.js';
import { fileKind, formatBytes, projectCrumbs, stageLabel } from '../utils/filesFormat.js';

const PAGE_SIZE = 10;
const AVATAR_TONES = ['bg-leaf-600', 'bg-amber-600', 'bg-brand-600', 'bg-violet-600', 'bg-rose-600'];
const toneFor = (name = '') => AVATAR_TONES[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_TONES.length];

/** Isi satu folder user — GET /api/project-files/folders/:id/files. */
export default function FolderDetailPage({ type, projectId, directory, folderId, initialNotice, onChanged, onDeleted }) {
  const folder = flattenFolders(directory).find((row) => row.kind === 'user' && row.id === folderId) || null;
  const [files, setFiles] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const canCreate = hasPermission('project-file:create');
  const canUpdate = hasPermission('project-file:update');
  const canDelete = hasPermission('project-file:delete');

  const folderExists = Boolean(folder);
  useEffect(() => {
    if (!folderExists) return undefined;
    let cancelled = false;
    listFolderFiles(folderId)
      .then((rows) => { if (!cancelled) setFiles(rows); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [folderExists, folderId]);

  const rows = useMemo(() => files || [], [files]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((file) => (!query || [file.name, file.file?.originalName, file.description].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!kindFilter || file.kind === kindFilter));
  }, [kindFilter, rows, search]);

  if (!folder) return <EmptyPanel icon="🔎" title="Folder tidak ditemukan" action={<a href={filesHref.project(type, projectId)} className="btn btn-secondary text-xs">← Kembali ke project</a>}>Folder mungkin sudah dihapus atau bukan milik project ini.</EmptyPanel>;
  if (loadError) return <EmptyPanel icon="⚠️" title="Berkas gagal dimuat" action={<a href={filesHref.project(type, projectId)} className="btn btn-secondary text-xs">← Kembali</a>}>{loadError}</EmptyPanel>;
  if (!files) return <LoadingPanel>Memuat berkas...</LoadingPanel>;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const today = todayIso();
  const uploadsToday = rows.filter((file) => String(file.file?.uploadedAt || '').slice(0, 10) === today).length;
  const totalSize = rows.reduce((sum, file) => sum + (file.file?.sizeBytes || 0), 0);

  const submitRename = async (event) => {
    event.preventDefault();
    if (!newName.trim() || newName.trim() === folder.name) { setRenaming(false); return; }
    setBusy(true);
    try {
      await renameFolder(folder.id, newName);
      setNotice({ tone: 'success', text: `Folder diganti nama menjadi ${newName.trim()}.` });
      setRenaming(false);
      onChanged();
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Hapus folder ${folder.name}? Folder hanya bisa dihapus kalau kosong, termasuk sampahnya.`)) return;
    setBusy(true);
    try {
      await deleteFolder(folder.id);
      onDeleted(`Folder ${folder.name} dihapus.`);
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
      setBusy(false);
    }
  };

  return (
    <>
      <Breadcrumb items={projectCrumbs(type, directory, ...(folder.stage ? [{ label: stageLabel(folder.stage) }] : []), { label: folder.name })} />
      <ProjectTitle
        type={type}
        directory={directory}
        title={`📂 ${folder.name}`}
        subtitle={`${stageLabel(folder.stage)} · ${directory.project.name}`}
        actions={(
          <>
            {canUpdate && <button type="button" onClick={() => { setNewName(folder.name); setRenaming(true); }} className="btn btn-secondary text-xs">✎ Ganti Nama</button>}
            {canDelete && <button type="button" disabled={busy} onClick={remove} className="btn btn-ghost text-xs text-red-600 hover:bg-red-50">🗑 Hapus Folder</button>}
            {canCreate && <a href={filesHref.upload(type, projectId, folder.id)} className="btn btn-primary text-xs">⬆ Unggah Berkas</a>}
          </>
        )}
      />

      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>

      {renaming && (
        <form onSubmit={submitRename} className="card-panel mb-4 flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <label htmlFor="renameFolder" className="text-xs font-semibold text-slate-600">Nama baru</label>
          <input id="renameFolder" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={120} autoFocus className="input-control text-sm sm:flex-1" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setRenaming(false)} className="btn btn-secondary flex-1 text-xs">Batal</button>
            <button type="submit" disabled={busy} className="btn btn-primary flex-1 text-xs">Simpan</button>
          </div>
        </form>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard label="Total Berkas" value={rows.length.toLocaleString('id-ID')} accent />
        <MetricCard label="Penyimpanan" value={formatBytes(totalSize)} />
        <MetricCard label="Unggahan Hari Ini" value={`+${uploadsToday}`} tone="teal" />
      </div>

      <section className="card-panel mb-4 p-4" aria-label="Filter berkas">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true">🔍</span>
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="input-control pl-8 text-sm" placeholder="Cari nama berkas atau deskripsi..." aria-label="Cari berkas" />
          </div>
          <select value={kindFilter} onChange={(event) => { setKindFilter(event.target.value); setPage(1); }} className="input-control text-sm" aria-label="Jenis berkas">
            <option value="">Semua jenis</option>
            <option value="image">Gambar</option>
            <option value="pdf">PDF</option>
            <option value="sheet">Spreadsheet</option>
            <option value="doc">Dokumen</option>
            <option value="cad">CAD (DWG)</option>
          </select>
        </div>
      </section>

      <div className="card-panel overflow-hidden">
        <div className="p-4">
          <ResponsiveTable
            columns={[
              {
                key: 'file',
                label: 'Nama Dokumen / Berkas',
                primary: true,
                render: (file) => {
                  const kind = fileKind(file);
                  return (
                    <span className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${kind.tone}`} aria-hidden="true">{kind.icon}</span>
                      <span className="min-w-0">
                        <a href={filesHref.file(type, projectId, folder.id, file.id)} className="block truncate font-semibold text-slate-900 hover:text-brand-700">{file.name}</a>
                        <span className="block truncate font-mono text-[11px] text-slate-400">{file.file?.originalName}</span>
                      </span>
                    </span>
                  );
                },
              },
              { key: 'size', label: 'Ukuran', align: 'right', render: (file) => <span className="whitespace-nowrap text-xs text-slate-600">{formatBytes(file.file?.sizeBytes)}</span> },
              { key: 'uploaded', label: 'Diunggah', render: (file) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDateTime(file.file?.uploadedAt)}</span> },
              {
                key: 'uploader',
                label: 'Pengunggah',
                render: (file) => {
                  const uploader = file.file?.uploadedBy?.fullName || '-';
                  return (
                    <span className="flex items-center gap-2 text-xs text-slate-700">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${toneFor(uploader)}`}>{initials(uploader)}</span>
                      <span className="truncate">{uploader}</span>
                    </span>
                  );
                },
              },
              {
                key: 'action',
                label: 'Aksi',
                align: 'right',
                render: (file) => <a href={filesHref.file(type, projectId, folder.id, file.id)} className="rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-800 hover:border-brand-600 hover:text-brand-700">Buka</a>,
              },
            ]}
            rows={visible}
            rowKey={(file) => file.id}
            empty={rows.length ? 'Tidak ada berkas yang cocok dengan filter.' : 'Folder ini masih kosong. Unggah berkas pertama.'}
          />
        </div>
        <Pager page={current} totalPages={totalPages} total={filtered.length} shown={visible.length} onChange={setPage} label="berkas" />
      </div>
    </>
  );
}
