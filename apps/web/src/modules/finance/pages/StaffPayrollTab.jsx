import { Fragment, useState } from 'react';
import { MetricCard, Notice, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { RejectReasonForm } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate, todayIso } from '../../admin/project/utils/projectFormat.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { hasPermission } from '../../../services/permissions.js';
import {
  cancelPayroll, createCompensation, createPayroll, fetchAllPages, finalizePayroll, getPayroll, listCompensations,
  listPayrolls, payPayroll, regeneratePayroll, replacePayrollComponents, voidPayroll,
} from '../services/financeService.js';

const PAYROLL_STATUS = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  finalized: { label: 'Dikunci', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  paid: { label: 'Dibayar', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  cancelled: { label: 'Dibatalkan', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  voided: { label: 'Dibatalkan setelah bayar', className: 'bg-red-50 text-red-700 border-red-200' },
};
const DEPARTMENT = { kantor: 'Kantor', finance: 'Finance', divisi_alat: 'Divisi Alat', lapangan: 'Lapangan' };
const MAX_PROOFS = 10;
const btn = 'rounded-md px-3 py-1.5 text-[11px] font-bold uppercase disabled:opacity-40';

/** Ganti seluruh komponen manual satu karyawan (draft). Gaji Pokok sistem tidak tersentuh. */
function ComponentEditor({ payrollId, item, onSaved, onCancel }) {
  const [rows, setRows] = useState(() => item.components.filter((c) => !c.isSystem).map((c) => ({ ...c, amount: String(c.amount), key: c.id })));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setRow = (key, patch) => setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const save = async () => {
    const clean = rows.filter((r) => r.componentName.trim() || r.amount);
    if (clean.some((r) => !r.componentName.trim() || !(Number(r.amount) > 0))) { setError('Setiap baris wajib bernama dan bernominal > 0.'); return; }
    setBusy(true);
    try {
      await replacePayrollComponents(payrollId, item.id, clean.map((r) => ({ componentType: r.componentType, componentName: r.componentName.trim(), amount: Number(r.amount), ...(r.notes?.trim() && { notes: r.notes.trim() }) })));
      onSaved(`Komponen gaji ${item.employee.fullName} disimpan.`);
    } catch (requestError) { setError(requestError.message); setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-lg border border-brand-200 bg-white p-3">
      <p className="text-[11px] text-slate-500">Tunjangan, lembur, potongan kasbon, BPJS/PPh 21 (dihitung di luar sistem), atau pro-rata.</p>
      {rows.map((row) => (
        <div key={row.key} className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_9rem_2rem]">
          <select value={row.componentType} onChange={(e) => setRow(row.key, { componentType: e.target.value })} className="input-control h-9 text-xs" aria-label="Jenis">
            <option value="earning">+ Tambahan</option><option value="deduction">− Potongan</option>
          </select>
          <input value={row.componentName} onChange={(e) => setRow(row.key, { componentName: e.target.value })} maxLength={100} placeholder="Nama komponen" className="input-control h-9 text-xs" aria-label="Nama" />
          <input type="number" min="0" step="any" value={row.amount} onChange={(e) => setRow(row.key, { amount: e.target.value })} className="input-control h-9 text-right font-mono text-xs" aria-label="Nominal" />
          <button type="button" onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))} className="text-sm font-bold text-slate-400 hover:text-red-600" aria-label="Hapus baris">✕</button>
        </div>
      ))}
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), componentType: 'earning', componentName: '', amount: '' }])} className="btn btn-secondary text-[11px]">+ Baris</button>
        <span className="flex gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className={`${btn} border border-slate-300 bg-white text-slate-700`}>Batal</button>
          <button type="button" disabled={busy} onClick={save} className={`${btn} bg-leaf-700 text-white`}>{busy ? '...' : 'Simpan'}</button>
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function PayForm({ payroll, onDone, onCancel }) {
  const [form, setForm] = useState({ paymentDate: todayIso(), paymentReference: '', notes: '' });
  const [proofs, setProofs] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (proofs.length > MAX_PROOFS) { setError(`Bukti maksimal ${MAX_PROOFS} file.`); return; }
    setBusy(true);
    try {
      await payPayroll(payroll.id, form, proofs);
      onDone(`${payroll.payrollCode} dibayar ${formatCurrency(payroll.totalNet)} — jurnal Beban Gaji / Kas dibuat.`);
    } catch (requestError) { setError(requestError.message); setBusy(false); }
  };
  return (
    <div className="grid gap-2 rounded-lg border border-leaf-200 bg-leaf-50/40 p-3 sm:grid-cols-4 sm:items-end">
      <label className="text-[11px] font-semibold text-slate-600">Tanggal transfer<input type="date" max={todayIso()} value={form.paymentDate} onChange={(e) => setForm((c) => ({ ...c, paymentDate: e.target.value }))} className="input-control mt-1 h-9 text-xs" /></label>
      <label className="text-[11px] font-semibold text-slate-600">No. referensi<input value={form.paymentReference} onChange={(e) => setForm((c) => ({ ...c, paymentReference: e.target.value }))} maxLength={100} className="input-control mt-1 h-9 text-xs" /></label>
      <label className="text-[11px] font-semibold text-slate-600">Bukti (opsional)<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setProofs([...e.target.files])} className="mt-1 block w-full text-xs" /></label>
      <span className="flex gap-2">
        <button type="button" disabled={busy} onClick={onCancel} className={`${btn} border border-slate-300 bg-white text-slate-700`}>Batal</button>
        <button type="button" disabled={busy} onClick={submit} className={`${btn} bg-leaf-700 text-white`}>{busy ? '...' : 'Tandai Dibayar'}</button>
      </span>
      <label className="text-[11px] font-semibold text-slate-600 sm:col-span-4">Catatan<input value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} maxLength={5000} className="input-control mt-1 h-9 text-xs" /></label>
      {error && <p className="text-xs text-red-600 sm:col-span-4">{error}</p>}
    </div>
  );
}

