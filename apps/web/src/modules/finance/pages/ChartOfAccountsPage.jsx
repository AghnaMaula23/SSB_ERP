import { useState } from 'react';
import { Breadcrumb, MockBanner, Notice, PageHeader, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { Field, FormError } from '../../admin/project/components/FormPage.jsx';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { ACCOUNT_TYPES, listAccounts, saveAccount } from '../services/financeMockService.js';

const ACTIVE = {
  true: { label: 'Aktif', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  false: { label: 'Nonaktif', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};
const emptyForm = { id: null, code: '', name: '', type: 'expense', description: '', isActive: true };

/** Daftar akun per golongan + form tambah/ubah di samping. Akun tidak dihapus: nonaktifkan. */
export default function ChartOfAccountsPage() {
  const { data: accounts, reload } = useRecord(listAccounts, 'accounts');
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const query = search.trim().toLowerCase();
  const visible = (accounts || []).filter((row) => !query || `${row.code} ${row.name}`.toLowerCase().includes(query));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Nama akun wajib diisi.'); return; }
    try {
      const saved = await saveAccount(form);
      setNotice(`Akun ${saved.code} ${saved.name} ${form.id ? 'diperbarui' : 'ditambahkan'}.`);
      setForm(emptyForm);
      reload();
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Finance' }, { label: 'Chart of Accounts' }]} />
      <PageHeader title="Chart of Accounts" subtitle="Daftar akun buku besar per golongan. Kode berformat N-NNNN; digit pertama menunjukkan golongan." />
      <MockBanner>Modul Finance Accounting belum ada di backend — akun ini tersimpan di browser ini dan hilang saat sign out.</MockBanner>
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card-panel overflow-hidden" aria-label="Daftar akun">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-control h-9 text-xs sm:w-72" placeholder="Cari kode atau nama akun..." aria-label="Cari akun" />
          </div>
          {Object.entries(ACCOUNT_TYPES).map(([type, meta]) => {
            const rows = visible.filter((row) => row.type === type);
            if (!rows.length) return null;
            return (
              <div key={type} className="border-b border-slate-200 last:border-b-0">
                <p className="flex items-center justify-between bg-slate-50/60 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-brand-700">
                  <span>{meta.prefix} · {meta.label}</span>
                  <span className="font-semibold normal-case tracking-normal text-slate-500">saldo normal {meta.normal}</span>
                </p>
                <ul>
                  {rows.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-2.5">
                      <span className="w-16 font-mono text-xs font-bold text-slate-700">{row.code}</span>
                      <span className={`min-w-0 flex-1 text-sm ${row.isActive ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{row.name}</span>
                      <StatusBadge status={String(row.isActive)} map={ACTIVE} />
                      <button type="button" onClick={() => { setForm(row); setError(''); }} className="btn btn-ghost px-2 py-1 text-[11px]">✎ Ubah</button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {accounts && !visible.length && <p className="px-4 py-10 text-center text-sm text-slate-500">Tidak ada akun yang cocok.</p>}
        </section>

        <form onSubmit={submit} noValidate className="card-panel h-fit space-y-4 p-4" aria-label="Form akun">
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">{form.id ? `Ubah ${form.code}` : 'Tambah Akun'}</p>
          <FormError>{error}</FormError>
          <Field label="Golongan" htmlFor="coa-type" required>
            <select id="coa-type" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} className="input-control text-sm">
              {Object.entries(ACCOUNT_TYPES).map(([value, meta]) => <option key={value} value={value}>{meta.prefix} · {meta.label}</option>)}
            </select>
          </Field>
          <Field label="Kode" htmlFor="coa-code" required hint={`Contoh ${ACCOUNT_TYPES[form.type].prefix}-1005`}>
            <input id="coa-code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} maxLength={6} className="input-control font-mono text-sm" />
          </Field>
          <Field label="Nama Akun" htmlFor="coa-name" required>
            <input id="coa-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={100} className="input-control text-sm" />
          </Field>
          {form.id && (
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="accent-brand-700" />
              Akun aktif (akun nonaktif tidak bisa dipakai jurnal baru)
            </label>
          )}
          <div className="flex gap-2">
            {form.id && <button type="button" onClick={() => setForm(emptyForm)} className="btn btn-secondary flex-1 text-xs">Batal</button>}
            <button type="submit" className="btn btn-primary flex-1 text-xs">{form.id ? 'Simpan' : 'Tambah Akun'}</button>
          </div>
        </form>
      </div>
    </>
  );
}
