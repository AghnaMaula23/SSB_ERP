import { useEffect, useRef, useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, Notice, PageHeader } from '../../admin/project/components/ProjectUi.jsx';
import { Pager, StatTile } from '../../admin/approvals/components/ApprovalUi.jsx';
import { getApprovalSummary } from '../../admin/approvals/services/approvalService.js';
import { formatCurrency, formatDateTime } from '../../admin/project/utils/projectFormat.js';
import { timeAgo } from '../../admin/files/utils/filesFormat.js';
import { downloadCsv } from '../../../utils/csv.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { fetchAllPages, listFinanceQueue } from '../services/financeService.js';
import { FINANCE_TABS, financeDetailHref } from '../utils/financeRoute.js';

const PAGE_SIZE = 15;

const COPY = {
  purchase_request: 'Isi nominal aktual per baris sebelum menyetujui — Kas Alat langsung tercatat keluar sebesar nominal itu.',
  material_request: 'Paket kuantitas & biaya yang sudah disusun Admin. Disetujui = nominal yang diajukan; material masuk pool project.',
  field_operational_request: 'Izin belanja lapangan dengan nominal perkiraan. Disetujui bukan pencairan otomatis.',
  field_expense_report: 'Belanja yang sudah terjadi, diperiksa terhadap nota. Tervalidasi = pengeluaran resmi lapangan.',
  labor_wage_claim: 'Klaim upah per periode yang sudah diperiksa Admin. Setelah disetujui, Lapangan membayar lalu mengunggah bukti.',
  labor_payment_proof: 'Bukti pembayaran upah. Tervalidasi = klaim lunas.',
};

