import { useEffect, useMemo, useState } from 'react';
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
          <a key={value} href={`#/admin/income/new/${slugOf(value)}`} className="card-panel group flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xl" aria-hidden="true">{source.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900 group-hover:text-teal-800">+ Pendapatan {source.label}</span>
              <span className="block truncate text-[11px] text-slate-500">
                {value === 'construction_project' ? 'Progress kontrak, alat, dan material' : value === 'external_rental' ? 'Jam kerja unit sewa' : 'Volume ritase material'}
              </span>
            </span>
            <span className="text-teal-700" aria-hidden="true">→</span>
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
        <table className="table-modern">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Sumber</th>
              <th>Klien &amp; Proyek</th>
              <th>Periode</th>
              <th className="text-right">Total</th>
              <th className="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {!records ? (
              <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-500">Memuat pendapatan...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-500">Belum ada pengajuan yang cocok.</td></tr>
            ) : filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <a href={`#/admin/income/${row.id}`} className="font-mono text-xs font-bold text-teal-700 hover:underline">#{row.referenceCode}</a>
                  <p className="text-[11px] text-slate-400">{formatDate(row.createdAt)}</p>
                </td>
                <td className="whitespace-nowrap text-xs"><span aria-hidden="true">{SOURCES[row.projectSourceType].icon}</span> {SOURCES[row.projectSourceType].label}</td>
                <td>
                  <p className="font-semibold text-slate-900">{row.partyName || '-'}</p>
                  <p className="text-[11px] text-slate-500">{row.projectName}{row.subProjectLabel ? ` · ${row.subProjectLabel}` : ''}</p>
                </td>
                <td className="whitespace-nowrap text-xs text-slate-600">{formatDate(row.billingPeriodStart)} – {formatDate(row.billingPeriodEnd)}</td>
                <td className="text-right font-mono font-bold text-slate-900">{formatCurrency(row.totalAmount)}</td>
                <td className="text-center"><StatusBadge status={row.status} map={INCOME_STATUS} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