function PayrollDetail({ id, onChanged }) {
  const { data: payroll, error, reload } = useRecord(() => getPayroll(id), id);
  const [mode, setMode] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const canCreate = hasPermission('payroll:create');
  const canPay = hasPermission('payroll:pay');
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!payroll) return <p className="card-panel p-8 text-center text-sm text-slate-500">Memuat payroll...</p>;

  const done = (text) => { setMode(''); setEditing(null); setActionError(''); reload(); onChanged(text); };
  const act = async (fn, text) => {
    setBusy(true);
    setActionError('');
    try {
      const result = await fn();
      done(result?.skipped?.length ? `${text} ${result.skipped.length} karyawan dilewati karena belum punya gaji pokok: ${result.skipped.map((s) => s.fullName).join(', ')}.` : text);
    } catch (requestError) { setActionError(requestError.message); } finally { setBusy(false); }
  };
  const status = payroll.status;

  return (
    <section className="card-panel overflow-hidden" aria-label={`Payroll ${payroll.period}`}>
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-sm font-bold text-slate-900">{payroll.payrollCode}</h2>
          <StatusBadge status={status} map={PAYROLL_STATUS} />
          {payroll.replacesPayroll && <span className="text-[11px] text-slate-500">pengganti {payroll.replacesPayroll.payrollCode}</span>}
          {status === 'paid' && <span className="text-[11px] text-slate-500">dibayar {formatDate(payroll.paymentDate)}{payroll.paymentReference ? ` · ${payroll.paymentReference}` : ''}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {status === 'draft' && canCreate && <>
            <button type="button" disabled={busy} onClick={() => act(() => regeneratePayroll(payroll.id), 'Karyawan & gaji ditarik ulang.')} className={`${btn} border border-slate-300 bg-white text-slate-700`}>⟳ Tarik ulang</button>
            <button type="button" disabled={busy} onClick={() => window.confirm(`Kunci nominal ${payroll.payrollCode} (${formatCurrency(payroll.totalNet)})? Komponen tidak bisa diubah lagi.`) && act(() => finalizePayroll(payroll.id), `${payroll.payrollCode} dikunci — siap ditransfer.`)} className={`${btn} bg-brand-700 text-white`}>Finalisasi</button>
          </>}
          {status === 'finalized' && canPay && mode !== 'pay' && <button type="button" onClick={() => setMode('pay')} className={`${btn} bg-leaf-700 text-white`}>Bayar</button>}
          {['draft', 'finalized'].includes(status) && canCreate && mode !== 'cancel' && <button type="button" onClick={() => setMode('cancel')} className={`${btn} bg-red-600 text-white`}>Batalkan</button>}
          {status === 'paid' && canPay && mode !== 'void' && <button type="button" onClick={() => setMode('void')} className={`${btn} border border-red-300 bg-white text-red-600`}>Void</button>}
        </div>
      </div>
      <div className="space-y-2 px-4 py-3 empty:hidden">
        {actionError && <Notice tone="error">{actionError}</Notice>}
        {mode === 'pay' && <PayForm payroll={payroll} onDone={done} onCancel={() => setMode('')} />}
        {mode === 'cancel' && <RejectReasonForm label="Alasan membatalkan payroll" submitLabel="Batalkan Payroll" requiredMessage="Alasan wajib diisi." onSubmit={async (reason) => { await cancelPayroll(payroll.id, reason); done(`${payroll.payrollCode} dibatalkan.`); }} onCancel={() => setMode('')} />}
        {mode === 'void' && <RejectReasonForm label="Alasan void (koreksi setelah bayar)" submitLabel="Void Payroll" requiredMessage="Alasan wajib diisi." onSubmit={async (reason) => { await voidPayroll(payroll.id, reason); done(`${payroll.payrollCode} dibatalkan — jurnal dibalik. Buat payroll pengganti untuk bulan ini.`); }} onCancel={() => setMode('')} />}
        {payroll.voidReason && <p className="text-xs text-red-700">Alasan void: {payroll.voidReason}</p>}
        {payroll.cancelReason && <p className="text-xs text-slate-600">Alasan batal: {payroll.cancelReason}</p>}
      </div>
      <div className="table-scroll-mobile overflow-x-auto">
        <table className="table-modern">
          <thead><tr><th>Karyawan</th><th>Rekening</th><th className="text-right">Pendapatan</th><th className="text-right">Potongan</th><th className="text-right">Gaji Bersih</th><th /></tr></thead>
          <tbody>
            {!payroll.items.length && <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-500">Belum ada karyawan bergaji pokok aktif di bulan ini.</td></tr>}
            {payroll.items.map((item) => (
              <Fragment key={item.id}>
                <tr>
                  <td className="text-sm"><b>{item.employee.fullName}</b><span className="block font-mono text-[11px] text-slate-400">{item.employee.employeeCode} · {DEPARTMENT[item.employee.department] || item.employee.department}</span></td>
                  <td className="text-xs">{item.employee.bankName ? `${item.employee.bankName} ${item.employee.accountNumber || ''}` : <span className="text-slate-400">-</span>}</td>
                  <td className="text-right font-mono text-xs">{formatCurrency(item.earnings)}<span className="block text-[11px] text-slate-400">{item.components.filter((c) => c.componentType === 'earning').map((c) => c.componentName).join(', ')}</span></td>
                  <td className="text-right font-mono text-xs text-red-600">{item.deductions ? `(${formatCurrency(item.deductions)})` : '–'}<span className="block text-[11px] text-slate-400">{item.components.filter((c) => c.componentType === 'deduction').map((c) => c.componentName).join(', ')}</span></td>
                  <td className="text-right font-mono text-sm font-bold">{formatCurrency(item.net)}</td>
                  <td className="text-right">{status === 'draft' && canCreate && <button type="button" onClick={() => setEditing(editing === item.id ? null : item.id)} className="btn btn-ghost px-2 py-1 text-[11px]">✎ Komponen</button>}</td>
                </tr>
                {editing === item.id && <tr><td colSpan={6} className="bg-slate-50"><ComponentEditor payrollId={payroll.id} item={item} onSaved={done} onCancel={() => setEditing(null)} /></td></tr>}
              </Fragment>
            ))}
            {payroll.items.length > 0 && (
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                <td colSpan={2} className="text-xs uppercase tracking-wider">Total ({payroll.employeeCount} karyawan)</td>
                <td className="text-right font-mono text-xs">{formatCurrency(payroll.totalEarnings)}</td>
                <td className="text-right font-mono text-xs">{formatCurrency(payroll.totalDeductions)}</td>
                <td className="text-right font-mono text-sm">{formatCurrency(payroll.totalNet)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {payroll.journalEntries.length > 0 && <p className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500">Jurnal: {payroll.journalEntries.map((j) => `${j.journalCode}${j.isReversal ? ' (balik)' : ''}`).join(', ')}</p>}
    </section>
  );
}

/** Riwayat gaji pokok satu karyawan + tetapkan gaji baru (kenaikan = baris baru). */
function CompensationPanel({ employee, onSaved }) {
  const { data: rows, error, reload } = useRecord(() => listCompensations(employee.id), employee.id);
  const [form, setForm] = useState({ baseSalary: '', effectiveStartDate: todayIso(), notes: '' });
  const [formError, setFormError] = useState('');
  const canCreate = hasPermission('compensation:create');
  const save = async () => {
    if (!(Number(form.baseSalary) > 0)) { setFormError('Gaji pokok harus lebih dari 0.'); return; }
    try {
      await createCompensation({ employeeId: employee.id, baseSalary: Number(form.baseSalary), effectiveStartDate: form.effectiveStartDate, ...(form.notes.trim() && { notes: form.notes.trim() }) });
      setForm({ baseSalary: '', effectiveStartDate: todayIso(), notes: '' });
      setFormError('');
      reload();
      onSaved(`Gaji pokok ${employee.fullName} dicatat.`);
    } catch (requestError) { setFormError(requestError.message); }
  };
  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ul className="space-y-1 text-xs">
        {(rows || []).map((row) => <li key={row.id} className={row.isCurrent ? 'font-semibold text-slate-900' : 'text-slate-500'}>{formatDate(row.effectiveStartDate)} · {formatCurrency(row.baseSalary)}{row.isCurrent ? ' (berlaku)' : ''}{row.notes ? ` · ${row.notes}` : ''}</li>)}
        {rows && !rows.length && <li className="text-amber-700">Belum ada gaji pokok — karyawan ini tidak masuk payroll.</li>}
      </ul>
      {canCreate && (
        <div className="grid gap-2 sm:grid-cols-[9rem_10rem_minmax(0,1fr)_auto] sm:items-end">
          <label className="text-[11px] font-semibold text-slate-600">Gaji pokok baru<input type="number" min="0" step="any" value={form.baseSalary} onChange={(e) => setForm((c) => ({ ...c, baseSalary: e.target.value }))} className="input-control mt-1 h-9 text-right font-mono text-xs" /></label>
          <label className="text-[11px] font-semibold text-slate-600">Berlaku mulai<input type="date" value={form.effectiveStartDate} onChange={(e) => setForm((c) => ({ ...c, effectiveStartDate: e.target.value }))} className="input-control mt-1 h-9 text-xs" /></label>
          <label className="text-[11px] font-semibold text-slate-600">Catatan<input value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} maxLength={5000} className="input-control mt-1 h-9 text-xs" /></label>
          <button type="button" onClick={save} className={`${btn} h-9 bg-leaf-700 text-white`}>Simpan</button>
          {formError && <p className="text-xs text-red-600 sm:col-span-4">{formError}</p>}
        </div>
      )}
    </div>
  );
}

function EmployeeSalaries({ onNotice }) {
  const { data: employees, error } = useRecord(() => fetchAllPages('/api/employees', { active: 'true' }), 'employees');
  const [open, setOpen] = useState(null);
  return (
    <section className="card-panel mt-6 overflow-hidden" aria-label="Gaji pokok karyawan">
      <p className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900">Gaji Pokok Karyawan Aktif <span className="font-normal text-slate-500">· master karyawan dikelola Admin</span></p>
      {error && <p className="px-4 py-3 text-xs text-red-600">{error}</p>}
      <ul>
        {(employees || []).map((employee) => (
          <li key={employee.id} className="border-t border-slate-100 px-4 py-2.5 first:border-t-0">
            <button type="button" onClick={() => setOpen(open === employee.id ? null : employee.id)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
              <span className="text-sm"><b>{employee.fullName}</b> <span className="font-mono text-[11px] text-slate-400">{employee.employeeCode}</span> <span className="text-[11px] text-slate-500">· {DEPARTMENT[employee.department]}{employee.positionName ? ` · ${employee.positionName}` : ''}</span></span>
              <span className="text-[11px] font-semibold text-brand-700">{open === employee.id ? 'Tutup ▾' : 'Riwayat gaji ▸'}</span>
            </button>
            {open === employee.id && <div className="mt-2"><CompensationPanel employee={employee} onSaved={onNotice} /></div>}
          </li>
        ))}
        {employees && !employees.length && <li className="px-4 py-6 text-center text-sm text-slate-500">Belum ada karyawan aktif. Admin menambahkannya di menu Master Karyawan.</li>}
      </ul>
    </section>
  );
}

/** Gaji bulanan staf: satu payroll aktif per bulan (draft → dikunci → dibayar), plus riwayat gaji pokok. */
export default function StaffPayrollTab({ month }) {
  const [year, monthNumber] = month.split('-').map(Number);
  const { data: result, error, reload } = useRecord(() => listPayrolls({ year, limit: 100 }), month);
  const [notice, setNotice] = useState({ tone: 'success', text: '' });
  const [busy, setBusy] = useState(false);
  const canCreate = hasPermission('payroll:create');
  const forMonth = (result?.data || []).filter((p) => p.month === monthNumber);
  const active = forMonth.find((p) => !['cancelled', 'voided'].includes(p.status));
  const lastVoided = forMonth.find((p) => p.status === 'voided' && !p.replacedBy?.some((r) => !['cancelled', 'voided'].includes(r.status)));
  const [selected, setSelected] = useState(null);
  const shown = selected && forMonth.some((p) => p.id === selected) ? selected : active?.id;

  const create = async (replacesPayrollId) => {
    setBusy(true);
    try {
      const created = await createPayroll({ year, month: monthNumber, ...(replacesPayrollId && { replacesPayrollId }) });
      const skipped = created.skipped || [];
      setNotice({ tone: skipped.length ? 'warning' : 'success', text: `${created.data.payrollCode} dibuat (${created.data.employeeCount} karyawan).${skipped.length ? ` ${skipped.length} karyawan aktif dilewati karena belum punya gaji pokok: ${skipped.map((s) => s.fullName).join(', ')}.` : ''}` });
      setSelected(created.data.id);
      reload();
    } catch (requestError) {
      setNotice({ tone: 'error', text: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total Gaji Bersih" value={formatCurrency(active?.totalNet)} accent loading={!result && !error} hint={active ? `${active.employeeCount} karyawan · ${PAYROLL_STATUS[active.status].label}` : 'Belum ada payroll bulan ini'} />
        <MetricCard label="Total Pendapatan" value={formatCurrency(active?.totalEarnings)} loading={!result && !error} />
        <MetricCard label="Total Potongan" value={formatCurrency(active?.totalDeductions)} tone={active?.totalDeductions ? 'red' : 'slate'} loading={!result && !error} />
      </div>

      {forMonth.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {forMonth.map((p) => <button key={p.id} type="button" onClick={() => setSelected(p.id)} className={`rounded-full border px-3 py-1 font-mono ${p.id === shown ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600'}`}>{p.payrollCode} · {PAYROLL_STATUS[p.status].label}</button>)}
        </div>
      )}

      {result && !active && canCreate && (
        <div className="card-panel mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-slate-700">{lastVoided ? `Payroll ${lastVoided.payrollCode} sudah di-void. Buat payroll pengganti untuk bulan ini.` : 'Belum ada payroll untuk bulan ini. Sistem mengisi semua karyawan aktif yang punya gaji pokok berlaku.'}</p>
          <button type="button" disabled={busy} onClick={() => create(lastVoided?.id)} className="btn btn-primary text-xs">{busy ? 'Membuat...' : lastVoided ? 'Buat Payroll Pengganti' : 'Buat Payroll Bulan Ini'}</button>
        </div>
      )}
      {shown ? <PayrollDetail key={shown} id={shown} onChanged={(text) => { setNotice({ tone: 'success', text }); reload(); }} /> : result && !canCreate && <p className="card-panel p-8 text-center text-sm text-slate-500">Belum ada payroll untuk bulan ini.</p>}

      <EmployeeSalaries onNotice={(text) => setNotice({ tone: 'success', text })} />
    </>
  );
}
