import { useState } from 'react';
import { Breadcrumb, MetricCard, MockBanner, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { FilterChips } from '../../approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate } from '../../project/utils/projectFormat.js';
import { downloadCsv } from '../../../../utils/csv.js';
import { listIncomeRecords } from '../../income/services/incomeService.js';
import { INCOME_STATUS } from '../../income/utils/incomeFormat.js';
import { fetchAllPages } from '../../../finance/services/financeService.js';
import { useRecord } from '../../../lapangan/hooks/useFieldData.js';
import { ProjectTitle } from '../components/FilesUi.jsx';
import { filesHref } from '../utils/filesRoute.js';
import { projectCrumbs, stageLabel } from '../utils/filesFormat.js';

// Hanya yang sudah diputuskan yang dihitung sebagai uang: pengeluaran = disetujui
// Finance, pemasukan = tagihan yang diverifikasi/lunas. Sisanya tampil sebagai "menunggu".
const INCOME_KEY = { construction: 'constructionProjectId', supply: 'externalSupplyProjectId', rental: 'externalRentalProjectId' };
const INCOME_COUNTED = ['verified', 'partially_paid', 'paid'];

const STATUS = {
  in: { label: 'Pemasukan', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  out: { label: 'Pengeluaran', className: 'bg-red-50 text-red-700 border-red-200' },
};

/** Semua pengeluaran yang punya jejak per project di backend. */
async function loadExpenses(type, projectId, stages) {
  if (type === 'rental') return [];
  if (type === 'supply') {
    const rows = await fetchAllPages('/api/request-material', { externalSupplyProjectId: projectId, status: 'approved' });
    return rows.map((row) => ({ key: `mr-${row.id}`, date: row.requestDate, code: row.requestCode, source: 'Request material', stage: '-', amount: row.totalCostAmount }));
  }
  const perStage = await Promise.all(stages.map(async (stage) => {
    const label = stageLabel(stage);
    const [materials, reports, claims] = await Promise.all([
      fetchAllPages('/api/request-material', { subProjectId: stage.subProjectId, status: 'approved' }),
      fetchAllPages('/api/field-expense-reports', { subProjectId: stage.subProjectId, status: 'validated' }),
      fetchAllPages('/api/labor-wage-claims', { subProjectId: stage.subProjectId, status: 'approved' }),
    ]);
    return [
      ...materials.map((row) => ({ key: `mr-${row.id}`, date: row.requestDate, code: row.requestCode, source: 'Request material', stage: label, amount: row.totalCostAmount })),
      ...reports.map((row) => ({ key: `fer-${row.id}`, date: row.reportDate, code: row.reportCode, source: row.isUrgent ? 'Kas lapangan (mendesak)' : 'Kas lapangan', stage: label, amount: row.totalAmount })),
      ...claims.map((row) => ({ key: `lwc-${row.id}`, date: row.periodEnd, code: row.claimCode, source: 'Upah pekerja', stage: label, amount: row.totalAmount })),
    ];
  }));
  return perStage.flat();
}

/** Pemasukan & pengeluaran satu project, dibaca dari modul sumbernya. */
export default function ProjectFinancePage({ type, projectId, directory }) {
  const stages = directory.stages || [];
  const [filter, setFilter] = useState('');
  const { data, error } = useRecord(async () => {
    const [expenses, income] = await Promise.all([
      loadExpenses(type, projectId, stages),
      listIncomeRecords().then((rows) => rows.filter((row) => String(row[INCOME_KEY[type]]) === String(projectId))),
    ]);
    return { expenses, income };
  }, `${type}:${projectId}`);

  const income = (data?.income || []).filter((row) => INCOME_COUNTED.includes(row.status));
  const awaiting = (data?.income || []).filter((row) => row.status === 'submitted');
  const totalIn = income.reduce((sum, row) => sum + row.totalAmount, 0);
  const totalOut = (data?.expenses || []).reduce((sum, row) => sum + row.amount, 0);
  const net = totalIn - totalOut;
  const entries = [
    ...income.map((row) => ({ key: `inc-${row.id}`, kind: 'in', date: row.createdAt?.slice(0, 10), code: row.referenceCode, source: `Tagihan ${row.partyName}`, stage: row.subProjectLabel || '-', amount: row.totalAmount, status: row.status })),
    ...(data?.expenses || []).map((row) => ({ ...row, kind: 'out' })),
  ].filter((row) => !filter || row.kind === filter).sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const bySource = Object.entries((data?.expenses || []).reduce((acc, row) => ({ ...acc, [row.source]: (acc[row.source] || 0) + row.amount }), {}));

  const exportCsv = () => downloadCsv(`keuangan-${directory.project.code || projectId}.csv`, entries, [
    { label: 'Tanggal', value: (row) => row.date },
    { label: 'Jenis', value: (row) => STATUS[row.kind].label },
    { label: 'Referensi', value: (row) => row.code },
    { label: 'Sumber', value: (row) => row.source },
    { label: 'Tahapan', value: (row) => row.stage },
    { label: 'Nominal', value: (row) => (row.kind === 'out' ? -row.amount : row.amount) },
  ]);

  return (
    <>
      <Breadcrumb items={[...projectCrumbs(type, directory), { label: 'Keuangan Project' }]} />
      <ProjectTitle
        type={type}
        directory={directory}
        title={`Keuangan · ${directory.project.name}`}
        subtitle="Pemasukan yang sudah diakui Finance dan pengeluaran yang sudah disetujui, per project."
        actions={(
          <>
            <a href={filesHref.project(type, projectId)} className="btn btn-secondary text-xs">← Berkas</a>
            <button type="button" onClick={exportCsv} disabled={!entries.length} className="btn btn-primary text-xs">⬇ Export CSV</button>
          </>
        )}
      />
      <MockBanner>Pemasukan berasal dari menu Income (data contoh, backend Income belum ada). Pengeluaran dibaca langsung dari API.</MockBanner>
      {error && <Notice tone="error">{error}</Notice>}
      {type === 'rental' && <Notice tone="warning">Biaya rental (BBM, operator, servis) belum tercatat per kontrak di backend, jadi pengeluaran kontrak rental belum bisa dihitung di sini.</Notice>}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="Pemasukan Diakui" value={formatCurrency(totalIn)} tone="emerald" accent loading={!data && !error} hint={awaiting.length ? `${awaiting.length} tagihan menunggu Finance · ${formatCurrency(awaiting.reduce((sum, row) => sum + row.totalAmount, 0))}` : `${income.length} tagihan`} />
        <MetricCard label="Pengeluaran Disetujui" value={formatCurrency(totalOut)} tone="red" loading={!data && !error} hint={`${(data?.expenses || []).length} dokumen`} />
        <MetricCard label="Selisih" value={formatCurrency(net)} tone={net < 0 ? 'red' : 'teal'} loading={!data && !error} hint={totalIn ? `Margin ${((net / totalIn) * 100).toFixed(1)}%` : 'Belum ada pemasukan diakui'} />
      </div>

      {bySource.length > 0 && (
        <section className="card-panel mb-5 p-4" aria-label="Pengeluaran per sumber">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Pengeluaran per sumber</p>
          <ul className="mt-3 space-y-2">
            {bySource.map(([source, amount]) => (
              <li key={source} className="text-xs">
                <div className="flex justify-between"><span>{source}</span><b className="font-mono">{formatCurrency(amount)}</b></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-red-400" style={{ width: `${totalOut ? (amount / totalOut) * 100 : 0}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card-panel overflow-hidden" aria-label="Arus kas project">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Rincian Pemasukan & Pengeluaran</h2>
          <FilterChips options={[{ value: '', label: 'Semua' }, { value: 'in', label: 'Pemasukan' }, { value: 'out', label: 'Pengeluaran' }]} value={filter} onChange={setFilter} />
        </div>
        <div className="table-scroll-mobile overflow-x-auto">
          <table className="table-modern">
            <thead><tr><th>Tanggal</th><th>Jenis</th><th>Referensi</th><th>Sumber</th><th>Tahapan</th><th className="text-right">Nominal</th></tr></thead>
            <tbody>
              {!data && !error && <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-500">Memuat keuangan project...</td></tr>}
              {data && !entries.length && <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-500">Belum ada pemasukan atau pengeluaran tercatat.</td></tr>}
              {entries.map((row) => (
                <tr key={row.key}>
                  <td className="whitespace-nowrap text-xs">{formatDate(row.date)}</td>
                  <td><StatusBadge status={row.kind} map={STATUS} /></td>
                  <td className="font-mono text-xs font-bold">{row.code}{row.status && <span className="ml-2 align-middle"><StatusBadge status={row.status} map={INCOME_STATUS} /></span>}</td>
                  <td className="text-xs">{row.source}</td>
                  <td className="text-xs">{row.stage}</td>
                  <td className={`text-right font-mono text-sm font-semibold ${row.kind === 'in' ? 'text-leaf-700' : 'text-red-600'}`}>{row.kind === 'out' ? '−' : '+'}{formatCurrency(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
