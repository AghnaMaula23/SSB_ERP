import { useState } from 'react';
import { Breadcrumb, Notice, PageHeader, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { Field, FormError } from '../../admin/project/components/FormPage.jsx';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { hasPermission } from '../../../services/permissions.js';
import { createAccount, listAccounts, updateAccount } from '../services/financeService.js';
import { ACCOUNT_TYPES } from '../utils/financeFormat.js';

const ACTIVE = {
  true: { label: 'Aktif', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  false: { label: 'Nonaktif', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};
const emptyForm = { id: null, accountCode: '', accountName: '', accountType: 'expense', description: '', isActive: true };

/**
 * Daftar akun per golongan. Akun SISTEM (dipakai jurnal otomatis) terkunci; Finance
 * boleh menambah & mengubah akun lain. Kode/jenis terkunci begitu akun dipakai jurnal
 * (backend menolak 409). Tidak ada hapus — nonaktifkan.
 */
export default function ChartOfAccountsPage() {
  const { data: accounts, error: loadError, reload } = useRecord(() => listAccounts(), 'accounts');
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const canCreate = hasPermission('coa:create');
  const canUpdate = hasPermission('coa:update');
  const query = search.trim().toLowerCase();
  const visible = (accounts || []).filter((row) => !query || `${row.accountCode} ${row.accountName}`.toLowerCase().includes(query));
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.accountName.trim() || !form.accountCode.trim()) { setError('Kode dan nama akun wajib diisi.'); return; }
    setBusy(true);
    setError('');
    try {
      const payload = { accountCode: form.accountCode.trim(), accountName: form.accountName.trim(), accountType: form.accountType, description: form.description?.trim() || null };
      const saved = form.id ? await updateAccount(form.id, { ...payload, isActive: form.isActive }) : await createAccount(payload);
      setNotice(`Akun ${saved.accountCode} ${saved.accountName} ${form.id ? 'diperbarui' : 'ditambahkan'}.`);
      setForm(emptyForm);
      reload();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const showForm = form.id ? canUpdate : canCreate;

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Finance' }, { label: 'Chart of Accounts' }]} />
      <PageHeader title="Chart of Accounts" subtitle="Daftar akun buku besar per golongan. Kode berformat N-NNNN; digit pertama menunjukkan golongan. Akun bergembok dipakai jurnal otomatis dan tidak bisa diubah dari layar." />
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>
      {loadError && <Notice tone="error">{loadError}</Notice>}

      <div className={`grid gap-5 ${showForm ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}`}>
        <section className="card-panel overflow-hidden" aria-label="Daftar akun">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-control h-9 text-xs sm:w-72" placeholder="Cari kode atau nama akun..." aria-label="Cari akun" />
          </div>
          {!accounts && !loadError && <p className="px-4 py-10 text-center text-sm text-slate-500">Memuat akun...</p>}
          {Object.entries(ACCOUNT_TYPES).map(([type, meta]) => {
            const rows = visible.filter((row) => row.accountType === type);
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
                      <span className="w-16 font-mono text-xs font-bold text-slate-700">{row.accountCode}</span>
                      <span className={`min-w-0 flex-1 text-sm ${row.isActive ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                        {row.accountName}
                        {row.description && <span className="block text-[11px] text-slate-400">{row.description}</span>}
                      </span>
                      <StatusBadge status={String(row.isActive)} map={ACTIVE} />
                      {row.isSystem
                        ? <span className="w-16 text-right text-[11px] text-slate-400" title="Dipakai jurnal otomatis — ubah lewat kode program">🔒 sistem</span>
                        : canUpdate && <button type="button" onClick={() => { setForm({ ...row, description: row.description || '' }); setError(''); }} className="btn btn-ghost w-16 px-2 py-1 text-[11px]">✎ Ubah</button>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {accounts && !visible.length && <p className="px-4 py-10 text-center text-sm text-slate-500">Tidak ada akun yang cocok.</p>}
        </section>

        {showForm && (
          <form onSubmit={submit} noValidate className="card-panel h-fit space-y-4 p-4" aria-label="Form akun">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">{form.id ? `Ubah ${form.accountCode}` : 'Tambah Akun'}</p>
            <FormError>{error}</FormError>
            <Field label="Golongan" htmlFor="coa-type" required>
              <select id="coa-type" value={form.accountType} onChange={set('accountType')} className="input-control text-sm">
                {Object.entries(ACCOUNT_TYPES).map(([value, meta]) => <option key={value} value={value}>{meta.prefix} · {meta.label}</option>)}
              </select>
            </Field>
            <Field label="Kode" htmlFor="coa-code" required hint={`Contoh ${ACCOUNT_TYPES[form.accountType].prefix.split('/')[0]}-2200. Terkunci begitu dipakai jurnal.`}>
              <input id="coa-code" value={form.accountCode} onChange={set('accountCode')} maxLength={6} className="input-control font-mono text-sm" />
            </Field>
            <Field label="Nama Akun" htmlFor="coa-name" required>
              <input id="coa-name" value={form.accountName} onChange={set('accountName')} maxLength={150} className="input-control text-sm" />
            </Field>
            <Field label="Keterangan" htmlFor="coa-desc">
              <input id="coa-desc" value={form.description} onChange={set('description')} maxLength={2000} className="input-control text-sm" />
            </Field>
            {form.id && (
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="accent-brand-700" />
                Akun aktif
              </label>
            )}
            <p className="text-[11px] leading-relaxed text-slate-500">Akun baru belum dipakai jurnal otomatis mana pun — jurnal lahir dari modul sumbernya.</p>
            <div className="flex gap-2">
              {form.id && <button type="button" onClick={() => { setForm(emptyForm); setError(''); }} className="btn btn-secondary flex-1 text-xs">Batal</button>}
              <button type="submit" disabled={busy} className="btn btn-primary flex-1 text-xs">{busy ? 'Menyimpan...' : form.id ? 'Simpan' : 'Tambah Akun'}</button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
