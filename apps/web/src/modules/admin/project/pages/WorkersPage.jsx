import { useEffect, useMemo, useState } from 'react';
import { Breadcrumb, MetricCard, MockBanner, Notice, PageHeader, StatusBadge } from '../components/ProjectUi.jsx';
import { EMPLOYMENT_TYPES, WORKER_STATUS, listWorkers, removeWorker } from '../services/fieldMockService.js';
import { formatCurrency, initials, stageCrumbs } from '../utils/projectFormat.js';

/** Daftar pekerja per tahapan — DATA CONTOH, menunggu modul Finance Field & Payroll. */
export default function WorkersPage({ project, stage, initialNotice }) {
  const [workers, setWorkers] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [notice, setNotice] = useState(initialNotice || '');
  const [reloadKey, setReloadKey] = useState(0);
  const base = `#/admin/projects/${project.id}/sub/${stage.id}/pekerja`;

  useEffect(() => {
    let cancelled = false;
    listWorkers(stage.id).then((rows) => { if (!cancelled) setWorkers(rows); });
    return () => { cancelled = true; };
  }, [stage.id, reloadKey]);

  const rows = useMemo(() => workers || [], [workers]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((worker) => (!query || `${worker.fullName} ${worker.nik} ${worker.role} ${worker.groupName}`.toLowerCase().includes(query))
      && (!statusFilter || worker.status === statusFilter));
  }, [rows, search, statusFilter]);
  const dailyCost = rows.filter((worker) => worker.status === 'active').reduce((sum, worker) => sum + (worker.dailyWage || 0), 0);

  const handleRemove = async (worker) => {
    if (!window.confirm(`Keluarkan ${worker.fullName} dari tahapan ini?`)) return;
    await removeWorker(stage.id, worker.id);
    setNotice(`${worker.fullName} dikeluarkan dari daftar pekerja.`);
    setReloadKey((key) => key + 1);
  };

  return (
    <>
      <Breadcrumb items={stageCrumbs(project, stage, { label: 'Pekerja' })} />
      <PageHeader title="Daftar Pekerja" subtitle="Tenaga kerja yang ditugaskan di tahapan ini." actions={<a href={`${base}/new`} className="btn btn-primary text-xs">+ Tambah Pekerja</a>} />
      <MockBanner>Data pekerja belum punya API — tersimpan hanya di browser ini dan terhapus saat sign out. Akan disambungkan ke modul Finance Field &amp; Labor Payroll.</MockBanner>
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Pekerja" value={rows.length} accent />
        <MetricCard label="Active" value={rows.filter((worker) => worker.status === 'active').length} tone="emerald" />
        <MetricCard label="Standby / Off" value={rows.filter((worker) => worker.status !== 'active').length} tone="amber" />
        <MetricCard label="Upah Harian Aktif" value={formatCurrency(dailyCost)} hint="Pekerja harian berstatus active" />
      </div>

      <section className="card-panel mb-4 p-4" aria-label="Filter pekerja">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true">🔍</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-control pl-8 text-xs" placeholder="Cari nama, NIK, grup, atau peran (misal: Beton, Besi)..." aria-label="Cari pekerja" />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-control text-xs" aria-label="Filter status">
            <option value="">Semua status</option>
            {Object.entries(WORKER_STATUS).map(([value, style]) => <option key={value} value={value}>{style.label}</option>)}
          </select>
        </div>
      </section>

      <div className="table-container">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Pekerja</th>
              <th>NIK</th>
              <th>Peran &amp; Grup</th>
              <th>Upah / Hari</th>
              <th className="text-center">Status</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {!workers ? (
              <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-500">Memuat pekerja...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-500">Tidak ada pekerja yang cocok.</td></tr>
            ) : filtered.map((worker) => (
              <tr key={worker.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">{initials(worker.fullName)}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{worker.fullName}</p>
                      <p className="text-[11px] text-slate-400">{EMPLOYMENT_TYPES[worker.employmentType]}{worker.phone ? ` · ${worker.phone}` : ''}</p>
                    </div>
                  </div>
                </td>
                <td className="font-mono text-xs text-slate-600">{worker.nik}</td>
                <td>
                  <p className="font-medium text-slate-900">{worker.role}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700">{worker.groupName || '-'}</p>
                </td>
                <td className="text-xs">{worker.employmentType === 'harian' ? formatCurrency(worker.dailyWage) : <span className="text-slate-400">Gaji bulanan</span>}</td>
                <td className="text-center"><StatusBadge status={worker.status} map={WORKER_STATUS} /></td>
                <td>
                  <div className="flex justify-end gap-1">
                    {worker.phone && <a href={`tel:${worker.phone}`} className="btn btn-ghost px-2 py-1 text-[11px] text-teal-700" title={`Telepon ${worker.phone}`}>📞</a>}
                    <a href={`${base}/${worker.id}/edit`} className="btn btn-ghost px-2 py-1 text-[11px]">✎ Ubah</a>
                    <button type="button" onClick={() => handleRemove(worker)} className="btn btn-ghost px-2 py-1 text-[11px] text-red-600 hover:bg-red-50">Keluarkan</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
