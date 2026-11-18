import { Fragment, useState } from 'react';
import { Breadcrumb, MetricCard, Notice, PageHeader } from '../../admin/project/components/ProjectUi.jsx';
import { Pager } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate, todayIso } from '../../admin/project/utils/projectFormat.js';
import { downloadCsv } from '../../../utils/csv.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { hasPermission } from '../../../services/permissions.js';
import { addJournalAdjustment, getAccountLedger, getJournal, getTrialBalance, listAccounts, listJournals } from '../services/financeService.js';
import { ACCOUNT_TYPES, JOURNAL_SOURCE, SOURCE_HREF } from '../utils/financeFormat.js';

const PAGE_SIZE = 20;
const daysAgo = (days) => { const date = new Date(); date.setDate(date.getDate() - days); return date.toISOString().slice(0, 10); };
const label = 'text-[11px] font-bold uppercase tracking-wider text-slate-600';

/** Penyesuaian selisih biaya aktual — hanya jurnal request material (F7a). */
function AdjustmentForm({ journal, onDone }) {
  const [form, setForm] = useState({ amount: '', adjustmentDate: todayIso(), reason: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!Number(form.amount)) { setError('Nominal tidak boleh 0 (positif menambah beban, negatif mengurangi).'); return; }
    if (!form.reason.trim()) { setError('Alasan wajib diisi.'); return; }
    setBusy(true);
    try {
      const created = await addJournalAdjustment(journal.id, { amount: Number(form.amount), adjustmentDate: form.adjustmentDate, reason: form.reason.trim() });
      onDone(`Penyesuaian ${created.journalCode} dicatat.`);
    } catch (requestError) { setError(requestError.message); setBusy(false); }
  };
  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 sm:grid-cols-[9rem_10rem_minmax(0,1fr)_auto] sm:items-end">
      <label className="text-[11px] font-semibold text-slate-600">Selisih (±)<input type="number" step="any" value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} className="input-control mt-1 h-9 text-right font-mono text-xs" /></label>
      <label className="text-[11px] font-semibold text-slate-600">Tanggal bayar aktual<input type="date" max={todayIso()} value={form.adjustmentDate} onChange={(e) => setForm((c) => ({ ...c, adjustmentDate: e.target.value }))} className="input-control mt-1 h-9 text-xs" /></label>
      <label className="text-[11px] font-semibold text-slate-600">Alasan<input value={form.reason} onChange={(e) => setForm((c) => ({ ...c, reason: e.target.value }))} maxLength={2000} className="input-control mt-1 h-9 text-xs" /></label>
      <button type="button" disabled={busy} onClick={submit} className="btn btn-primary h-9 text-xs">{busy ? '...' : 'Catat'}</button>
      {error && <p className="text-xs text-red-600 sm:col-span-4">{error}</p>}
    </div>
  );
}

