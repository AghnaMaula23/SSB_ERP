import { useState } from 'react';
import { Breadcrumb, MetricCard, Notice, PageHeader } from '../../admin/project/components/ProjectUi.jsx';
import { Pager } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate, todayIso } from '../../admin/project/utils/projectFormat.js';
import { downloadCsv } from '../../../utils/csv.js';
import { getCashSummary, getCashTransactions } from '../../alat/services/cashService.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { monthBounds } from '../utils/financeFormat.js';

const PAGE_SIZE = 50;

/**
 * Buku kas Divisi Alat, baca saja (cash:read). Ini buku pembantu kas, BUKAN
 * General Ledger: jurnal berpasangan per akun menunggu modul Finance Accounting.
 * Debit = kas masuk, kredit = kas keluar; transaksi yang dibatalkan tidak dihitung.
 */
export default function EquipmentCashLedgerPage() {
  const initial = monthBounds(todayIso().slice(0, 7));
  const [dateFrom, setDateFrom] = useState(initial.start);
  const [dateTo, setDateTo] = useState(todayIso());
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const filters = { dateFrom, dateTo, transactionType: type, search };
  const key = `${dateFrom}|${dateTo}|${type}|${search}`;
  const summary = useRecord(() => getCashSummary({ dateFrom, dateTo }), `${dateFrom}|${dateTo}`);
  const list = useRecord(() => getCashTransactions({ ...filters, page, limit: PAGE_SIZE }), `${key}|${page}`);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const rows = list.data?.data || [];
  const pageIn = rows.filter((row) => row.type === 'masuk').reduce((sum, row) => sum + row.nominal, 0);
  const pageOut = rows.filter((row) => row.type === 'keluar').reduce((sum, row) => sum + row.nominal, 0);
  const period = summary.data?.period;
  const balanced = period ? period.net : null;
  const change = (setter) => (event) => { setter(event.target.value); setPage(1); };

  const exportCsv = async () => {
    setExporting(true);
    setExportError('');
    try {
      const all = [];
      for (let next = 1; next <= 20; next += 1) {
        const result = await getCashTransactions({ ...filters, page: next, limit: 100 });
        all.push(...result.data);
        if (all.length >= result.total) break;
      }
      downloadCsv(`buku-kas-alat-${dateFrom}-${dateTo}.csv`, all, [
        { label: 'Tanggal', value: (row) => row.date },
        { label: 'Kode', value: (row) => row.transactionCode },
        { label: 'Keterangan', value: (row) => row.description },
        { label: 'Kategori', value: (row) => row.category },
        { label: 'Sumber', value: (row) => row.sourceLabel },
        { label: 'Debit (Masuk)', value: (row) => (row.type === 'masuk' ? row.nominal : 0) },
        { label: 'Kredit (Keluar)', value: (row) => (row.type === 'keluar' ? row.nominal : 0) },
      ]);
    } catch (error) {
      setExportError(error.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Finance' }, { label: 'Buku Kas Alat' }]} />
      <PageHeader
        title="Buku Kas Divisi Alat"
        subtitle="Catatan kronologis kas masuk & keluar Divisi Alat untuk audit. General Ledger lintas akun menyusul bersama modul akuntansi."
        actions={<button type="button" onClick={exportCsv} disabled={exporting || !rows.length} className="btn btn-primary text-xs">{exporting ? 'Menyiapkan...' : '⬇ Export CSV'}</button>}
      />
      {exportError && <Notice tone="error">{exportError}</Notice>}
      {(list.error || summary.error) && <Notice tone="error">{list.error || summary.error}</Notice>}

      <section className="card-panel mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_12rem_minmax(0,1fr)]" aria-label="Filter buku kas">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Dari
          <input type="date" value={dateFrom} max={dateTo} onChange={change(setDateFrom)} className="input-control mt-1 text-sm" />
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Sampai
          <input type="date" value={dateTo} min={dateFrom} max={todayIso()} onChange={change(setDateTo)} className="input-control mt-1 text-sm" />
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Jenis
          <select value={type} onChange={change(setType)} className="input-control mt-1 text-sm">
            <option value="">Semua</option>
            <option value="cash_in">Kas masuk</option>
            <option value="cash_out">Kas keluar</option>
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Cari referensi
          <input value={search} onChange={change(setSearch)} className="input-control mt-1 text-sm" placeholder="Kode atau keterangan..." />
        </label>
      </section>

      <div className="table-container mb-5">
        <div className="table-scroll-mobile overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr><th className="w-12 text-center">No</th><th>Tanggal</th><th>Kode</th><th>Keterangan</th><th>Kategori</th><th>Sumber</th><th className="text-right">Debit (Rp)</th><th className="text-right">Kredit (Rp)</th></tr>
            </thead>
            <tbody>
              {!list.data && !list.error ? (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">Memuat buku kas...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">Tidak ada transaksi pada periode ini.</td></tr>
              ) : rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="text-center text-xs text-slate-500">{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td className="whitespace-nowrap text-xs">{formatDate(row.date)}</td>
                  <td className="font-mono text-xs font-bold text-leaf-700">{row.transactionCode}</td>
                  <td className="max-w-72 text-sm">{row.description || '-'}</td>
                  <td className="text-xs">{row.category}</td>
                  <td className="text-xs text-slate-600">{row.sourceLabel}</td>
                  <td className="text-right font-mono text-xs">{row.type === 'masuk' ? formatCurrency(row.nominal) : '–'}</td>
                  <td className="text-right font-mono text-xs">{row.type === 'keluar' ? formatCurrency(row.nominal) : '–'}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 text-sm font-bold">
                  <td colSpan={6} className="px-4 py-3 text-right text-[11px] uppercase tracking-wider text-slate-600">Total halaman ini</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(pageIn)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(pageOut)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {list.data?.total > PAGE_SIZE && <Pager page={page} totalPages={Math.ceil(list.data.total / PAGE_SIZE)} total={list.data.total} shown={rows.length} onChange={setPage} label="transaksi" />}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total Debit (Masuk) Periode" value={formatCurrency(period?.totalIn)} tone="emerald" loading={!summary.data && !summary.error} />
        <MetricCard label="Total Kredit (Keluar) Periode" value={formatCurrency(period?.totalOut)} tone="red" loading={!summary.data && !summary.error} />
        <MetricCard label="Saldo Kas Alat Saat Ini" value={formatCurrency(summary.data?.balance)} accent loading={!summary.data && !summary.error} hint={balanced === null ? undefined : `Arus bersih periode ${formatCurrency(balanced)}`} />
      </div>
    </>
  );
}