/** Pusat Approval Finance: satu tab per antrean tahap Finance di /api/approval-queue. */
export default function FinanceApprovalsPage({ tab, initialNotice }) {
  const active = FINANCE_TABS.find((entry) => entry.key === tab) || FINANCE_TABS[0];
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('oldest');
  const [page, setPage] = useState(1);
  const tabStripRef = useRef(null);
  const summary = useRecord(getApprovalSummary, 'summary');
  const queue = useRecord(
    () => listFinanceQueue({ sourceType: active.sourceType, search: search.trim(), sort, page, limit: PAGE_SIZE }),
    `${active.sourceType}|${search}|${sort}|${page}`,
  );
  // Nilai seluruh antrean (bukan hanya halaman tampil) untuk kartu ringkasan.
  const totals = useRecord(async () => {
    const rows = await fetchAllPages('/api/approval-queue', { stage: 'finance', sourceType: active.sourceType }, 5);
    return { amount: rows.reduce((sum, row) => sum + (row.amount || 0), 0), rows };
  }, active.sourceType);

  useEffect(() => {
    const strip = tabStripRef.current;
    const current = strip?.querySelector('[aria-current="page"]');
    if (strip && current && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2;
  }, [active.key]);

  const items = (summary.data?.items || []).filter((item) => item.stage === 'finance');
  const countOf = (sourceType) => items.find((item) => item.sourceType === sourceType)?.count || 0;
  const mine = items.find((item) => item.sourceType === active.sourceType);
  const noAccess = summary.data && !mine;

  const exportCsv = () => downloadCsv(`antrean-finance-${active.key}.csv`, totals.data?.rows || [], [
    { label: 'Referensi', value: (row) => row.referenceCode || '' },
    { label: 'Masuk', value: (row) => row.submittedAt },
    { label: 'Konteks', value: (row) => row.context },
    { label: 'Ringkasan', value: (row) => row.summary },
    { label: 'Nominal', value: (row) => row.amount ?? '' },
    { label: 'Diajukan', value: (row) => row.requestedBy?.fullName || '' },
  ]);

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Finance' }, { label: 'Approvals' }, { label: active.label }]} />
      <PageHeader
        title="Pusat Approval Pengeluaran"
        subtitle="Gerbang otoritas pengeluaran konstruksi, alat, dan operasional lapangan."
        actions={<button type="button" onClick={exportCsv} disabled={!totals.data?.rows.length} className="btn btn-secondary text-xs">⬇ Export CSV</button>}
      />

      <nav ref={tabStripRef} className="-mx-4 mb-5 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" aria-label="Antrean Finance">
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          {FINANCE_TABS.map((entry) => {
            const isActive = entry.key === active.key;
            const count = countOf(entry.sourceType);
            return (
              <a
                key={entry.key}
                href={`#/finance/approvals/${entry.key}`}
                aria-current={isActive ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${isActive ? 'bg-white text-brand-800 shadow-xs ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span aria-hidden="true">{entry.icon}</span>
                {entry.label}
                {count > 0 && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{count}</span>}
              </a>
            );
          })}
        </div>
      </nav>

      <Notice tone="success">{initialNotice}</Notice>
      {summary.error && <Notice tone="error">Ringkasan antrean gagal dimuat: {summary.error}</Notice>}
      {noAccess && <Notice tone="warning">Akun ini tidak memegang wewenang <code>{active.permission}</code>, jadi antreannya kosong.</Notice>}

      <div className="mb-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
        <StatTile label="Total Antrean" value={summary.data ? (mine?.count ?? 0) : '…'} hint={active.label} icon={active.icon} tone="amber" />
        <StatTile label="Nilai Antrean" value={totals.data ? formatCurrency(totals.data.amount) : '…'} hint={active.sourceType === 'labor_payment_proof' ? 'Nominal yang dibayar' : 'Akumulasi dokumen menunggu'} icon="💰" tone="teal" />
        <StatTile label="Paling Lama Menunggu" value={mine?.oldestSubmittedAt ? timeAgo(mine.oldestSubmittedAt) : '-'} hint={mine?.oldestSubmittedAt ? `Masuk ${formatDateTime(mine.oldestSubmittedAt)}` : 'Antrean kosong'} icon="⏳" />
      </div>

      <section className="card-panel overflow-hidden" aria-label={`Antrean ${active.label}`}>
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">Data Antrean {active.label}</h2>
            <p className="text-xs leading-relaxed text-slate-500">{COPY[active.sourceType]}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto md:shrink-0">
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="input-control h-9 text-xs sm:w-56" placeholder="Cari kode atau project..." aria-label="Cari antrean" />
            <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} className="input-control h-9 text-xs sm:w-36" aria-label="Urutan">
              <option value="oldest">Terlama dulu</option>
              <option value="newest">Terbaru dulu</option>
            </select>
          </div>
        </div>
        <ResponsiveTable
          columns={[
            {
              key: 'reference',
              label: 'Referensi',
              primary: true,
              render: (row) => <a href={financeDetailHref(row)} className="whitespace-nowrap font-mono text-sm font-bold text-leaf-700 hover:underline">{row.referenceCode || '-'}</a>,
            },
            {
              key: 'submitted',
              label: 'Masuk',
              render: (row) => (
                <span className="whitespace-nowrap text-xs">
                  <span className="block font-semibold text-slate-800">{timeAgo(row.submittedAt)}</span>
                  <span className="block text-[11px] text-slate-400">{formatDateTime(row.submittedAt)}</span>
                </span>
              ),
            },
            {
              key: 'context',
              label: 'Konteks',
              render: (row) => (
                <span className="block max-w-80 text-xs">
                  <span className="block truncate font-medium text-slate-800" title={row.context}>{row.context}</span>
                  <span className={`block truncate text-[11px] ${String(row.summary).startsWith('Mendesak') ? 'font-semibold text-amber-700' : 'text-slate-500'}`} title={row.summary}>{row.summary}</span>
                </span>
              ),
            },
            { key: 'amount', label: 'Nominal', align: 'right', render: (row) => <span className="whitespace-nowrap font-mono text-sm font-semibold text-slate-900">{row.amount === null ? '-' : formatCurrency(row.amount)}</span> },
            { key: 'requestedBy', label: 'Diajukan', render: (row) => <span className="text-xs text-slate-700">{row.requestedBy?.fullName || '-'}</span> },
            {
              key: 'action',
              label: 'Aksi',
              align: 'right',
              render: (row) => <a href={financeDetailHref(row)} className="inline-block rounded-md bg-leaf-700 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-leaf-800">Periksa →</a>,
            },
          ]}
          rows={queue.data?.data || []}
          rowKey={(row) => `${row.sourceType}:${row.sourceId}`}
          loading={!queue.data && !queue.error}
          loadingText="Memuat antrean..."
          error={queue.error}
          empty={search ? 'Tidak ada yang cocok dengan pencarian.' : `Tidak ada ${active.label.toLowerCase()} yang menunggu Finance. 🎉`}
        />
        {queue.data?.total > 0 && <Pager page={page} totalPages={Math.max(1, queue.data.totalPages || 1)} total={queue.data.total} shown={queue.data.data.length} onChange={setPage} label="dokumen" />}
      </section>
    </>
  );
}
