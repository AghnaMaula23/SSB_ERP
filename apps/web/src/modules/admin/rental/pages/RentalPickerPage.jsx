import { useMemo, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, MetricCard, MockBanner, PageHeader, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { formatDate } from '../../project/utils/projectFormat.js';
import { BILLING_METHODS, RENTAL_STATUS } from '../utils/rentalFormat.js';

/** Halaman awal Rental: pilih kontrak sewa, pengganti panel "Kontrak Rental". */
export default function RentalPickerPage({ projects, loading, error, canCreate }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [billing, setBilling] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => (!query || [project.projectName, project.projectCode, project.clientName, project.contractNo].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!statusFilter || project.status === statusFilter)
      && (!billing || project.billingMethod === billing));
  }, [billing, projects, search, statusFilter]);
  const count = (status) => projects.filter((project) => project.status === status).length;

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Admin' }, { label: 'Rental' }]} />
      <PageHeader
        title="Kontrak Rental"
        subtitle="SSB sebagai agen penyewaan alat berat ke penyewa eksternal. Pilih kontrak untuk melihat unit dan timesheet pemakaiannya."
        actions={canCreate && <a href="#/admin/rental/new" className="btn btn-primary text-xs">+ Tambah Transaksi</a>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Kontrak" value={projects.length} accent loading={loading} />
        <MetricCard label="Operational" value={count('active')} tone="teal" loading={loading} />
        <MetricCard label="Planned" value={count('planned')} loading={loading} />
        <MetricCard label="Selesai" value={count('completed')} tone="emerald" loading={loading} />
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error} Kontrak contoh tetap ditampilkan.</div>}
      {projects.some((project) => project.isDemo) && (
        <MockBanner>Kontrak bertanda <b>Contoh</b> adalah data dummy lengkap dengan unit & timesheet — tidak tersimpan di server. Kontrak tanpa tanda berasal dari API.</MockBanner>
      )}

      <section className="card-panel mb-4 p-4" aria-label="Cari kontrak">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true">🔍</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-control pl-8 text-xs" placeholder="Cari penyewa, nama pekerjaan, kode, atau nomor kontrak..." aria-label="Cari kontrak" autoFocus />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-control text-xs" aria-label="Filter status">
            <option value="">Semua status</option>
            {Object.entries(RENTAL_STATUS).map(([value, style]) => <option key={value} value={value}>{style.label}</option>)}
          </select>
          <select value={billing} onChange={(event) => setBilling(event.target.value)} className="input-control text-xs" aria-label="Filter metode tagihan">
            <option value="">Semua metode tagihan</option>
            {Object.entries(BILLING_METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </section>

      {loading ? (
        <LoadingPanel>Memuat kontrak rental...</LoadingPanel>
      ) : projects.length === 0 ? (
        <EmptyPanel icon="🛠️" title="Belum ada kontrak rental" action={canCreate && <a href="#/admin/rental/new" className="btn btn-primary text-xs">+ Tambah Transaksi</a>} />
      ) : filtered.length === 0 ? (
        <EmptyPanel icon="🔎" title="Tidak ada kontrak yang cocok" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <a key={project.id} href={`#/admin/rental/${project.id}`} className="card-panel group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-3 p-5 pb-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-lg" aria-hidden="true">🛠️</span>
                <div className="flex items-center gap-1.5">
                  {project.isDemo && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-600">Contoh</span>}
                  <StatusBadge status={project.status} map={RENTAL_STATUS} />
                </div>
              </div>
              <div className="flex-1 px-5 pt-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{project.clientName || 'Penyewa belum diisi'}</p>
                <h2 className="mt-0.5 line-clamp-2 text-base font-bold text-slate-900 group-hover:text-teal-800">{project.projectName}</h2>
                <p className="mt-1 truncate text-xs text-slate-500">📍 {project.location || 'Lokasi belum diisi'}</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[11px]">
                <div>
                  <p className="font-bold uppercase tracking-wider text-slate-400">Periode</p>
                  <p className="mt-0.5 font-medium text-slate-700">{project.contractStartDate ? `${formatDate(project.contractStartDate)} – ${formatDate(project.contractEndDate)}` : '-'}</p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-wider text-slate-400">Tagihan</p>
                  <p className="mt-0.5 font-medium text-slate-700">{BILLING_METHODS[project.billingMethod] || '-'}</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
