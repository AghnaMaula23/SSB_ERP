import { useEffect, useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { Breadcrumb, MetricCard, Notice, PageHeader } from '../components/ProjectUi.jsx';
import { deleteLaborLog, listLaborLogs } from '../services/workerService.js';
import { actorName, formatCurrency, formatDate, stageCrumbs } from '../utils/projectFormat.js';
import { Pager } from '../../approvals/components/ApprovalUi.jsx';
import { hasPermission } from '../../../../services/permissions.js';
import { divisionPrefix } from '../../utils/divisionRoute.js';

const PAGE_SIZE = 20;

/**
 * Log tenaga kerja harian satu tahapan. Ditulis Lapangan; Admin & Finance hanya
 * membaca (P4). Log yang sudah masuk klaim upah aktif terkunci (L6).
 */
export default function LaborLogPage({ project, stage, initialNotice }) {
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(initialNotice || '');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const base = `#/${divisionPrefix()}/projects/${project.id}/sub/${stage.id}/log`;
  const canCreate = hasPermission('labor-log:create');
  const canUpdate = hasPermission('labor-log:update');
  const canDelete = hasPermission('labor-log:delete');
  const stageActive = stage.status === 'active';

  useEffect(() => {
    let cancelled = false;
    listLaborLogs(stage.id, { page, limit: PAGE_SIZE })
      .then((data) => { if (!cancelled) { setResult(data); setLoadError(''); } })
      .catch((error) => { if (!cancelled) { setResult({ data: [], total: 0, totalPages: 1 }); setLoadError(error.message); } });
    return () => { cancelled = true; };
  }, [stage.id, page, reloadKey]);

  const handleDelete = async (row) => {
    if (!window.confirm(`Hapus log ${formatDate(row.workDate)}? Log yang salah tanggal memang dihapus lalu dicatat ulang.`)) return;
    setBusyId(row.id);
    setActionError('');
    try {
      await deleteLaborLog(row.id);
      setNotice(`Log ${formatDate(row.workDate)} dihapus.`);
      setReloadKey((key) => key + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const summary = result?.summary;

  return (
    <>
      <Breadcrumb items={stageCrumbs(project, stage, { label: 'Log Harian' })} />
      <PageHeader
        title="Log Tenaga Kerja Harian"
        subtitle="Satu tanggal, satu log, satu baris per orang. Total = upah + lembur, tanpa pengali."
        actions={canCreate && stageActive ? <a href={`${base}/new`} className="btn btn-primary text-xs">+ Catat Log Harian</a> : null}
      />
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>
      <Notice tone="error" onDismiss={() => setActionError('')}>{actionError}</Notice>
      {loadError && <Notice tone="error">{loadError}</Notice>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Hari-Orang" value={summary?.manDays ?? 0} accent loading={!result} hint={`${summary?.logs ?? 0} log · ${summary?.distinctWorkers ?? 0} orang`} />
        <MetricCard label="Kontrak / Harian" value={`${summary?.contractManDays ?? 0} / ${summary?.dailyManDays ?? 0}`} hint="Hari-orang" loading={!result} />
        <MetricCard label="Total Lembur" value={formatCurrency(summary?.totalOvertime ?? 0)} tone="amber" loading={!result} />
        <MetricCard label="Total Upah" value={formatCurrency(summary?.totalWage ?? 0)} tone="emerald" loading={!result} />
      </div>

      <div className="table-container">
        <ResponsiveTable
          columns={[
            { key: 'date', label: 'Tanggal', primary: true, render: (row) => <span className="font-semibold text-slate-900">{formatDate(row.workDate)}</span> },
            { key: 'workers', label: 'Pekerja', align: 'right', render: (row) => <span className="text-xs">{row.summary?.totalWorkers ?? 0} orang</span> },
            { key: 'wage', label: 'Total Upah', align: 'right', render: (row) => <span className="font-mono text-xs font-semibold">{formatCurrency(row.summary?.totalWage ?? 0)}</span> },
            { key: 'by', label: 'Dicatat', render: (row) => <span className="text-xs text-slate-600">{actorName(row.updatedBy || row.createdBy)}</span> },
            {
              key: 'claim',
              label: 'Klaim Upah',
              render: (row) => (row.claim
                ? <span className="font-mono text-xs font-semibold text-brand-700" title={`Status ${row.claim.status}`}>🔒 {row.claim.claimCode}</span>
                : <span className="text-xs text-slate-400">Belum diklaim</span>),
            },
            {
              key: 'action',
              label: 'Aksi',
              align: 'right',
              render: (row) => (
                <div className="flex flex-wrap justify-end gap-1">
                  {canUpdate && stageActive && !row.claim && <a href={`${base}/${row.id}/edit`} className="btn btn-ghost px-2 py-1 text-[11px]">✎ Ubah</a>}
                  {canDelete && stageActive && !row.claim && <button type="button" disabled={busyId === row.id} onClick={() => handleDelete(row)} className="btn btn-ghost px-2 py-1 text-[11px] text-red-600 hover:bg-red-50">Hapus</button>}
                </div>
              ),
            },
          ]}
          rows={result?.data || []}
          rowKey={(row) => row.id}
          loading={!result}
          loadingText="Memuat log harian..."
          empty="Belum ada log tenaga kerja di tahapan ini."
        />
        {result && result.total > 0 && <Pager page={page} totalPages={Math.max(1, result.totalPages || 1)} total={result.total} shown={result.data.length} onChange={setPage} label="log" />}
      </div>
    </>
  );
}
