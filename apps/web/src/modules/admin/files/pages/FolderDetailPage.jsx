import { useEffect, useMemo, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, MetricCard, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { formatDateTime, initials, todayIso } from '../../project/utils/projectFormat.js';
import { Pager } from '../../approvals/components/ApprovalUi.jsx';
import { getFolder, listFiles } from '../services/fileStore.js';
import { FILE_CATEGORIES, FOLDER_STATUS, PROJECT_KINDS, fileKind, folderStatus, formatBytes } from '../utils/filesFormat.js';

const PAGE_SIZE = 8;
const AVATAR_TONES = ['bg-emerald-600', 'bg-amber-600', 'bg-sky-600', 'bg-violet-600', 'bg-rose-600'];
const toneFor = (name = '') => AVATAR_TONES[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_TONES.length];

/** Isi satu folder proyek. */
export default function FolderDetailPage({ folderId, initialNotice }) {
  const [folder, setFolder] = useState(null);
  const [files, setFiles] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(initialNotice || '');

  useEffect(() => {
    let cancelled = false;
    Promise.all([getFolder(folderId), listFiles(folderId)])
      .then(([folderRow, fileRows]) => { if (!cancelled) { setFolder(folderRow); setFiles(fileRows); } })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [folderId]);

  const rows = useMemo(() => files || [], [files]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((file) => (!query || [file.name, file.fileName, file.description, ...(file.tags || [])].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!category || file.category === category)
      && (!type || fileKind(file).kind === type));
  }, [category, rows, search, type]);

  if (loadError) return <EmptyPanel icon="🔎" title="Folder tidak ditemukan" action={<a href="#/admin/files" className="btn btn-secondary text-xs">← Kembali</a>}>{loadError}</EmptyPanel>;
  if (!folder || !files) return <LoadingPanel>Memuat folder...</LoadingPanel>;

  const status = folderStatus(folder);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const today = todayIso();
  const uploadsToday = rows.filter((file) => file.uploadedAt.slice(0, 10) === today).length;
  const categoryCount = new Set(rows.map((file) => file.category)).size;
  const canUpload = !folder.archived;

  return (
    <>
      <Breadcrumb items={[{ label: 'Files', href: '#/admin/files' }, { label: folder.name }]} />
      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-600">Manajer Berkas Proyek: <span className="font-semibold text-teal-700">[{folder.name}]</span></p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{folder.projectName}</h1>
            <StatusBadge status={status} map={FOLDER_STATUS} />
            {folder.isDemo && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-600">Contoh</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            <span className="font-mono font-semibold">{folder.projectCode}</span> · {PROJECT_KINDS[folder.projectKind]?.label} · Tahun {folder.year} · Kelola dokumentasi fisik surat jalan serta log harian lapangan.
          </p>
        </div>
        <a
          href={canUpload ? `#/admin/files/${folder.id}/upload` : undefined}
          aria-disabled={!canUpload}
          title={canUpload ? undefined : 'Folder diarsipkan — aktifkan kembali dari menu folder untuk mengunggah'}
          className={`btn btn-primary text-sm shadow-md ${canUpload ? '' : 'pointer-events-none opacity-50'}`}
        >
          ⬆ Upload Berkas Baru
        </a>
      </div>

      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Berkas" value={rows.length.toLocaleString('id-ID')} accent />
        <MetricCard label="Penyimpanan" value={formatBytes(rows.reduce((sum, file) => sum + file.size, 0))} />
        <MetricCard label="Upload Hari Ini" value={`+${uploadsToday}`} tone="teal" />
        <MetricCard label="Kategori" value={categoryCount} tone="amber" />
      </div>

      <section className="card-panel mb-4 p-4" aria-label="Filter berkas">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true">🔍</span>
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="input-control pl-8 text-sm" placeholder="Cari nama berkas, deskripsi, atau tag..." aria-label="Cari berkas" />
          </div>
          <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className="input-control text-sm" aria-label="Kategori">
            <option value="">Semua kategori</option>
            {FILE_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="input-control text-sm" aria-label="Jenis berkas">
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
        <div className="overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th className="w-12">No</th>
                <th>Nama Dokumen / Berkas</th>
                <th>Kategori</th>
                <th className="text-right">Ukuran</th>
                <th>Tanggal Diunggah</th>
                <th>Pengunggah</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={7} className="py-14 text-center text-sm text-slate-500">
                  {rows.length ? 'Tidak ada berkas yang cocok dengan filter.' : 'Folder ini masih kosong. Unggah berkas pertama.'}
                </td></tr>
              ) : visible.map((file, index) => {
                const kind = fileKind(file);
                const uploader = file.uploadedBy?.fullName || '-';
                return (
                  <tr key={file.id}>
                    <td className="text-xs text-slate-500">{String((current - 1) * PAGE_SIZE + index + 1).padStart(2, '0')}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${kind.tone}`} aria-hidden="true">{kind.icon}</span>
                        <div className="min-w-0">
                          <a href={`#/admin/files/${folder.id}/file/${file.id}`} className="block truncate font-semibold text-slate-900 hover:text-teal-700">{file.name}</a>
                          <p className="truncate font-mono text-[11px] text-slate-400">{file.fileName}</p>
                        </div>
                      </div>
                    </td>
                    <td><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">{file.category}</span></td>
                    <td className="whitespace-nowrap text-right text-xs text-slate-600">{formatBytes(file.size)}</td>
                    <td className="whitespace-nowrap text-xs text-slate-600">{formatDateTime(file.uploadedAt)}</td>
                    <td>
                      <span className="flex items-center gap-2 text-xs text-slate-700">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${toneFor(uploader)}`}>{initials(uploader)}</span>
                        {uploader}
                      </span>
                    </td>
                    <td className="text-right">
                      <a href={`#/admin/files/${folder.id}/file/${file.id}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-800 hover:border-teal-600 hover:text-teal-700">Open</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={current} totalPages={totalPages} total={filtered.length} shown={visible.length} onChange={setPage} label="berkas" />
      </div>
    </>
  );
}