function JournalLines({ id, onChanged }) {
  const { data: journal, error, reload } = useRecord(() => getJournal(id), id);
  const [adjusting, setAdjusting] = useState(false);
  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (!journal) return <p className="text-xs text-slate-500">Memuat baris jurnal...</p>;
  const canAdjust = journal.source.type === 'material_request' && !journal.isReversal && !journal.reversedBy && hasPermission('journal:adjust');
  return (
    <div className="space-y-2">
      <table className="w-full text-xs">
        <tbody>
          {journal.lines.map((line) => (
            <tr key={line.id} className="border-t border-slate-200">
              <td className="w-20 py-1 font-mono">{line.account.accountCode}</td>
              <td className={`py-1 ${line.credit ? 'pl-6' : ''}`}>{line.account.accountName}</td>
              <td className="w-36 py-1 text-right font-mono">{line.debit ? formatCurrency(line.debit) : '–'}</td>
              <td className="w-36 py-1 text-right font-mono">{line.credit ? formatCurrency(line.credit) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(journal.reversalOf || journal.reversedBy) && <p className="text-[11px] text-slate-500">{journal.reversalOf ? `Membalik ${journal.reversalOf.journalCode}` : `Dibalik oleh ${journal.reversedBy.journalCode}`}</p>}
      {journal.adjustments?.length > 0 && <p className="text-[11px] text-slate-500">Penyesuaian: {journal.adjustments.map((a) => `${a.journalCode} (${a.amount > 0 ? '+' : ''}${formatCurrency(a.amount)})`).join(', ')}</p>}
      {canAdjust && (adjusting
        ? <AdjustmentForm journal={journal} onDone={(text) => { setAdjusting(false); reload(); onChanged(text); }} />
        : <button type="button" onClick={() => setAdjusting(true)} className="btn btn-secondary text-[11px]">± Catat selisih biaya aktual</button>)}
    </div>
  );
}

function JournalTab({ accounts, onNotice }) {
  const [filter, setFilter] = useState({ startDate: daysAgo(60), endDate: todayIso(), sourceType: '', accountId: '', search: '' });
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const params = { ...filter, search: filter.search.trim(), page, limit: PAGE_SIZE };
  const { data: result, error, reload } = useRecord(() => listJournals(params), JSON.stringify(params));
  const set = (field) => (event) => { setFilter((current) => ({ ...current, [field]: event.target.value })); setPage(1); };

  return (
    <>
      <section className="card-panel mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filter jurnal">
        <label className={label}>Dari<input type="date" value={filter.startDate} max={filter.endDate} onChange={set('startDate')} className="input-control mt-1 text-sm" /></label>
        <label className={label}>Sampai<input type="date" value={filter.endDate} min={filter.startDate} onChange={set('endDate')} className="input-control mt-1 text-sm" /></label>
        <label className={label}>Sumber
          <select value={filter.sourceType} onChange={set('sourceType')} className="input-control mt-1 text-sm"><option value="">Semua</option>{Object.entries(JOURNAL_SOURCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className={label}>Akun
          <select value={filter.accountId} onChange={set('accountId')} className="input-control mt-1 text-sm"><option value="">Semua akun</option>{(accounts || []).map((a) => <option key={a.id} value={a.id}>{a.accountCode} · {a.accountName}</option>)}</select>
        </label>
        <label className={label}>Cari<input value={filter.search} onChange={set('search')} className="input-control mt-1 text-sm" placeholder="Kode JRN- atau keterangan" /></label>
      </section>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="table-container">
        <div className="table-scroll-mobile overflow-x-auto">
          <table className="table-modern">
            <thead><tr><th>Tanggal</th><th>Jurnal</th><th>Keterangan</th><th>Sumber</th><th className="text-right">Nilai</th></tr></thead>
            <tbody>
              {!result && !error && <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-500">Memuat jurnal...</td></tr>}
              {result && !result.data.length && <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-500">Tidak ada jurnal pada filter ini.</td></tr>}
              {(result?.data || []).map((journal) => {
                const href = SOURCE_HREF[journal.source.type]?.(journal.source.id);
                return (
                  <Fragment key={journal.id}>
                    <tr className={journal.isReversal ? 'text-slate-500' : ''}>
                      <td className="whitespace-nowrap text-xs">{formatDate(journal.journalDate)}</td>
                      <td><button type="button" onClick={() => setExpanded(expanded === journal.id ? null : journal.id)} className="font-mono text-xs font-bold text-leaf-700 hover:underline">{journal.journalCode} {expanded === journal.id ? '▾' : '▸'}</button>{journal.isReversal && <span className="ml-1 text-[10px] font-bold uppercase text-red-600">balik</span>}{journal.reversedBy && <span className="ml-1 text-[10px] font-bold uppercase text-slate-400">dibalik</span>}</td>
                      <td className="max-w-80 text-sm">{journal.description}</td>
                      <td className="text-xs">{JOURNAL_SOURCE[journal.source.type] || journal.source.type}{journal.source.code && <span className="block font-mono text-[11px]">{href ? <a href={href} className="text-brand-700 hover:underline">{journal.source.code}</a> : journal.source.code}</span>}</td>
                      <td className="text-right font-mono text-xs font-semibold">{formatCurrency(journal.totalAmount)}</td>
                    </tr>
                    {expanded === journal.id && <tr><td colSpan={5} className="bg-slate-50"><JournalLines id={journal.id} onChanged={(text) => { onNotice(text); reload(); }} /></td></tr>}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {result?.total > 0 && <Pager page={page} totalPages={result.totalPages || 1} total={result.total} shown={result.data.length} onChange={setPage} label="jurnal" />}
      </div>
    </>
  );
}

function LedgerTab({ accounts }) {
  const [accountId, setAccountId] = useState('');
  const [range, setRange] = useState({ startDate: `${todayIso().slice(0, 8)}01`, endDate: todayIso() });
  const { data: ledger, error } = useRecord(
    () => (accountId ? getAccountLedger(accountId, range.startDate, range.endDate) : Promise.resolve(null)),
    `${accountId}:${range.startDate}:${range.endDate}`,
  );
  const exportCsv = () => downloadCsv(`buku-besar-${ledger.account.accountCode}-${range.startDate}-${range.endDate}.csv`, ledger.entries, [
    { label: 'Tanggal', value: (row) => row.journalDate },
    { label: 'Jurnal', value: (row) => row.journalCode },
    { label: 'Keterangan', value: (row) => row.description },
    { label: 'Sumber', value: (row) => row.source.code || '' },
    { label: 'Debit', value: (row) => row.debit },
    { label: 'Kredit', value: (row) => row.credit },
    { label: 'Saldo', value: (row) => row.runningBalance },
  ]);
  return (
    <>
      <section className="card-panel mb-5 grid gap-3 p-4 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] sm:items-end" aria-label="Pilih akun">
        <label className={label}>Akun
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input-control mt-1 text-sm"><option value="">- Pilih akun -</option>{(accounts || []).map((a) => <option key={a.id} value={a.id}>{a.accountCode} · {a.accountName}</option>)}</select>
        </label>
        <label className={label}>Dari<input type="date" value={range.startDate} max={range.endDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} className="input-control mt-1 text-sm" /></label>
        <label className={label}>Sampai<input type="date" value={range.endDate} min={range.startDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} className="input-control mt-1 text-sm" /></label>
        <button type="button" disabled={!ledger?.entries.length} onClick={exportCsv} className="btn btn-secondary text-xs">⬇ CSV</button>
      </section>
      {error && <Notice tone="error">{error}</Notice>}
      {!accountId && <p className="card-panel p-10 text-center text-sm text-slate-500">Pilih akun untuk melihat buku besarnya.</p>}
      {ledger && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <MetricCard label="Saldo Awal" value={formatCurrency(ledger.openingBalance)} hint={`sebelum ${formatDate(ledger.startDate)}`} />
            <MetricCard label="Total Debit" value={formatCurrency(ledger.totalDebit)} />
            <MetricCard label="Total Kredit" value={formatCurrency(ledger.totalCredit)} />
            <MetricCard label="Saldo Akhir" value={formatCurrency(ledger.closingBalance)} accent hint={`saldo normal ${ACCOUNT_TYPES[ledger.account.accountType].normal}`} />
          </div>
          <div className="table-container">
            <div className="table-scroll-mobile overflow-x-auto">
              <table className="table-modern">
                <thead><tr><th>Tanggal</th><th>Jurnal</th><th>Keterangan</th><th className="text-right">Debit</th><th className="text-right">Kredit</th><th className="text-right">Saldo</th></tr></thead>
                <tbody>
                  {!ledger.entries.length && <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-500">Tidak ada mutasi pada periode ini.</td></tr>}
                  {ledger.entries.map((row, index) => (
                    <tr key={`${row.journalEntryId}-${index}`}>
                      <td className="whitespace-nowrap text-xs">{formatDate(row.journalDate)}</td>
                      <td className="font-mono text-xs">{row.journalCode}{row.isReversal && <span className="ml-1 text-[10px] font-bold uppercase text-red-600">balik</span>}</td>
                      <td className="text-sm">{row.description}{row.source.code && <span className="block font-mono text-[11px] text-slate-400">{row.source.code}</span>}</td>
                      <td className="text-right font-mono text-xs">{row.debit ? formatCurrency(row.debit) : '–'}</td>
                      <td className="text-right font-mono text-xs">{row.credit ? formatCurrency(row.credit) : '–'}</td>
                      <td className="text-right font-mono text-xs font-semibold">{formatCurrency(row.runningBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function TrialBalanceTab() {
  const [date, setDate] = useState(todayIso());
  const { data, error } = useRecord(() => getTrialBalance(date), date);
  const exportCsv = () => downloadCsv(`neraca-saldo-${date}.csv`, data.accounts, [
    { label: 'Kode', value: (row) => row.account.accountCode },
    { label: 'Akun', value: (row) => row.account.accountName },
    { label: 'Debit', value: (row) => row.debit },
    { label: 'Kredit', value: (row) => row.credit },
    { label: 'Saldo', value: (row) => row.balance },
  ]);
  return (
    <>
      <section className="card-panel mb-5 flex flex-wrap items-end gap-3 p-4" aria-label="Tanggal neraca">
        <label className={label}>Per tanggal<input type="date" value={date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} className="input-control mt-1 text-sm" /></label>
        <button type="button" disabled={!data} onClick={exportCsv} className="btn btn-secondary text-xs">⬇ CSV</button>
        {data && <span className={`ml-auto inline-flex rounded-full border px-3 py-1 text-xs font-bold ${data.totals.isBalanced ? 'border-leaf-200 bg-leaf-50 text-leaf-700' : 'border-red-200 bg-red-50 text-red-700'}`}>● {data.totals.isBalanced ? 'SEIMBANG' : 'TIDAK SEIMBANG'}</span>}
      </section>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="table-container">
        <div className="table-scroll-mobile overflow-x-auto">
          <table className="table-modern">
            <thead><tr><th>Kode</th><th>Akun</th><th className="text-right">Debit</th><th className="text-right">Kredit</th><th className="text-right">Saldo</th></tr></thead>
            <tbody>
              {!data && !error && <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-500">Memuat neraca saldo...</td></tr>}
              {(data?.accounts || []).map((row) => (
                <tr key={row.account.id} className={!row.debit && !row.credit ? 'text-slate-400' : ''}>
                  <td className="font-mono text-xs">{row.account.accountCode}</td>
                  <td className="text-sm">{row.account.accountName}<span className="block text-[11px] text-slate-400">{ACCOUNT_TYPES[row.account.accountType].label}</span></td>
                  <td className="text-right font-mono text-xs">{formatCurrency(row.debit)}</td>
                  <td className="text-right font-mono text-xs">{formatCurrency(row.credit)}</td>
                  <td className="text-right font-mono text-xs font-semibold">{formatCurrency(row.balance)}</td>
                </tr>
              ))}
              {data && (
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <td colSpan={2} className="text-xs uppercase tracking-wider">Total</td>
                  <td className="text-right font-mono text-xs">{formatCurrency(data.totals.debit)}</td>
                  <td className="text-right font-mono text-xs">{formatCurrency(data.totals.credit)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const TABS = [['jurnal', 'Daftar Jurnal'], ['buku-besar', 'Buku Besar per Akun'], ['neraca', 'Neraca Saldo']];

/** General Ledger — jurnal lahir dari dokumen sumber (tanpa input jurnal bebas, F2); laporan dihitung backend. */
export default function GeneralLedgerPage() {
  const [tab, setTab] = useState('jurnal');
  const [notice, setNotice] = useState('');
  const { data: accounts } = useRecord(() => listAccounts(), 'accounts');
  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Finance' }, { label: 'General Ledger' }]} />
      <PageHeader title="General Ledger" subtitle="Jurnal tercatat otomatis dari dokumen sumbernya (tagihan, pembayaran, kas lapangan, upah, gaji, pengeluaran manual). Koreksi = batalkan dokumen sumbernya." />
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>
      <nav className="mb-5 flex gap-6 border-b border-slate-200" aria-label="Laporan GL">
        {TABS.map(([key, text]) => (
          <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined} className={`-mb-px border-b-2 px-1 pb-3 text-sm font-semibold transition ${tab === key ? 'border-brand-600 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{text}</button>
        ))}
      </nav>
      {tab === 'jurnal' && <JournalTab accounts={accounts} onNotice={setNotice} />}
      {tab === 'buku-besar' && <LedgerTab accounts={accounts} />}
      {tab === 'neraca' && <TrialBalanceTab />}
    </>
  );
}
