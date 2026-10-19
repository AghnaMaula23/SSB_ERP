import { useEffect, useMemo, useState } from 'react';
import { Breadcrumb, MetricCard, MockBanner, Notice, PageHeader, StatusBadge } from '../components/ProjectUi.jsx';
import { WORKER_STATUS, WORKER_TYPES, listWorkers, removeWorker } from '../services/fieldMockService.js';
import { formatCurrency, formatDate, initials, stageCrumbs } from '../utils/projectFormat.js';

// "Lama kerja" dihitung dari joinedAt, tidak disimpan (skema tenaga kerja harian).
const tenure = (joinedAt) => {
  if (!joinedAt) return null;
  const years = Math.floor((Date.now() - new Date(joinedAt).getTime()) / (365.25 * 24 * 3600 * 1000));
  return years >= 1 ? `${years} th` : '< 1 th';
};

/** Pekerja yang ditugaskan di tahapan ini — DATA CONTOH, menunggu Finance Field & Labor Payroll. */
export default function WorkersPage({ project, stage, initialNotice }) {
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [notice, setNotice] = useState(initialNotice || '');
  const [reloadKey, setReloadKey] = useState(0);
  const base = `#/admin/projects/${project.id}/sub/${stage.id}/pekerja`;

  useEffect(() => {
    let cancelled = false;
    listWorkers(stage.id, { startDate: stage.contractStartDate }).then((data) => { if (!cancelled) setRows(data); });
    return () => { cancelled = true; };
  }, [stage.contractStartDate, stage.id, reloadKey]);

  const list = useMemo(() => rows || [], [rows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return list.filter((row) => (!query || [row.worker?.fullName, row.worker?.idNumber, row.worker?.workerCode, row.assignedRole].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!statusFilter || row.status === statusFilter)
      && (!typeFilter || row.workerType === typeFilter));
  }, [list, search, statusFilter, typeFilter]);
  const active = list.filter((row) => row.status === 'active');
  // Kontrak & harian sama-sama dibayar harian — keduanya masuk biaya upah.
  const dailyCost = active.reduce((sum, row) => sum + (row.dailyWage || 0), 0);

  const handleRemove = async (row) => {
    if (!window.confirm(`Lepas ${row.worker?.fullName} dari tahapan ini? Data orangnya tetap tersimpan.`)) return;
    await removeWorker(stage.id, row.id);
    setNotice(`${row.worker?.fullName} dilepas dari tahapan ini.`);
    setReloadKey((key) => key + 1);
  };

  return (
    <>
      <Breadcrumb items={stageCrumbs(project, stage, { label: 'Pekerja' })} />
      <PageHeader title="Daftar Pekerja" subtitle="Penugasan tenaga kerja di tahapan ini — kontrak maupun harian dibayar per hari." actions={<a href={`${base}/new`} className="btn btn-primary text-xs">+ Tugaskan Pekerja</a>} />
      <MockBanner>Data pekerja belum punya API — tersimpan hanya di browser ini dan terhapus saat sign out. Akan disambungkan ke modul Finance Field &amp; Labor Payroll.</MockBanner>
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Pekerja" value={list.length} accent />
        <MetricCard label="Active" value={active.length} tone="emerald" hint={`${active.filter((row) => row.workerType === 'contract').length} kontrak · ${active.filter((row) => row.workerType === 'daily').length} harian`} />
        <MetricCard label="Standby / Off" value={list.length - active.length} tone="amber" />
        <MetricCard label="Upah Harian Aktif" value={formatCurrency(dailyCost)} hint="Kontrak + harian berstatus active" />
      </div>

      <section className="card-panel mb-4 p-4" aria-label="Filter pekerja">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true">🔍</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-control pl-8 text-xs" placeholder="Cari nama, NIK, kode PWK, atau peran..." aria-label="Cari pekerja" />
          </div>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="input-control text-xs" aria-label="Filter jenis">
            <option value="">Semua jenis</option>
            {Object.entries(WORKER_TYPES).map(([value, type]) => <option key={value} value={value}>{type.label}</option>)}
          </select>
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
              <th>Peran &amp; Jenis</th>
              <th>Periode</th>
              <th className="whitespace-nowrap text-right">Upah / Hari</th>
              <th className="text-center">Status</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {!rows ? (
              <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-500">Memuat pekerja...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-500">Tidak ada pekerja yang cocok.</td></tr>
            ) : filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">{initials(row.worker?.fullName)}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{row.worker?.fullName || '-'}</p>
                      <p className="text-[11px] text-slate-400">
                        <span className="font-mono">{row.worker?.workerCode}</span>
                        {tenure(row.worker?.joinedAt) && ` · ${tenure(row.worker.joinedAt)}`}
                        {row.worker?.phone && ` · ${row.worker.phone}`}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="font-mono text-xs text-slate-600">{row.worker?.idNumber || <span className="font-sans text-slate-400">Tidak ada</span>}</td>
                <td>
                  <p className="font-medium text-slate-900">{row.assignedRole}</p>
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${row.workerType === 'contract' ? 'text-indigo-700' : 'text-teal-700'}`}>{WORKER_TYPES[row.workerType]?.label}</p>
                </td>
                <td className="whitespace-nowrap text-xs text-slate-600">{row.startDate ? `${formatDate(row.startDate)}${row.endDate ? ` – ${formatDate(row.endDate)}` : ' – sekarang'}` : '-'}</td>
                <td className="text-right font-mono text-xs">{formatCurrency(row.dailyWage)}</td>
                <td className="text-center"><StatusBadge status={row.status} map={WORKER_STATUS} /></td>
                <td>
                  <div className="flex justify-end gap-1">
                    {row.worker?.phone && <a href={`tel:${row.worker.phone}`} className="btn btn-ghost px-2 py-1 text-[11px] text-teal-700" title={`Telepon ${row.worker.phone}`}>📞</a>}
                    <a href={`${base}/${row.id}/edit`} className="btn btn-ghost px-2 py-1 text-[11px]">✎ Ubah</a>
                    <button type="button" onClick={() => handleRemove(row)} className="btn btn-ghost px-2 py-1 text-[11px] text-red-600 hover:bg-red-50">Lepas</button>
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
