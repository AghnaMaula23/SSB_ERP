import { Fragment, useState } from 'react';
import { Breadcrumb, MetricCard, Notice, PageHeader } from '../../admin/project/components/ProjectUi.jsx';
import { Field, FormError } from '../../admin/project/components/FormPage.jsx';
import { Pager, RejectReasonForm } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate, todayIso } from '../../admin/project/utils/projectFormat.js';
import { PAYMENT_METHODS } from '../../admin/income/utils/incomeFormat.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { hasPermission } from '../../../services/permissions.js';
import { createManualExpense, listManualExpenses, voidManualExpense } from '../services/financeService.js';

const PAGE_SIZE = 15;
const MAX_FILES = 10;
const emptyForm = () => ({ expenseDate: todayIso(), amount: '', payeeName: '', paymentMethod: 'transfer', description: '', reason: '' });

/** Form pengeluaran manual — dibuat = sah + jurnal Dr Beban Pengeluaran Manual / Cr Kas (F9). */
function ExpenseForm({ onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!(Number(form.amount) > 0)) { setError('Nominal harus lebih dari 0.'); return; }
    if (!form.description.trim() || !form.reason.trim()) { setError('Keterangan dan alasan wajib diisi.'); return; }
    if (!files.length || files.length > MAX_FILES) { setError(`Lampiran wajib 1–${MAX_FILES} file (kuitansi, invoice, bukti transfer).`); return; }
    setBusy(true);
    setError('');
    try {
      const saved = await createManualExpense(form, files);
      setForm(emptyForm());
      setFiles([]);
      event.target.reset();
      onSaved(`${saved.expenseCode} ${formatCurrency(saved.amount)} dicatat dan dijurnal.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="card-panel h-fit space-y-4 p-4" aria-label="Form pengeluaran manual">
      <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Catat Pengeluaran</p>
      <FormError>{error}</FormError>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <Field label="Tanggal keluar uang" htmlFor="mex-date" required><input id="mex-date" type="date" max={todayIso()} value={form.expenseDate} onChange={set('expenseDate')} className="input-control text-sm" /></Field>
        <Field label="Nominal" htmlFor="mex-amount" required><input id="mex-amount" type="number" min="0" step="any" value={form.amount} onChange={set('amount')} className="input-control text-right font-mono text-sm" /></Field>
        <Field label="Penerima" htmlFor="mex-payee"><input id="mex-payee" value={form.payeeName} onChange={set('payeeName')} maxLength={150} className="input-control text-sm" /></Field>
        <Field label="Metode" htmlFor="mex-method">
          <select id="mex-method" value={form.paymentMethod} onChange={set('paymentMethod')} className="input-control text-sm">{Object.entries(PAYMENT_METHODS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
      </div>
      <Field label="Keterangan" htmlFor="mex-desc" required><input id="mex-desc" value={form.description} onChange={set('description')} maxLength={5000} className="input-control text-sm" placeholder="Mis. tagihan internet kantor November" /></Field>
      <Field label="Alasan lewat pengeluaran manual" htmlFor="mex-reason" required hint="Pengeluaran yang belum punya modul sendiri."><input id="mex-reason" value={form.reason} onChange={set('reason')} maxLength={5000} className="input-control text-sm" /></Field>
      <Field label={`Lampiran (1–${MAX_FILES})`} htmlFor="mex-files" required hint="PDF, JPG, PNG, atau WebP, maks 10 MB per file.">
        <input id="mex-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setFiles([...event.target.files])} className="block w-full text-xs" />
      </Field>
      <button type="submit" disabled={busy} className="btn btn-primary w-full text-xs">{busy ? 'Menyimpan...' : 'Catat & Jurnal'}</button>
    </form>
  );
}

/** Pengeluaran Finance yang belum punya modul sendiri. Koreksi = void (jurnal balik) lalu catat ulang. */
export default function ManualExpensePage() {
  const [filter, setFilter] = useState({ startDate: `${todayIso().slice(0, 8)}01`, endDate: todayIso(), voided: '', search: '' });
  const [page, setPage] = useState(1);
  const [voiding, setVoiding] = useState(null);
  const [notice, setNotice] = useState('');
  const canCreate = hasPermission('manual-expense:create');
  const params = { ...filter, search: filter.search.trim(), page, limit: PAGE_SIZE };
  const { data: result, error, reload } = useRecord(() => listManualExpenses(params), JSON.stringify(params));
  const set = (field) => (event) => { setFilter((current) => ({ ...current, [field]: event.target.value })); setPage(1); };
  const active = (result?.data || []).filter((row) => !row.isVoided);

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Finance' }, { label: 'Pengeluaran Manual' }]} />
      <PageHeader title="Pengeluaran Manual" subtitle="Pengeluaran Finance di luar modul lain. Langsung sah dan dijurnal ke Beban Pengeluaran Manual / Kas bertanggal hari uang keluar." />
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>
      {error && <Notice tone="error">{error}</Notice>}

      <div className={`grid gap-5 ${canCreate ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}`}>
        <div className="min-w-0">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <MetricCard label="Total halaman ini (aktif)" value={formatCurrency(active.reduce((s, r) => s + r.amount, 0))} accent loading={!result && !error} hint={`${active.length} pengeluaran`} />
            <MetricCard label="Semua sesuai filter" value={result ? `${result.total} catatan` : '…'} loading={!result && !error} />
          </div>
          <section className="card-panel mb-4 grid gap-3 p-4 sm:grid-cols-4" aria-label="Filter">
            <input type="date" value={filter.startDate} max={filter.endDate} onChange={set('startDate')} className="input-control text-xs" aria-label="Dari" />
            <input type="date" value={filter.endDate} min={filter.startDate} onChange={set('endDate')} className="input-control text-xs" aria-label="Sampai" />
            <select value={filter.voided} onChange={set('voided')} className="input-control text-xs" aria-label="Status"><option value="">Semua</option><option value="false">Aktif</option><option value="true">Dibatalkan</option></select>
            <input value={filter.search} onChange={set('search')} className="input-control text-xs" placeholder="Cari kode / keterangan" aria-label="Cari" />
          </section>
          <div className="table-container">
            <div className="table-scroll-mobile overflow-x-auto">
              <table className="table-modern">
                <thead><tr><th>Kode</th><th>Tanggal</th><th>Keterangan</th><th className="text-right">Nominal</th><th className="text-right">Aksi</th></tr></thead>
                <tbody>
                  {!result && !error && <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-500">Memuat...</td></tr>}
                  {result && !result.data.length && <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-500">Belum ada pengeluaran pada filter ini.</td></tr>}
                  {(result?.data || []).map((row) => (
                    <Fragment key={row.id}>
                      <tr className={row.isVoided ? 'text-slate-400' : ''}>
                        <td className="font-mono text-xs font-bold">{row.expenseCode}{row.isVoided && <span className="block text-[10px] font-bold uppercase text-red-600">dibatalkan</span>}</td>
                        <td className="whitespace-nowrap text-xs">{formatDate(row.expenseDate)}</td>
                        <td className="text-sm">{row.description}<span className="block text-[11px] text-slate-400">{row.payeeName || '-'} · {PAYMENT_METHODS[row.paymentMethod] || '-'} · {row.attachmentCount} lampiran{row.isVoided ? ` · ${row.voidReason}` : ''}</span></td>
                        <td className={`text-right font-mono text-xs font-semibold ${row.isVoided ? 'line-through' : ''}`}>{formatCurrency(row.amount)}</td>
                        <td className="text-right">{!row.isVoided && canCreate && <button type="button" onClick={() => setVoiding(row.id)} className="btn btn-ghost px-2 py-1 text-[11px] text-red-600">Void</button>}</td>
                      </tr>
                      {voiding === row.id && (
                        <tr><td colSpan={5} className="bg-red-50/60"><RejectReasonForm label={`Alasan void ${row.expenseCode}`} submitLabel="Void" requiredMessage="Alasan wajib diisi." onSubmit={async (reason) => { await voidManualExpense(row.id, reason); setVoiding(null); setNotice(`${row.expenseCode} dibatalkan — jurnal dibalik.`); reload(); }} onCancel={() => setVoiding(null)} /></td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {result?.total > 0 && <Pager page={page} totalPages={result.totalPages || 1} total={result.total} shown={result.data.length} onChange={setPage} label="pengeluaran" />}
          </div>
        </div>
        {canCreate && <ExpenseForm onSaved={(text) => { setNotice(text); reload(); }} />}
      </div>
    </>
  );
}
