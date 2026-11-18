import { Fragment, useState } from 'react';
import { Breadcrumb, MetricCard, MockBanner, Notice, PageHeader } from '../../admin/project/components/ProjectUi.jsx';
import { formatCurrency, formatDate, todayIso } from '../../admin/project/utils/projectFormat.js';
import { downloadCsv } from '../../../utils/csv.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { ACCOUNT_TYPES, listAccounts, listJournals } from '../services/financeMockService.js';

const SOURCE_LABEL = { manual: 'Manual', income: 'Pendapatan', payroll: 'Gaji', field_expense: 'Kas Lapangan', equipment_purchase: 'PO Alat' };

/** Buku besar berpasangan: satu jurnal = beberapa baris akun, debit = kredit. */
export default function GeneralLedgerPage({ initialNotice }) {
  const { data } = useRecord(async () => {
    const [journals, accounts] = await Promise.all([listJournals(), listAccounts()]);
    return { journals, accounts };
  }, 'gl');
  const [dateFrom, setDateFrom] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 60); return date.toISOString().slice(0, 10); });
  const [dateTo, setDateTo] = useState(todayIso());
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');

  const accountOf = (code) => data?.accounts.find((row) => row.code === code);
  const query = search.trim().toLowerCase();
  const journals = (data?.journals || []).filter((journal) => journal.date >= dateFrom && journal.date <= dateTo
    && (!type || journal.lines.some((row) => accountOf(row.accountCode)?.type === type))
    && (!query || `${journal.journalCode} ${journal.reference}`.toLowerCase().includes(query)));
  const lines = journals.flatMap((journal) => journal.lines);
  const debit = lines.reduce((sum, row) => sum + row.debit, 0);
  const credit = lines.reduce((sum, row) => sum + row.credit, 0);
  const balanced = Math.round(debit) === Math.round(credit);

  const exportCsv = () => downloadCsv(`general-ledger-${dateFrom}-${dateTo}.csv`, journals.flatMap((journal) => journal.lines.map((row) => ({ journal, row }))), [
    { label: 'Tanggal', value: ({ journal }) => journal.date },
    { label: 'ID Transaksi', value: ({ journal }) => journal.journalCode },
    { label: 'Keterangan', value: ({ journal }) => journal.reference },
    { label: 'Kode Akun', value: ({ row }) => row.accountCode },
    { label: 'Nama Akun', value: ({ row }) => accountOf(row.accountCode)?.name || '' },
    { label: 'Debit', value: ({ row }) => row.debit },
    { label: 'Kredit', value: ({ row }) => row.credit },
  ]);

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Finance' }, { label: 'General Ledger' }]} />
      <PageHeader
        title="Buku Besar Transaksi"
        subtitle="Catatan kronologis jurnal berpasangan untuk audit project."
        actions={(
          <>
            <button type="button" onClick={exportCsv} disabled={!journals.length} className="btn btn-secondary text-xs">⬇ Export CSV</button>
            <a href="#/finance/gl/new" className="btn btn-primary text-xs">+ Jurnal Manual</a>
          </>
        )}
      />
      <MockBanner>Modul Finance Accounting belum ada di backend — jurnal di sini data contoh. Verifikasi pendapatan dan pembayaran gaji staf ikut menulis jurnal contoh.</MockBanner>
      <Notice tone="success">{initialNotice}</Notice>

      <section className="card-panel mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_12rem_minmax(0,1fr)]" aria-label="Filter jurnal">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Dari
          <input type="date" value={dateFrom} max={dateTo} onChange={(event) => setDateFrom(event.target.value)} className="input-control mt-1 text-sm" />
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Sampai
          <input type="date" value={dateTo} min={dateFrom} onChange={(event) => setDateTo(event.target.value)} className="input-control mt-1 text-sm" />
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Golongan akun
          <select value={type} onChange={(event) => setType(event.target.value)} className="input-control mt-1 text-sm">
            <option value="">Semua akun</option>
            {Object.entries(ACCOUNT_TYPES).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Cari referensi
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-control mt-1 text-sm" placeholder="ID atau keterangan..." />
        </label>
      </section>

      <div className="table-container mb-5">
        <div className="table-scroll-mobile overflow-x-auto">
          <table className="table-modern">
            <thead><tr><th className="w-12 text-center">No</th><th>Tanggal</th><th>ID Transaksi</th><th>Keterangan</th><th>Kode Akun</th><th>Nama Akun</th><th className="text-right">Debit (Rp)</th><th className="text-right">Kredit (Rp)</th></tr></thead>
            <tbody>
              {!data ? (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">Memuat jurnal...</td></tr>
              ) : journals.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">Tidak ada jurnal pada periode ini.</td></tr>
              ) : journals.map((journal, index) => (
                <Fragment key={journal.id}>
                  {journal.lines.map((row, lineIndex) => (
                    <tr key={`${journal.id}-${lineIndex}`} className={lineIndex === 0 ? 'border-t-2 border-slate-200' : ''}>
                      {lineIndex === 0 && (
                        <>
                          <td rowSpan={journal.lines.length} className="text-center text-xs text-slate-500">{index + 1}</td>
                          <td rowSpan={journal.lines.length} className="whitespace-nowrap text-xs">{formatDate(journal.date)}</td>
                          <td rowSpan={journal.lines.length} className="font-mono text-xs font-bold text-leaf-700">{journal.journalCode}<span className="block font-sans text-[10px] font-semibold uppercase text-slate-400">{SOURCE_LABEL[journal.source] || journal.source}</span></td>
                          <td rowSpan={journal.lines.length} className="max-w-56 text-sm">{journal.reference}</td>
                        </>
                      )}
                      <td className="font-mono text-xs">{row.accountCode}</td>
                      <td className={`text-sm ${row.credit ? 'pl-8' : ''}`}>{accountOf(row.accountCode)?.name || '-'}</td>
                      <td className="text-right font-mono text-xs">{row.debit ? formatCurrency(row.debit) : '–'}</td>
                      <td className="text-right font-mono text-xs">{row.credit ? formatCurrency(row.credit) : '–'}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total Debit Periode" value={formatCurrency(debit)} loading={!data} />
        <MetricCard label="Total Kredit Periode" value={formatCurrency(credit)} loading={!data} />
        <article className="card-panel p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status Rekonsiliasi</p>
          <p className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${balanced ? 'border-leaf-200 bg-leaf-50 text-leaf-700' : 'border-red-200 bg-red-50 text-red-700'}`}>● {balanced ? 'BALANCED' : 'TIDAK SEIMBANG'}</p>
          <p className="mt-1 text-[11px] text-slate-500">Selisih {formatCurrency(debit - credit)}</p>
        </article>
      </div>
    </>
  );
}
