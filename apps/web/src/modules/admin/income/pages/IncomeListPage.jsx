import { useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { Breadcrumb, MetricCard, Notice, PageHeader, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { Pager } from '../../approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate } from '../../project/utils/projectFormat.js';
import { useRecord } from '../../../lapangan/hooks/useFieldData.js';
import { hasPermission } from '../../../../services/permissions.js';
import { INCOME_STATUS, PAYMENT_STATUS, SOURCES, contextLabel } from '../utils/incomeFormat.js';
import { listIncomeRecords } from '../services/incomeService.js';

const PAGE_SIZE = 15;

/** Daftar tagihan klien + pintu masuk ke form per jenis. Ringkasan piutang dari backend. */
export default function IncomeListPage({ initialNotice }) {
  const [contextType, setContextType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(initialNotice || '');
  const params = { page, limit: PAGE_SIZE, contextType, status, search: search.trim() };
  const { data: result, error } = useRecord(() => listIncomeRecords(params), JSON.stringify(params));
  const summary = result?.summary;
  const canCreate = hasPermission('income:create');

  const resetPage = (setter) => (value) => { setter(value); setPage(1); };

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Admin' }, { label: 'Income' }]} />
      <PageHeader title="Tagihan Klien" subtitle="Susun tagihan dari progress proyek, jam kerja sewa alat, dan material supply yang diterima. Finance memverifikasi dan mencatat pembayarannya." />
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>
      {error && <Notice tone="error">{error}</Notice>}

      {canCreate && (
        <div className="mb-5 grid gap-3 md:grid-cols-3">
          {Object.entries(SOURCES).map(([value, source]) => (
            <a key={value} href={`#/admin/income/new/${value}`} className="card-panel group flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl" aria-hidden="true">{source.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900 group-hover:text-brand-800">+ Tagihan {source.label}</span>
                <span className="block truncate text-[11px] text-slate-500">{source.hint}</span>
              </span>
              <span className="text-brand-700" aria-hidden="true">→</span>
            </a>
          ))}
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Tagihan Terverifikasi" value={formatCurrency(summary?.verifiedAmount)} accent loading={!result && !error} hint="Sesuai filter" />
        <MetricCard label="Sudah Dibayar" value={formatCurrency(summary?.paidAmount)} tone="emerald" loading={!result && !error} />
        <MetricCard label="Piutang Berjalan" value={formatCurrency(summary?.outstandingAmount)} tone={summary?.outstandingAmount ? 'amber' : 'slate'} loading={!result && !error} />
      </div>

      <section className="card-panel mb-4 p-4" aria-label="Filter tagihan">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]">
          <input value={search} onChange={(event) => resetPage(setSearch)(event.target.value)} className="input-control text-xs" placeholder="Cari kode INC- atau catatan..." aria-label="Cari" />
          <select value={contextType} onChange={(event) => resetPage(setContextType)(event.target.value)} className="input-control text-xs" aria-label="Filter jenis">
            <option value="">Semua jenis</option>
            {Object.entries(SOURCES).map(([value, source]) => <option key={value} value={value}>{source.label}</option>)}
          </select>
          <select value={status} onChange={(event) => resetPage(setStatus)(event.target.value)} className="input-control text-xs" aria-label="Filter status">
            <option value="">Semua status</option>
            {Object.entries(INCOME_STATUS).map(([value, style]) => <option key={value} value={value}>{style.label}</option>)}
          </select>
        </div>
      </section>

      <div className="table-container">
        <ResponsiveTable
          columns={[
            {
              key: 'code',
              label: 'Kode',
              primary: true,
              render: (row) => <a href={`#/admin/income/${row.id}`} className="font-mono text-xs font-bold text-brand-700 hover:underline">{row.incomeCode}</a>,
              sub: (row) => formatDate(row.createdAt),
              badge: (row) => <span className="whitespace-nowrap text-xs"><span aria-hidden="true">{SOURCES[row.contextType]?.icon}</span> {SOURCES[row.contextType]?.short}</span>,
            },
            {
              key: 'context',
              label: 'Klien & Kontrak',
              render: (row) => (
                <span className="block">
                  <span className="block font-semibold text-slate-900">{row.context?.clientName || '-'}</span>
                  <span className="block text-[11px] text-slate-500">{contextLabel(row.context)}</span>
                </span>
              ),
            },
            { key: 'period', label: 'Periode', render: (row) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(row.periodStart)} – {formatDate(row.periodEnd)}</span> },
            { key: 'total', label: 'Total', align: 'right', render: (row) => <span className="font-mono font-bold text-slate-900">{formatCurrency(row.totalAmount)}</span> },
            { key: 'status', label: 'Status', align: 'center', render: (row) => <StatusBadge status={row.status} map={INCOME_STATUS} /> },
            { key: 'payment', label: 'Pembayaran', align: 'center', render: (row) => (row.paymentStatus ? <StatusBadge status={row.paymentStatus} map={PAYMENT_STATUS} /> : <span className="text-xs text-slate-400">-</span>) },
          ]}
          rows={result?.data || []}
          rowKey={(row) => row.id}
          loading={!result && !error}
          loadingText="Memuat tagihan..."
          empty="Belum ada tagihan yang cocok."
        />
        {result?.total > 0 && <Pager page={page} totalPages={result.totalPages || 1} total={result.total} shown={result.data.length} onChange={setPage} label="tagihan" />}
      </div>
    </>
  );
}
