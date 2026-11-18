import { Fragment, useState } from 'react';
import { Breadcrumb, Notice, PageHeader, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { RejectReasonForm, StatTile } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate, todayIso } from '../../admin/project/utils/projectFormat.js';
import { IncomeBreakdown } from '../../admin/income/pages/IncomeDetailPage.jsx';
import { INCOME_STATUS, PAYMENT_METHODS, PAYMENT_STATUS, SOURCES, contextLabel } from '../../admin/income/utils/incomeFormat.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { hasPermission } from '../../../services/permissions.js';
import ClaimContexts from '../components/ClaimContexts.jsx';
import {
  approveEquipmentClaim, fetchAllPages, getEquipmentClaim, getIncomeRecord, recordIncomePayment, rejectEquipmentClaim,
  rejectIncomeRecord, verifyIncomeRecord, voidIncomePayment, voidIncomeRecord,
} from '../services/financeService.js';

const MAX_PROOFS = 10;

function SmallButton({ tone = 'leaf', disabled, onClick, children }) {
  const tones = { leaf: 'bg-leaf-700 hover:bg-leaf-800 text-white', red: 'bg-red-600 hover:bg-red-700 text-white', ghost: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50' };
  return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-md px-3 py-1.5 text-[11px] font-bold uppercase disabled:opacity-40 ${tones[tone]}`}>{children}</button>;
}

/** Catat pembayaran klien (langsung sah + jurnal Dr Kas / Cr Piutang bertanggal tanggal bayar). */
function PaymentForm({ record, onDone, onCancel }) {
  const [form, setForm] = useState({ paymentDate: todayIso(), amount: String(record.outstandingAmount), paymentMethod: 'transfer', referenceNumber: '', payerName: record.context?.clientName || '', notes: '' });
  const [proofs, setProofs] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async () => {
    if (!(Number(form.amount) > 0)) { setError('Nominal harus lebih dari 0.'); return; }
    if (proofs.length > MAX_PROOFS) { setError(`Bukti maksimal ${MAX_PROOFS} file.`); return; }
    setBusy(true);
    setError('');
    try {
      const payment = await recordIncomePayment({ incomeRecordId: record.id, ...form }, proofs);
      onDone(`${payment.paymentCode} ${formatCurrency(payment.amount)} dicatat — ${PAYMENT_STATUS[payment.record.paymentStatus].label.toLowerCase()}.`);
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  };

  const input = 'input-control mt-1 h-9 text-xs';
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="text-[11px] font-semibold text-slate-600">Tanggal uang masuk<input type="date" max={todayIso()} value={form.paymentDate} onChange={set('paymentDate')} className={input} /></label>
      <label className="text-[11px] font-semibold text-slate-600">Nominal (sisa {formatCurrency(record.outstandingAmount)})<input type="number" min="0" step="any" value={form.amount} onChange={set('amount')} className={`${input} text-right font-mono`} /></label>
      <label className="text-[11px] font-semibold text-slate-600">Metode
        <select value={form.paymentMethod} onChange={set('paymentMethod')} className={input}>{Object.entries(PAYMENT_METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </label>
      <label className="text-[11px] font-semibold text-slate-600">No. referensi<input value={form.referenceNumber} onChange={set('referenceNumber')} maxLength={100} className={input} /></label>
      <label className="text-[11px] font-semibold text-slate-600">Pembayar<input value={form.payerName} onChange={set('payerName')} maxLength={150} className={input} /></label>
      <label className="text-[11px] font-semibold text-slate-600">Bukti (opsional, ≤ {MAX_PROOFS})<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setProofs([...event.target.files])} className="mt-1 block w-full text-xs" /></label>
      <label className="text-[11px] font-semibold text-slate-600 sm:col-span-3">Catatan<input value={form.notes} onChange={set('notes')} maxLength={5000} className={input} /></label>
      {error && <p className="text-xs text-red-600 sm:col-span-3">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-3">
        <SmallButton tone="ghost" disabled={busy} onClick={onCancel}>Batal</SmallButton>
        <SmallButton disabled={busy} onClick={submit}>{busy ? 'Menyimpan...' : 'Catat Pembayaran'}</SmallButton>
      </div>
    </div>
  );
}

/** Rincian satu tagihan (dimuat saat dibuka) + aksi pembayaran & void untuk tagihan terverifikasi. */
function RecordPanel({ id, canPay, canVerify, onChanged }) {
  const { data: record, error, reload } = useRecord(() => getIncomeRecord(id), id);
  const [mode, setMode] = useState('');
  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (!record) return <p className="text-xs text-slate-500">Memuat rincian...</p>;
  const done = (text) => { setMode(''); reload(); onChanged(text); };
  const activePayments = record.payments.filter((p) => !p.isVoided);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white"><IncomeBreakdown record={record} /></div>
      {record.notes && <p className="text-xs text-slate-600">Catatan Admin: {record.notes}</p>}
      {record.payments.length > 0 && (
        <ul className="space-y-1 text-xs">
          {record.payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-1.5">
              <span className={payment.isVoided ? 'text-slate-400 line-through' : ''}>{payment.paymentCode} · {formatDate(payment.paymentDate)} · {PAYMENT_METHODS[payment.paymentMethod] || '-'}{payment.referenceNumber ? ` · ${payment.referenceNumber}` : ''}</span>
              <span className="flex items-center gap-2">
                <b className="font-mono">{formatCurrency(payment.amount)}</b>
                {!payment.isVoided && canPay && <SmallButton tone="ghost" onClick={() => setMode(`void-pay-${payment.id}`)}>Void</SmallButton>}
              </span>
              {mode === `void-pay-${payment.id}` && (
                <div className="w-full"><RejectReasonForm label={`Alasan void ${payment.paymentCode}`} submitLabel="Void Pembayaran" requiredMessage="Alasan wajib diisi." onSubmit={async (reason) => { await voidIncomePayment(payment.id, reason); done(`${payment.paymentCode} dibatalkan — jurnal dibalik.`); }} onCancel={() => setMode('')} /></div>
              )}
            </li>
          ))}
        </ul>
      )}
      {record.status === 'verified' && (
        <div className="flex flex-wrap justify-end gap-2">
          {canPay && record.outstandingAmount > 0 && mode !== 'pay' && <SmallButton onClick={() => setMode('pay')}>Catat Pembayaran</SmallButton>}
          {canVerify && !activePayments.length && mode !== 'void' && <SmallButton tone="ghost" onClick={() => setMode('void')}>Void Tagihan</SmallButton>}
        </div>
      )}
      {mode === 'pay' && <div className="rounded-lg border border-leaf-200 bg-leaf-50/40 p-3"><PaymentForm record={record} onDone={done} onCancel={() => setMode('')} /></div>}
      {mode === 'void' && <RejectReasonForm label={`Alasan void ${record.incomeCode}`} submitLabel="Void Tagihan" requiredMessage="Alasan wajib diisi." onSubmit={async (reason) => { await voidIncomeRecord(record.id, reason); done(`${record.incomeCode} dibatalkan — jurnal piutang dibalik.`); }} onCancel={() => setMode('')} />}
    </div>
  );
}

/**
 * Verifikasi Pendapatan Finance: tagihan klien (verify → piutang, catat bayar → kas),
 * dan klaim pendapatan Divisi Alat (approve → Kas Alat + jurnal alokasi).
 */
export default function RevenueVerificationPage() {
  const [view, setView] = useState('pending');
  const [expanded, setExpanded] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [notice, setNotice] = useState({ tone: 'success', text: '' });
  const [busy, setBusy] = useState(false);
  const canVerify = hasPermission('income:verify');
  const canPay = hasPermission('income-payment:create');
  const canApproveClaim = hasPermission('equipment-claim:approve');

  const { data, error, reload } = useRecord(async () => {
    const [submitted, verified, claims] = await Promise.all([
      fetchAllPages('/api/income-records', { status: 'submitted' }),
      fetchAllPages('/api/income-records', { status: 'verified' }),
      fetchAllPages('/api/equipment-income-claims', { status: 'submitted' }),
    ]);
    return { submitted, verified, claims };
  }, 'revenue');

  const receivable = (data?.verified || []).filter((row) => row.paymentStatus !== 'paid');
  const records = view === 'pending' ? data?.submitted || [] : view === 'receivable' ? receivable : (data?.verified || []).filter((row) => row.paymentStatus === 'paid');

  const say = (text, tone = 'success') => setNotice({ tone, text });
  const run = async (action, text) => {
    setBusy(true);
    say('');
    try {
      await action();
      say(text);
      setRejecting(null);
      setExpanded(null);
      reload();
    } catch (requestError) {
      say(requestError.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    ['pending', `Menunggu Verifikasi (${data?.submitted.length ?? '…'})`],
    ['receivable', `Piutang Berjalan (${data ? receivable.length : '…'})`],
    ['paid', 'Lunas'],
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Finance' }, { label: 'Verifikasi Pendapatan' }]} />
      <PageHeader title="Verifikasi & Penerimaan Pendapatan" subtitle="Verifikasi tagihan yang disusun Admin, catat uang yang masuk dari klien, dan putuskan klaim pendapatan Divisi Alat." />
      <Notice tone={notice.tone} onDismiss={() => say('')}>{notice.text}</Notice>
      {error && <Notice tone="error">{error}</Notice>}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Tagihan Menunggu" value={data ? formatCurrency(data.submitted.reduce((s, r) => s + r.totalAmount, 0)) : '…'} hint={data ? `${data.submitted.length} tagihan` : ''} icon="📋" tone="amber" />
        <StatTile label="Piutang Berjalan" value={data ? formatCurrency(receivable.reduce((s, r) => s + r.outstandingAmount, 0)) : '…'} hint={data ? `${receivable.length} tagihan` : ''} icon="💰" tone="teal" />
        <StatTile label="Klaim Alat Menunggu" value={data ? formatCurrency(data.claims.reduce((s, c) => s + c.totalAmount, 0)) : '…'} hint={data ? `${data.claims.length} klaim` : ''} icon="🚜" tone="slate" />
      </div>

      <nav className="mb-4 flex gap-6 border-b border-slate-200" aria-label="Tampilan tagihan">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" onClick={() => { setView(key); setExpanded(null); }} aria-current={view === key ? 'page' : undefined} className={`-mb-px border-b-2 px-1 pb-3 text-sm font-semibold transition ${view === key ? 'border-brand-600 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </nav>

      <section className="mb-8" aria-label="Tagihan klien">
        <div className="table-container">
          <div className="table-scroll-mobile overflow-x-auto">
            <table className="table-modern">
              <thead><tr><th>Kode</th><th>Jenis</th><th>Klien & Kontrak</th><th>Periode</th><th className="text-right">Tagihan</th><th className="text-center">Status</th><th className="text-right">Aksi</th></tr></thead>
              <tbody>
                {!data && !error && <tr><td colSpan={7} className="py-8 text-center text-xs text-slate-500">Memuat tagihan...</td></tr>}
                {data && !records.length && <tr><td colSpan={7} className="py-8 text-center text-xs text-slate-500">Tidak ada tagihan di tampilan ini.</td></tr>}
                {records.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td><button type="button" onClick={() => setExpanded(expanded === row.id ? null : row.id)} className="font-mono text-xs font-bold text-leaf-700 hover:underline">{row.incomeCode} {expanded === row.id ? '▾' : '▸'}</button></td>
                      <td className="whitespace-nowrap text-xs">{SOURCES[row.contextType]?.icon} {SOURCES[row.contextType]?.short}</td>
                      <td className="text-xs"><b className="block text-sm text-slate-900">{row.context?.clientName || '-'}</b>{contextLabel(row.context)}</td>
                      <td className="whitespace-nowrap text-xs">{formatDate(row.periodStart)} – {formatDate(row.periodEnd)}</td>
                      <td className="text-right font-mono text-sm font-semibold text-leaf-700">{formatCurrency(row.totalAmount)}{row.status === 'verified' && row.outstandingAmount > 0 && <span className="block text-[11px] font-normal text-slate-500">sisa {formatCurrency(row.outstandingAmount)}</span>}</td>
                      <td className="text-center"><StatusBadge status={row.paymentStatus || row.status} map={row.paymentStatus ? PAYMENT_STATUS : INCOME_STATUS} /></td>
                      <td>
                        {row.status === 'submitted' && canVerify && (
                          <div className="flex justify-end gap-1.5">
                            <SmallButton disabled={busy} onClick={() => window.confirm(`Verifikasi ${row.incomeCode} senilai ${formatCurrency(row.totalAmount)}? Piutang dan pendapatan langsung dijurnal.`) && run(() => verifyIncomeRecord(row.id), `${row.incomeCode} diverifikasi — piutang dijurnal.`)}>Verifikasi</SmallButton>
                            <SmallButton tone="red" disabled={busy} onClick={() => setRejecting(`r-${row.id}`)}>Tolak</SmallButton>
                          </div>
                        )}
                      </td>
                    </tr>
                    {rejecting === `r-${row.id}` && (
                      <tr><td colSpan={7} className="bg-red-50/60"><RejectReasonForm label={`Alasan menolak ${row.incomeCode}`} submitLabel="Tolak Tagihan" placeholder="Mis. volume belum sesuai berita acara" onSubmit={(notes) => run(() => rejectIncomeRecord(row.id, notes), `${row.incomeCode} ditolak.`)} onCancel={() => setRejecting(null)} /></td></tr>
                    )}
                    {expanded === row.id && (
                      <tr><td colSpan={7} className="bg-slate-50"><RecordPanel id={row.id} canPay={canPay} canVerify={canVerify} onChanged={(text) => { say(text); reload(); }} /></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mb-6" aria-label="Klaim pendapatan Divisi Alat">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-leaf-800">🚜 Klaim Pendapatan Divisi Alat</h2>
        <p className="mb-2 text-xs text-slate-500">Jam kerja yang tagihan kliennya sudah lunas. Disetujui = saldo Kas Alat bertambah + jurnal Beban Alokasi Dana Divisi Alat / Kas.</p>
        <div className="table-container">
          <div className="table-scroll-mobile overflow-x-auto">
            <table className="table-modern">
              <thead><tr><th>Klaim</th><th>Periode</th><th>Pengaju</th><th className="text-right">Jam</th><th className="text-right">Nominal</th><th className="text-right">Aksi</th></tr></thead>
              <tbody>
                {data && !data.claims.length && <tr><td colSpan={6} className="py-8 text-center text-xs text-slate-500">Tidak ada klaim yang menunggu.</td></tr>}
                {(data?.claims || []).map((claim) => (
                  <Fragment key={claim.id}>
                    <tr>
                      <td><button type="button" onClick={() => setExpanded(expanded === `c-${claim.id}` ? null : `c-${claim.id}`)} className="font-mono text-xs font-bold text-leaf-700 hover:underline">{claim.claimCode} {expanded === `c-${claim.id}` ? '▾' : '▸'}</button></td>
                      <td className="whitespace-nowrap text-xs">{formatDate(claim.periodStart)} – {formatDate(claim.periodEnd)}</td>
                      <td className="text-xs">{claim.submittedBy?.fullName || '-'}</td>
                      <td className="text-right text-xs">{claim.totalHours} jam</td>
                      <td className="text-right font-mono text-sm font-semibold text-leaf-700">{formatCurrency(claim.totalAmount)}</td>
                      <td>
                        {canApproveClaim && (
                          <div className="flex justify-end gap-1.5">
                            <SmallButton disabled={busy} onClick={() => window.confirm(`Setujui ${claim.claimCode} senilai ${formatCurrency(claim.totalAmount)}? Kas Alat bertambah dan jurnal dibuat.`) && run(() => approveEquipmentClaim(claim.id), `${claim.claimCode} disetujui — Kas Alat bertambah.`)}>Setujui</SmallButton>
                            <SmallButton tone="red" disabled={busy} onClick={() => setRejecting(`c-${claim.id}`)}>Tolak</SmallButton>
                          </div>
                        )}
                      </td>
                    </tr>
                    {rejecting === `c-${claim.id}` && (
                      <tr><td colSpan={6} className="bg-red-50/60"><RejectReasonForm label={`Alasan menolak ${claim.claimCode}`} submitLabel="Tolak Klaim" placeholder="Mis. jam kerja tidak sesuai timesheet" onSubmit={(notes) => run(() => rejectEquipmentClaim(claim.id, notes), `${claim.claimCode} ditolak.`)} onCancel={() => setRejecting(null)} /></td></tr>
                    )}
                    {expanded === `c-${claim.id}` && <tr><td colSpan={6} className="bg-slate-50"><ClaimDetail id={claim.id} /></td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function ClaimDetail({ id }) {
  const { data, error } = useRecord(() => getEquipmentClaim(id), id);
  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (!data) return <p className="text-xs text-slate-500">Memuat rincian...</p>;
  return (
    <>
      {data.notes && <p className="mb-2 text-xs text-slate-600">Catatan: {data.notes}</p>}
      <ClaimContexts contexts={data.contexts} />
    </>
  );
}
