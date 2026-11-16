import { useMemo, useState } from 'react';
import { MetricCard, MockBanner, Notice, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { Pager } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatCurrency } from '../../admin/project/utils/projectFormat.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { getPayrollPeriod, netSalary, payPayroll, saveEmployee } from '../services/financeMockService.js';

const PAGE_SIZE = 10;
const PAY_STATUS = {
  pending: { label: 'Pending', className: 'bg-red-50 text-red-700 border-red-200' },
  paid: { label: 'Paid', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
};
const emptyEmployee = { id: null, fullName: '', division: '', baseSalary: '', allowance: '', deduction: '' };

/** Gaji bulanan staf per periode — data contoh sampai backend Payroll Karyawan ada. */
export default function StaffPayrollTab({ month }) {
  const { data: rows, reload } = useRecord(() => getPayrollPeriod(month), month);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState({ tone: 'success', text: '' });

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => (rows || []).filter((row) => !query || `${row.employeeCode} ${row.fullName} ${row.division}`.toLowerCase().includes(query)), [rows, query]);
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pending = (rows || []).filter((row) => !row.paidAt);
  const total = (rows || []).reduce((sum, row) => sum + row.net, 0);
  const pendingTotal = pending.reduce((sum, row) => sum + row.net, 0);

  const pay = async (ids) => {
    if (!window.confirm(`Proses pembayaran ${ids.length} karyawan untuk ${month}?`)) return;
    try {
      const count = await payPayroll(month, ids);
      setNotice({ tone: 'success', text: `${count} gaji ditandai dibayar dan jurnalnya tercatat di General Ledger.` });
      setSelected([]);
      reload();
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    }
  };

  const saveEditing = async (event) => {
    event.preventDefault();
    try {
      await saveEmployee({ ...editing, baseSalary: Number(editing.baseSalary), allowance: Number(editing.allowance || 0), deduction: Number(editing.deduction || 0) });
      setNotice({ tone: 'success', text: `Data ${editing.fullName} tersimpan.` });
      setEditing(null);
      reload();
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    }
  };

  const numberField = (name, label) => (
    <label className="text-[11px] font-semibold text-slate-600">{label}
      <input type="number" min="0" value={editing[name]} onChange={(event) => setEditing((current) => ({ ...current, [name]: event.target.value }))} className="input-control mt-1 h-9 font-mono text-xs" />
    </label>
  );

  return (
    <>
      <MockBanner>Modul Payroll Karyawan belum ada di backend — daftar staf dan status bayar ini data contoh di browser ini.</MockBanner>
      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total Payroll Staf" value={formatCurrency(total)} accent loading={!rows} hint={`${(rows || []).length} karyawan`} />
        <MetricCard label="Belum Dibayar" value={formatCurrency(pendingTotal)} tone={pending.length ? 'red' : 'slate'} loading={!rows} hint={`${pending.length} karyawan`} />
        <MetricCard label="Siklus Pembayaran" value="Tanggal 25" loading={!rows} hint="Gaji bulanan staf" />
      </div>

      {editing && (
        <form onSubmit={saveEditing} className="card-panel mb-4 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6" aria-label="Form karyawan">
          <label className="text-[11px] font-semibold text-slate-600 sm:col-span-2">Nama
            <input value={editing.fullName} onChange={(event) => setEditing((current) => ({ ...current, fullName: event.target.value }))} className="input-control mt-1 h-9 text-xs" />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">Divisi
            <input value={editing.division} onChange={(event) => setEditing((current) => ({ ...current, division: event.target.value }))} className="input-control mt-1 h-9 text-xs" />
          </label>
          {numberField('baseSalary', 'Gaji pokok')}
          {numberField('allowance', 'Tunjangan')}
          {numberField('deduction', 'Potongan/BPJS')}
          <div className="flex gap-2 sm:col-span-3 lg:col-span-6 lg:justify-end">
            <button type="button" onClick={() => setEditing(null)} className="btn btn-secondary text-xs">Batal</button>
            <button type="submit" className="btn btn-primary text-xs">Simpan · bersih {formatCurrency(netSalary({ baseSalary: Number(editing.baseSalary) || 0, allowance: Number(editing.allowance) || 0, deduction: Number(editing.deduction) || 0 }))}</button>
          </div>
        </form>
      )}

      <section className="card-panel overflow-hidden" aria-label="Daftar payroll staf">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Daftar Payroll Staf</h2>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{(rows || []).length} Karyawan</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="input-control h-9 text-xs sm:w-56" placeholder="Cari ID atau nama..." aria-label="Cari karyawan" />
            <button type="button" onClick={() => setEditing(emptyEmployee)} className="btn btn-secondary text-xs">+ Karyawan</button>
            <button type="button" disabled={!pending.length} onClick={() => pay(selected.length ? selected : pending.map((row) => row.id))} className="btn btn-primary text-xs">{selected.length ? `Bayar ${selected.length} Terpilih` : 'Bayar Semua Pending'}</button>
          </div>
        </div>
        <div className="table-scroll-mobile overflow-x-auto">
          <table className="table-modern">
            <thead><tr><th className="w-10" /><th>ID Karyawan</th><th>Nama</th><th>Divisi</th><th className="text-right">Gaji Pokok</th><th className="text-right">Tunjangan</th><th className="text-right">Potongan/BPJS</th><th className="text-right">Total Bersih</th><th className="text-center">Status</th><th /></tr></thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className={row.paidAt ? 'text-slate-500' : ''}>
                  <td><input type="checkbox" aria-label={`Pilih ${row.fullName}`} disabled={Boolean(row.paidAt)} checked={selected.includes(row.id)} onChange={(event) => setSelected((current) => (event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))} className="accent-brand-700" /></td>
                  <td className="font-mono text-xs">{row.employeeCode}</td>
                  <td className="text-sm font-semibold">{row.fullName}</td>
                  <td className="text-xs">{row.division}</td>
                  <td className="text-right font-mono text-xs">{formatCurrency(row.baseSalary)}</td>
                  <td className="text-right font-mono text-xs">{formatCurrency(row.allowance)}</td>
                  <td className="text-right font-mono text-xs text-red-600">({formatCurrency(row.deduction)})</td>
                  <td className="text-right font-mono text-xs font-bold">{formatCurrency(row.net)}</td>
                  <td className="text-center"><StatusBadge status={row.paidAt ? 'paid' : 'pending'} map={PAY_STATUS} /></td>
                  <td className="text-right"><button type="button" onClick={() => setEditing({ ...row })} className="btn btn-ghost px-2 py-1 text-[11px]">✎</button></td>
                </tr>
              ))}
              {rows && !shown.length && <tr><td colSpan={10} className="py-10 text-center text-sm text-slate-500">Tidak ada karyawan yang cocok.</td></tr>}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && <Pager page={page} totalPages={Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))} total={filtered.length} shown={shown.length} onChange={setPage} label="entri" />}
      </section>
    </>
  );
}
