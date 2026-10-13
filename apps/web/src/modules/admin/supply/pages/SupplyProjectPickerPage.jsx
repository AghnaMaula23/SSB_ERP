import { useMemo, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, MetricCard, MockBanner, PageHeader, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { formatDate } from '../../project/utils/projectFormat.js';
import { SUPPLY_STATUS } from '../utils/supplyFormat.js';

/**
 * Halaman awal Supply: pilih kontrak dulu, baru masuk ke rekap ritasenya.
 * Pengganti panel "Kontrak Supplier" di prototype.
 */
export default function SupplyProjectPickerPage({ projects, loading, error, canCreate }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [year, setYear] = useState('');

  const years = useMemo(() => [...new Set(projects.map((project) => project.contractStartDate?.slice(0, 4)).filter(Boolean))].sort().reverse(), [projects]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => (!query || [project.projectName, project.projectCode, project.clientName, project.contractNo].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!statusFilter || project.status === statusFilter)
      && (!year || project.contractStartDate?.startsWith(year)));
  }, [projects, search, statusFilter, year]);
  const count = (status) => projects.filter((project) => project.status === status).length;

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Admin' }, { label: 'Supply' }]} />
      <PageHeader
        title="Kontrak Supplier"
        subtitle="Pilih kontrak supply untuk melihat dan mencatat ritase pengiriman material."
        actions={canCreate && <a href="#/admin/supply/new" className="btn btn-primary text-xs">+ Tambah Transaksi</a>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Kontrak" value={projects.length} accent />
        <MetricCard label="Operational" value={count('active')} tone="teal" />
        <MetricCard label="Planned" value={count('planned')} />
        <MetricCard label="Selesai" value={count('completed')} tone="emerald" />
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error} Kontrak contoh tetap ditampilkan.</div>}
      {projects.some((project) => project.isDemo) && (
        <MockBanner>Kontrak bertanda <b>Contoh</b> adalah data dummy untuk mencoba halaman ini — tidak tersimpan di server. Kontrak tanpa tanda berasal dari API.</MockBanner>
      )}

      <section className="card-panel mb-4 p-4" aria-label="Cari kontrak">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_9rem]">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true">🔍</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-control pl-8 text-xs" placeholder="Cari client, proyek, kode, atau nomor kontrak..." aria-label="Cari kontrak" autoFocus />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-control text-xs" aria-label="Filter status">
            <option value="">Semua status</option>
            {Object.entries(SUPPLY_STATUS).map(([value, style]) => <option key={value} value={value}>{style.label}</option>)}
          </select>
          <select value={year} onChange={(event) => setYear(event.target.value)} className="input-control text-xs" aria-label="Filter tahun proyek">
            <option value="">Semua tahun</option>
            {years.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
      </section>

      {loading ? (
        <LoadingPanel>Memuat kontrak supply...</LoadingPanel>
      ) : projects.length === 0 ? (
        <EmptyPanel icon="🚚" title="Belum ada kontrak supply" action={canCreate && <a href="#/admin/supply/new" className="btn btn-primary text-xs">+ Tambah Transaksi</a>}>
          Buat transaksi supply pertama: client, nama proyek, dan periode kontraknya.
        </EmptyPanel>
      ) : filtered.length === 0 ? (
        <EmptyPanel icon="🔎" title="Tidak ada kontrak yang cocok" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <a key={project.id} href={`#/admin/supply/${project.id}`} className="card-panel group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-lg" aria-hidden="true">🚚</span>
                <div className="flex items-center gap-1.5">
                  {project.isDemo && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-600" title="Data contoh, belum tersimpan di server">Contoh</span>}
                  <StatusBadge status={project.status} map={SUPPLY_STATUS} />
                </div>
              </div>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{project.clientName || 'Client belum diisi'}</p>
              <h2 className="mt-0.5 line-clamp-2 text-base font-bold text-slate-900 group-hover:text-teal-800">{project.projectName}</h2>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <span className="font-mono font-semibold">{project.projectCode}</span>
                <span>
                  {project.contractStartDate ? `${formatDate(project.contractStartDate)} – ${formatDate(project.contractEndDate)}` : 'Periode belum diisi'}
                </span>
              </div>
              <span className="mt-3 text-xs font-semibold text-teal-700">Buka rekap ritase →</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
