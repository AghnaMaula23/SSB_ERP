import { useEffect, useMemo, useRef, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, MockBanner, Notice, PageHeader, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { deleteFolder, listFolders, setFolderArchived } from '../services/fileStore.js';
import { listProjectSources } from '../services/projectSources.js';
import { FOLDER_STATUS, PROJECT_KINDS, folderStatus, formatBytes, timeAgo } from '../utils/filesFormat.js';

function FolderMenu({ folder, onArchive, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={`Menu ${folder.name}`} aria-expanded={open}>⋮</button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-44 rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
          <button type="button" onClick={() => { setOpen(false); onArchive(); }} className="block w-full px-3 py-2 text-left hover:bg-slate-50">{folder.archived ? '↺ Aktifkan kembali' : '🗄 Arsipkan folder'}</button>
          <button type="button" onClick={() => { setOpen(false); onDelete(); }} disabled={folder.fileCount > 0} title={folder.fileCount > 0 ? 'Folder masih berisi berkas' : undefined} className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent">🗑 Hapus folder</button>
        </div>
      )}
    </div>
  );
}

/** Halaman awal Files: semua folder proyek. */
export default function FolderManagerPage({ initialNotice }) {
  const [folders, setFolders] = useState(null);
  const [liveStatus, setLiveStatus] = useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [year, setYear] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });

  useEffect(() => {
    let cancelled = false;
    listFolders().then((rows) => { if (!cancelled) setFolders(rows); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Status folder mengikuti status proyek TERKINI dari API, bukan salinan saat folder dibuat.
  useEffect(() => {
    let cancelled = false;
    listProjectSources().then(({ projects }) => {
      if (!cancelled) setLiveStatus(Object.fromEntries(projects.map((row) => [row.key, row.status])));
    });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => (folders || []).map((folder) => {
    const live = folder.projectId !== null ? liveStatus[`${folder.projectKind}:${folder.projectId}`] : undefined;
    const merged = { ...folder, projectStatus: live || folder.projectStatus };
    return { ...merged, status: folderStatus(merged) };
  }), [folders, liveStatus]);

  const years = [...new Set(rows.map((row) => row.year))].sort((a, b) => b - a);
  const filtered = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return (!query || [row.name, row.projectCode, row.projectName].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!kind || row.projectKind === kind)
      && (!year || row.year === Number(year))
      && (!statusFilter || row.status === statusFilter);
  });
  const totalSize = rows.reduce((sum, row) => sum + row.totalSize, 0);
  const totalFiles = rows.reduce((sum, row) => sum + row.fileCount, 0);
  const activeCount = rows.filter((row) => row.status === 'active').length;

  const run = async (action, text) => {
    try {
      await action();
      setNotice({ tone: 'success', text });
      setReloadKey((key) => key + 1);
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Admin' }, { label: 'Files' }]} />
      <PageHeader
        title="Project Folder Manager"
        subtitle={`Kelola dokumen proyek dan log lapangan untuk ${activeCount} folder aktif.`}
        actions={<a href="#/admin/files/new" className="btn btn-primary text-xs">🗂 Create New Folder</a>}
      />

      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      <MockBanner>API berkas project belum tersedia — folder & berkas buatan user disimpan di browser ini dan terhapus saat sign out. Surat jalan & bukti penerimaan tampil dari API di folder sistem. Kode proyek diambil dari API Project, Rental, dan Supply.</MockBanner>

      <section className="card-panel mb-5 p-4" aria-label="Filter folder">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_9rem_9rem]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true">🔍</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-control pl-8 text-sm" placeholder="Cari folder, kode, atau proyek..." aria-label="Cari folder" />
          </div>
          <select value={kind} onChange={(event) => setKind(event.target.value)} className="input-control text-sm" aria-label="Jenis proyek">
            <option value="">All Project Types</option>
            {Object.entries(PROJECT_KINDS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </select>
          <select value={year} onChange={(event) => setYear(event.target.value)} className="input-control text-sm" aria-label="Tahun">
            <option value="">Semua tahun</option>
            {years.map((value) => <option key={value} value={value}>Year: {value}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-control text-sm" aria-label="Status">
            <option value="">Semua status</option>
            {Object.entries(FOLDER_STATUS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </select>
        </div>
      </section>

      {!folders ? (
        <LoadingPanel>Memuat folder...</LoadingPanel>
      ) : filtered.length === 0 && rows.length > 0 ? (
        <EmptyPanel icon="🔎" title="Tidak ada folder yang cocok" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((folder) => {
            const status = FOLDER_STATUS[folder.status];
            const archived = folder.status === 'archived';
            return (
              <article key={folder.id} className={`card-panel flex flex-col border-l-4 ${status.accent} p-4 transition hover:shadow-md`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-3xl leading-none" aria-hidden="true">{archived ? '🗄️' : '📂'}</span>
                  <div className="flex items-center gap-1">
                    {folder.isDemo && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-600">Contoh</span>}
                    <StatusBadge status={folder.status} map={FOLDER_STATUS} />
                    <FolderMenu
                      folder={folder}
                      onArchive={() => run(() => setFolderArchived(folder.id, !folder.archived), folder.archived ? `${folder.name} diaktifkan kembali.` : `${folder.name} diarsipkan.`)}
                      onDelete={() => window.confirm(`Hapus folder ${folder.name}?`) && run(() => deleteFolder(folder.id), `Folder ${folder.name} dihapus.`)}
                    />
                  </div>
                </div>
                <h2 className="mt-3 line-clamp-2 text-base font-bold leading-snug text-slate-900">{folder.name}</h2>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">ID: {folder.projectCode}</p>
                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <p>📄 {folder.fileCount} Files · {formatBytes(folder.totalSize)}</p>
                  <p>🕘 {archived && !folder.lastUploadAt ? 'Diarsipkan' : `Updated ${timeAgo(folder.lastUploadAt || folder.createdAt)}`}</p>
                  <p>{PROJECT_KINDS[folder.projectKind]?.icon} {PROJECT_KINDS[folder.projectKind]?.label} · {folder.year}</p>
                </div>
                <a href={`#/admin/files/${folder.id}`} className="mt-4 rounded-lg bg-slate-100 py-2.5 text-center text-sm font-semibold text-teal-800 transition hover:bg-teal-50">
                  {archived ? 'Open Archive →' : 'Open Folder →'}
                </a>
              </article>
            );
          })}
          <a href="#/admin/files/new" className="flex min-h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-6 text-center transition hover:border-teal-500 hover:bg-teal-50/40">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl text-slate-600">+</span>
            <span className="mt-3 text-sm font-bold text-slate-900">New Project Folder</span>
            <span className="mt-1 text-xs text-slate-500">Buat direktori baru untuk dokumen lapangan.</span>
          </a>
        </div>
      )}

      <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-3 font-mono text-[10px] uppercase tracking-wider text-slate-400">
        <span><span className="text-emerald-500">●</span> Local storage · {rows.length} folder · {totalFiles} berkas</span>
        <span>Storage: {formatBytes(totalSize)}</span>
      </footer>
    </>
  );
}
