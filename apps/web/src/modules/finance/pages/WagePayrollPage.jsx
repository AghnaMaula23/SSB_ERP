import { useMemo, useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, EmptyPanel, MetricCard, Notice, PageHeader, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { FilterChips, Pager } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate, todayIso } from '../../admin/project/utils/projectFormat.js';
import { downloadCsv } from '../../../utils/csv.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { PROOF_STATUS, REQUEST_STATUS, stageLabel, statusOptions } from '../../lapangan/utils/fieldFormat.js';
import { fetchAllPages } from '../services/financeService.js';
import { monthBounds } from '../utils/financeFormat.js';

const PAGE_SIZE = 10;
const PENDING = ['submitted', 'waiting_finance_approval'];

/**
 * Gaji & Upah. Upah harian pekerja/mandor dari klaim upah Lapangan (API ada);
 * gaji bulanan staf menunggu modul Payroll Karyawan — tidak dibuatkan data contoh.
 */
export default function WagePayrollPage() {
  const [tab, setTab] = useState('harian');
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data: claims, error } = useRecord(() => fetchAllPages('/api/labor-wage-claims'), 'claims');

  const { start, end } = monthBounds(month);
  // Klaim dihitung ke bulan tempat periodenya berakhir.
  const inMonth = useMemo(() => (claims || []).filter((row) => row.periodEnd >= start && row.periodEnd <= end), [claims, start, end]);
  const approved = inMonth.filter((row) => row.status === 'approved');
  const paid = approved.filter((row) => row.payment?.status === 'validated');
  const pending = (claims || []).filter((row) => PENDING.includes(row.status));
  const totalApproved = approved.reduce((sum, row) => sum + row.totalAmount, 0);
  const totalPending = pending.reduce((sum, row) => sum + row.totalAmount, 0);
  const paidPct = approved.length ? Math.round((paid.length / approved.length) * 100) : 0;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inMonth.filter((row) => (!status || row.status === status)
      && (!query || [row.claimCode, stageLabel(row.subProject)].some((value) => String(value).toLowerCase().includes(query))));
  }, [inMonth, search, status]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCsv = () => downloadCsv(`upah-harian-${month}.csv`, filtered, [
    { label: 'Kode', value: (row) => row.claimCode },
    { label: 'Tahapan', value: (row) => stageLabel(row.subProject) },
    { label: 'Periode Mulai', value: (row) => row.periodStart },
    { label: 'Periode Selesai', value: (row) => row.periodEnd },
    { label: 'Pekerja', value: (row) => row.workerCount },
    { label: 'Hari-Orang', value: (row) => row.manDays },
    { label: 'Total Upah', value: (row) => row.totalAmount },
    { label: 'Status', value: (row) => REQUEST_STATUS[row.status]?.label || row.status },
    { label: 'Pembayaran', value: (row) => (row.payment ? PROOF_STATUS[row.payment.status]?.label : '') },
  ]);

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Finance' }, { label: 'Gaji & Upah' }]} />
      <PageHeader
        title="Manajemen Gaji & Upah"
        subtitle={`Periode operasional: ${formatDate(`${month}-01`, { month: 'long', year: 'numeric' })}`}
        actions={(
          <>
            <input type="month" value={month} max={todayIso().slice(0, 7)} onChange={(event) => { if (event.target.value) { setMonth(event.target.value); setPage(1); } }} className="input-control h-9 text-xs" aria-label="Periode" />
            <button type="button" onClick={exportCsv} disabled={!filtered.length} className="btn btn-secondary text-xs">⬇ Export CSV</button>
          </>
        )}
      />
      {error && <Notice tone="error">{error}</Notice>}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <MetricCard label="Upah Disetujui Bulan Ini" value={formatCurrency(totalApproved)} accent loading={!claims && !error} hint={`${approved.length} klaim`} />
        <MetricCard label="Antrean Upah Pending" value={formatCurrency(totalPending)} tone={pending.length ? 'red' : 'slate'} loading={!claims && !error} hint={`${pending.length} klaim menunggu Admin/Finance`} />
        <article className="card-panel p-4" aria-busy={!claims && !error}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pembayaran Bulan Ini</p>
          <p className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{paid.length} / {approved.length} lunas</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-leaf-500 transition-[width] duration-500" style={{ width: `${paidPct}%` }} /></div>
          <p className="mt-1 text-[11px] font-semibold text-leaf-700">{paidPct}% klaim disetujui sudah berbukti bayar tervalidasi</p>
        </article>
      </div>

      <nav className="mb-5 flex gap-6 border-b border-slate-200" aria-label="Jenis penggajian">
        {[['harian', 'Upah Harian Pekerja / Mandor'], ['staf', 'Gaji Bulanan Staf']].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined} className={`-mb-px border-b-2 px-1 pb-3 text-sm font-semibold transition ${tab === key ? 'border-brand-600 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'staf' ? (
        <EmptyPanel icon="🗓️" title="Gaji bulanan staf belum tersedia">
          Payroll karyawan (gaji pokok, tunjangan, potongan/BPJS) menunggu backend modul Payroll Karyawan
          (<code className="font-mono">/api/payroll</code> masih dikomentari di <code className="font-mono">app.js</code>). Layar ini aktif begitu kontraknya tersedia.
        </EmptyPanel>
      ) : (
        <section className="card-panel overflow-hidden" aria-label="Daftar klaim upah">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">Daftar Klaim Upah</h2>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{inMonth.length} klaim</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="input-control h-9 text-xs sm:w-56" placeholder="Cari kode atau tahapan..." aria-label="Cari klaim" />
              <FilterChips options={statusOptions(REQUEST_STATUS)} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />
            </div>
          </div>
          <ResponsiveTable
            columns={[
              { key: 'code', label: 'Kode', primary: true, render: (row) => <a href={`#/finance/approvals/upah/${row.id}`} className="font-mono text-sm font-bold text-leaf-700 hover:underline">{row.claimCode}</a> },
              { key: 'stage', label: 'Tahapan', render: (row) => <span className="text-xs text-slate-700">{stageLabel(row.subProject)}</span> },
              { key: 'period', label: 'Periode', render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.periodStart)} – {formatDate(row.periodEnd)}</span> },
              { key: 'people', label: 'Orang / Hari', align: 'right', render: (row) => <span className="text-xs">{row.workerCount} / {row.manDays}</span> },
              { key: 'total', label: 'Total Upah', align: 'right', render: (row) => <span className="font-mono text-xs font-semibold">{formatCurrency(row.totalAmount)}</span> },
              { key: 'status', label: 'Status', align: 'center', render: (row) => <StatusBadge status={row.status} map={REQUEST_STATUS} /> },
              { key: 'payment', label: 'Pembayaran', align: 'center', render: (row) => (row.payment ? <StatusBadge status={row.payment.status} map={PROOF_STATUS} /> : <span className="text-xs text-slate-400">{row.status === 'approved' ? 'Belum ada bukti' : '-'}</span>) },
            ]}
            rows={shown}
            rowKey={(row) => row.id}
            loading={!claims && !error}
            loadingText="Memuat klaim upah..."
            empty="Tidak ada klaim upah pada periode ini."
          />
          {filtered.length > 0 && <Pager page={page} totalPages={totalPages} total={filtered.length} shown={shown.length} onChange={setPage} label="klaim" />}
        </section>
      )}
    </>
  );
}
