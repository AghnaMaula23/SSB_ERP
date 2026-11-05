import { useEffect, useMemo, useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { Breadcrumb, MetricCard, Notice, PageHeader, StatusBadge } from '../components/ProjectUi.jsx';
import { ASSIGNMENT_STATUS, WORKER_TYPES, assignmentStatus, deleteAssignment, endAssignment, listAssignments } from '../services/workerService.js';
import { formatCurrency, formatDate, initials, stageCrumbs, todayIso } from '../utils/projectFormat.js';
import { hasPermission } from '../../../../services/permissions.js';

/** Pekerja yang ditugaskan di tahapan ini — GET /api/worker-assignments?subProjectId=. */
export default function WorkersPage({ project, stage, initialNotice }) {
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [notice, setNotice] = useState(initialNotice || '');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const base = `#/admin/projects/${project.id}/sub/${stage.id}/pekerja`;
  const canCreate = hasPermission('worker:create');
  const canUpdate = hasPermission('worker:update');
  const canDelete = hasPermission('worker:delete');
  const stageOpen = stage.status === 'planned' || stage.status === 'active';

  useEffect(() => {
    let cancelled = false;
    listAssignments(stage.id)
      .then((result) => { if (!cancelled) { setRows(result.data); setSummary(result.summary); setLoadError(''); } })
      .catch((error) => { if (!cancelled) { setRows([]); setLoadError(error.message); } });
    return () => { cancelled = true; };
  }, [stage.id, reloadKey]);

  const today = todayIso();
  const list = useMemo(() => (rows || []).map((row) => ({ ...row, status: assignmentStatus(row, today) })), [rows, today]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return list.filter((row) => (!query || [row.worker?.fullName, row.worker?.idNumber, row.worker?.workerCode, row.role].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!statusFilter || row.status === statusFilter)
      && (!typeFilter || row.workerType === typeFilter));
  }, [list, search, statusFilter, typeFilter]);
  const active = list.filter((row) => row.status === 'active');
  // Kontrak & harian sama-sama dibayar harian — keduanya masuk biaya upah.
  const dailyCost = summary?.activeDailyWage ?? active.reduce((sum, row) => sum + (row.dailyWage || 0), 0);

  const runAction = async (row, action, successMessage) => {
    setBusyId(row.id);
    setActionError('');
    try {
      await action();
      setNotice(successMessage);
      setReloadKey((key) => key + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleEnd = (row) => {
    if (!window.confirm(`Keluarkan ${row.worker?.fullName} dari tahapan ini per hari ini? Riwayat log hariannya tetap tersimpan.`)) return;
    runAction(row, () => endAssignment(row.id, today < row.startDate ? row.startDate : today), `${row.worker?.fullName} dikeluarkan dari tahapan ini.`);
  };

  const handleDelete = (row) => {
    if (!window.confirm(`Hapus penugasan ${row.worker?.fullName}? Pakai ini hanya untuk salah input — data orangnya tetap ada di master pekerja.`)) return;
    runAction(row, () => deleteAssignment(row.id), `Penugasan ${row.worker?.fullName} dihapus.`);
  };

  return (
    <>
      <Breadcrumb items={stageCrumbs(project, stage, { label: 'Pekerja' })} />
      <PageHeader
        title="Daftar Pekerja"
        subtitle="Penugasan tenaga kerja di tahapan ini — kontrak maupun harian dibayar per hari."
        actions={canCreate && stageOpen ? <a href={`${base}/new`} className="btn btn-primary text-xs">+ Tugaskan Pekerja</a> : null}
      />
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>
      <Notice tone="error" onDismiss={() => setActionError('')}>{actionError}</Notice>
      {loadError && <Notice tone="error">{loadError}</Notice>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Penugasan" value={summary?.total ?? list.length} accent loading={!rows} />
        <MetricCard label="Bertugas Hari Ini" value={summary?.active ?? active.length} tone="emerald" loading={!rows} hint={`${active.filter((row) => row.workerType === 'contract').length} kontrak · ${active.filter((row) => row.workerType === 'daily').length} harian`} />
        <MetricCard label="Selesai / Belum Mulai" value={list.length - active.length} tone="amber" loading={!rows} />
        <MetricCard label="Upah Harian Aktif" value={formatCurrency(dailyCost)} loading={!rows} hint="Kontrak + harian yang bertugas hari ini" />
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
            {Object.entries(ASSIGNMENT_STATUS).map(([value, style]) => <option key={value} value={value}>{style.label}</option>)}
          </select>
        </div>
      </section>

      <div className="table-container">
        <ResponsiveTable
          columns={[
            {
              key: 'worker',
              label: 'Pekerja',
              primary: true,
              render: (row) => (
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{initials(row.worker?.fullName)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900">{row.worker?.fullName || '-'}</span>
                    <span className="block truncate text-[11px] text-slate-400">
                      <span className="font-mono">{row.worker?.workerCode}</span>
                      {row.worker?.phone && ` · ${row.worker.phone}`}
                      {row.loggedDays > 0 && ` · ${row.loggedDays} hari tercatat`}
                    </span>
                  </span>
                </span>
              ),
            },
            { key: 'nik', label: 'NIK', render: (row) => <span className="font-mono text-xs text-slate-600">{row.worker?.idNumber || <span className="font-sans text-slate-400">Tidak ada</span>}</span> },
            {
              key: 'role',
              label: 'Peran & Jenis',
              render: (row) => (
                <span className="block">
                  <span className="block font-medium text-slate-900">{row.role || '-'}</span>
                  <span className={`block text-[10px] font-bold uppercase tracking-wide ${row.workerType === 'contract' ? 'text-indigo-700' : 'text-brand-700'}`}>{WORKER_TYPES[row.workerType]?.label}</span>
                </span>
              ),
            },
            { key: 'period', label: 'Periode', render: (row) => <span className="whitespace-nowrap text-xs text-slate-600">{row.startDate ? `${formatDate(row.startDate)}${row.endDate ? ` – ${formatDate(row.endDate)}` : ' – sekarang'}` : '-'}</span> },
            { key: 'wage', label: 'Upah / Hari', align: 'right', render: (row) => <span className="font-mono text-xs">{formatCurrency(row.dailyWage)}</span> },
            { key: 'status', label: 'Status', align: 'center', render: (row) => <StatusBadge status={row.status} map={ASSIGNMENT_STATUS} /> },
            {
              key: 'action',
              label: 'Aksi',
              align: 'right',
              render: (row) => (
                <div className="flex flex-wrap justify-end gap-1">
                  {row.worker?.phone && <a href={`tel:${row.worker.phone}`} className="btn btn-ghost px-2 py-1 text-[11px] text-brand-700" title={`Telepon ${row.worker.phone}`}>📞</a>}
                  {canUpdate && <a href={`${base}/${row.id}/edit`} className="btn btn-ghost px-2 py-1 text-[11px]">✎ Ubah</a>}
                  {canUpdate && row.status === 'active' && <button type="button" disabled={busyId === row.id} onClick={() => handleEnd(row)} className="btn btn-ghost px-2 py-1 text-[11px] text-amber-700 hover:bg-amber-50">Keluarkan</button>}
                  {canDelete && !row.loggedDays && <button type="button" disabled={busyId === row.id} onClick={() => handleDelete(row)} className="btn btn-ghost px-2 py-1 text-[11px] text-red-600 hover:bg-red-50">Hapus</button>}
                </div>
              ),
            },
          ]}
          rows={filtered}
          rowKey={(row) => row.id}
          loading={!rows}
          loadingText="Memuat pekerja..."
          empty={list.length ? 'Tidak ada pekerja yang cocok.' : 'Belum ada pekerja yang ditugaskan di tahapan ini.'}
        />
      </div>
    </>
  );
}
