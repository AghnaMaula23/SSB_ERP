import { useEffect, useMemo, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, MetricCard, Notice, PageHeader, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { listFileProjects } from '../services/projectFiles.js';
import { filesHref } from '../utils/filesRoute.js';
import { PROJECT_KINDS, PROJECT_STATUS, formatBytes, timeAgo } from '../utils/filesFormat.js';

/** Halaman awal Files: daftar project (L8) — folder dibuka di dalam project-nya. */
export default function ProjectListPage() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [year, setYear] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    listFileProjects()
      .then((rows) => { if (!cancelled) setProjects(rows); })
      .catch((requestError) => { if (!cancelled) { setProjects([]); setError(requestError.message); } });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => projects || [], [projects]);
  const years = [...new Set(rows.map((row) => row.year).filter(Boolean))].sort((a, b) => b - a);
  const filtered = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return (!query || [row.name, row.code, row.clientName].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!kind || row.type === kind)
      && (!year || row.year === Number(year))
      && (!statusFilter || row.status === statusFilter);
  });
  const totalSize = rows.reduce((sum, row) => sum + (row.totalSize || 0), 0);
  const totalFiles = rows.reduce((sum, row) => sum + (row.fileCount || 0), 0);
  const totalFolders = rows.reduce((sum, row) => sum + (row.folderCount || 0), 0);

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Admin' }, { label: 'Files' }]} />
      <PageHeader title="Berkas Project" subtitle="Dokumen kontrak, gambar kerja, dan lampiran lapangan — dikelompokkan per project, lalu per tahapan." />
      <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Project" value={rows.length} accent loading={!projects} />
        <MetricCard label="Folder" value={totalFolders} tone="teal" loading={!projects} />
        <MetricCard label="Berkas" value={totalFiles.toLocaleString('id-ID')} tone="emerald" loading={!projects} />
        <MetricCard label="Penyimpanan" value={formatBytes(totalSize)} loading={!projects} />
      </div>

      <section className="card-panel mb-5 p-4" aria-label="Filter project">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_9rem_10rem]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true">🔍</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-control pl-8 text-sm" placeholder="Cari project, kode, atau klien..." aria-label="Cari project" />
          </div>
          <select value={kind} onChange={(event) => setKind(event.target.value)} className="input-control text-sm" aria-label="Jenis project">
            <option value="">Semua jenis</option>
            {Object.entries(PROJECT_KINDS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </select>
          <select value={year} onChange={(event) => setYear(event.target.value)} className="input-control text-sm" aria-label="Tahun">
            <option value="">Semua tahun</option>
            {years.map((value) => <option key={value} value={value}>Tahun {value}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-control text-sm" aria-label="Status">
            <option value="">Semua status</option>
            {Object.entries(PROJECT_STATUS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </select>
        </div>
      </section>

      {!projects ? (
        <LoadingPanel>Memuat project...</LoadingPanel>
      ) : filtered.length === 0 ? (
        <EmptyPanel icon="🔎" title={rows.length ? 'Tidak ada project yang cocok' : 'Belum ada project'}>
          {rows.length ? 'Ubah kata kunci atau filter.' : 'Folder berkas muncul otomatis begitu project dibuat di menu Project, Supply, atau Rental.'}
        </EmptyPanel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => {
            const status = PROJECT_STATUS[project.status] || PROJECT_STATUS.active;
            return (
              <a key={`${project.type}:${project.id}`} href={filesHref.project(project.type, project.id)} className={`card-panel group flex flex-col border-l-4 ${status.accent} p-4 transition hover:-translate-y-0.5 hover:shadow-md`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-3xl leading-none" aria-hidden="true">{project.status === 'completed' || project.status === 'cancelled' ? '🗄️' : '📂'}</span>
                  <StatusBadge status={project.status} map={PROJECT_STATUS} />
                </div>
                <h2 className="mt-3 line-clamp-2 text-base font-bold leading-snug text-slate-900 group-hover:text-brand-700">{project.name}</h2>
                <p className="mt-0.5 truncate text-[11px] text-slate-500"><span className="font-mono">{project.code}</span>{project.clientName ? ` · ${project.clientName}` : ''}</p>
                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <p>🗂 {project.folderCount} folder · 📄 {project.fileCount} berkas · {formatBytes(project.totalSize)}</p>
                  <p>🕘 {project.lastUploadAt ? `Unggahan terakhir ${timeAgo(project.lastUploadAt)}` : 'Belum ada unggahan'}</p>
                  <p>{PROJECT_KINDS[project.type]?.icon} {PROJECT_KINDS[project.type]?.label}{project.year ? ` · ${project.year}` : ''}</p>
                </div>
                <span className="mt-4 rounded-lg bg-slate-100 py-2.5 text-center text-sm font-semibold text-brand-800 transition group-hover:bg-brand-50">Buka Berkas →</span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
