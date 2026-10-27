import { useEffect, useMemo, useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { Breadcrumb, MetricCard, MockBanner, Notice, PageHeader, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { formatCurrency, formatDate } from '../../project/utils/projectFormat.js';
import { INCOME_STATUS, SOURCES, slugOf } from '../utils/incomeFormat.js';
import { listIncomeRecords } from '../services/incomeService.js';

/** Daftar pengajuan pendapatan + pintu masuk ke form per sumber. */
export default function IncomeListPage({ initialNotice }) {
  const [records, setRecords] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState(initialNotice || '');

  useEffect(() => {
    let cancelled = false;
    listIncomeRecords().then((rows) => { if (!cancelled) setRecords(rows); });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => records || [], [records]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => (!sourceFilter || row.projectSourceType === sourceFilter)
      && (!statusFilter || row.status === statusFilter)
      && (!query || [row.referenceCode, row.partyName, row.projectName].some((value) => String(value || '').toLowerCase().includes(query))));
  }, [rows, search, sourceFilter, statusFilter]);

  const sumBy = (predicate) => rows.filter(predicate).reduce((sum, row) => sum + row.totalAmount, 0);

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Admin' }, { label: 'Income' }]} />
      <PageHeader title="Pendapatan" subtitle="Ajukan tagihan dari progress proyek, sewa alat, dan supply material ke Finance." />
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>
      <MockBanner>Backend Income belum tersedia — daftar ini data contoh dan pengajuan baru disimpan di browser ini.</MockBanner>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {Object.entries(SOURCES).map(([value, source]) => (
          <a key={value} href={`#/admin/income/new/${slugOf(value)}`} className="card-panel group flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl" aria-hidden="true">{source.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900 group-hover:text-brand-800">+ Pendapatan {source.label}</span>
              <span className="block truncate text-[11px] text-slate-500">
                {value === 'construction_project' ? 'Progress kontrak, alat, dan material' : value === 'external_rental' ? 'Jam kerja unit sewa' : 'Volume ritase material'}
              </span>
            </span>
            <span className="text-brand-700" aria-hidden="true">→</span>
          </a>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Diajukan" value={formatCurrency(sumBy((row) => row.status !== 'rejected'))} accent loading={!records} />
        <MetricCard label="Menunggu Finance" value={formatCurrency(sumBy((row) => row.status === 'submitted'))} tone="amber" hint={`${rows.filter((row) => row.status === 'submitted').length} pengajuan`} loading={!records} />
        <MetricCard label="Terverifikasi / Lunas" value={formatCurrency(sumBy((row) => ['verified', 'partially_paid', 'paid'].includes(row.status)))} tone="emerald" loading={!records} />
        <MetricCard label="Ditolak" value={rows.filter((row) => row.status === 'rejected').length} tone={rows.some((row) => row.status === 'rejected') ? 'red' : 'slate'} hint="Perlu diajukan ulang" loading={!records} />
      </div>

      <section className="card-panel mb-4 p-4" aria-label="Filter pendapatan">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]">
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-control text-xs" placeholder="Cari reference ID, klien, atau proyek..." aria-label="Cari" />
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="input-control text-xs" aria-label="Filter sumber">
            <option value="">Semua sumber</option>
            {Object.entries(SOURCES).map(([value, source]) => <option key={value} value={value}>{source.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-control text-xs" aria-label="Filter status">
            <option value="">Semua status</option>
            {Object.entries(INCOME_STATUS).map(([value, style]) => <option key={value} value={value}>{style.label}</option>)}
          </select>
        </div>
      </section>

      <div className="table-container">
        <ResponsiveTable
          columns={[
            {
              key: 'reference',
              label: 'Reference',
              primary: true,
              render: (row) => <a href={`#/admin/income/${row.id}`} className="font-mono text-xs font-bold text-brand-700 hover:underline">#{row.referenceCode}</a>,
              sub: (row) => formatDate(row.createdAt),
              badge: (row) => <span className="whitespace-nowrap text-xs"><span aria-hidden="true">{SOURCES[row.projectSourceType].icon}</span> {SOURCES[row.projectSourceType].label}</span>,
            },
            {
              key: 'party',
              label: 'Klien & Proyek',
              render: (row) => (
                <span className="block">
                  <span className="block font-semibold text-slate-900">{row.partyName || '-'}</span>
                  <span className="block text-[11px] text-slate-500">{row.projectName}{row.subProjectLabel ? ` · ${row.subProjectLabel}` : ''}</span>
                </span>
              ),
            },
            { key: 'period', label: 'Periode', render: (row) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(row.billingPeriodStart)} – {formatDate(row.billingPeriodEnd)}</span> },
            { key: 'total', label: 'Total', align: 'right', render: (row) => <span className="font-mono font-bold text-slate-900">{formatCurrency(row.totalAmount)}</span> },
            { key: 'status', label: 'Status', align: 'center', render: (row) => <StatusBadge status={row.status} map={INCOME_STATUS} /> },
          ]}
          rows={filtered}
          rowKey={(row) => row.id}
          loading={!records}
          loadingText="Memuat pendapatan..."
          empty="Belum ada pengajuan yang cocok."
        />
      </div>
    </>
  );
}
