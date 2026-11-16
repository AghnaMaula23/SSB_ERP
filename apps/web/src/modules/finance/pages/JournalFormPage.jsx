import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../admin/project/components/FormPage.jsx';
import { MockBanner } from '../../admin/project/components/ProjectUi.jsx';
import { formatCurrency, todayIso } from '../../admin/project/utils/projectFormat.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { listAccounts, postJournal } from '../services/financeMockService.js';

const newLine = () => ({ key: crypto.randomUUID(), accountCode: '', debit: '', credit: '' });

/** Jurnal manual (penyesuaian, koreksi). Tersimpan hanya bila debit = kredit. */
export default function JournalFormPage({ onCancel, onSaved }) {
  const { data: accounts } = useRecord(listAccounts, 'accounts');
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState([newLine(), newLine()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setLine = (key, patch) => setLines((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const debit = lines.reduce((sum, row) => sum + (Number(row.debit) || 0), 0);
  const credit = lines.reduce((sum, row) => sum + (Number(row.credit) || 0), 0);

  const submit = async (event) => {
    event.preventDefault();
    if (!reference.trim()) { setError('Keterangan jurnal wajib diisi.'); return; }
    setBusy(true);
    setError('');
    try {
      const journal = await postJournal({ date, reference, lines });
      onSaved(`Jurnal ${journal.journalCode} tercatat (${formatCurrency(debit)}).`);
    } catch (saveError) {
      setError(saveError.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={[{ label: 'General Ledger', href: '#/finance/gl' }, { label: 'Jurnal Manual' }]}
      icon="📚"
      title="Jurnal Manual"
      subtitle="Untuk penyesuaian dan koreksi. Transaksi rutin tercatat otomatis dari modul sumbernya."
      busy={busy}
      onCancel={onCancel}
      onSubmit={submit}
      submitLabel="Simpan Jurnal"
      footerNote={`Debit ${formatCurrency(debit)} · Kredit ${formatCurrency(credit)} · ${debit === credit && debit > 0 ? 'seimbang' : `selisih ${formatCurrency(debit - credit)}`}`}
      aside={(
        <InfoCard title="Aturan jurnal">
          <p>Total debit harus sama dengan total kredit.</p>
          <p>Satu baris hanya diisi salah satu sisi. Akun nonaktif tidak bisa dipakai.</p>
          <p>Jurnal tidak diubah: koreksi dengan jurnal pembalik.</p>
        </InfoCard>
      )}
    >
      <MockBanner>Jurnal tersimpan di browser ini sampai modul Finance Accounting tersedia.</MockBanner>
      <FormError>{error}</FormError>
      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Field label="Tanggal" htmlFor="journal-date" required>
          <input id="journal-date" type="date" max={todayIso()} value={date} onChange={(event) => setDate(event.target.value)} className="input-control text-sm" />
        </Field>
        <Field label="Keterangan / Ref Jurnal" htmlFor="journal-ref" required>
          <input id="journal-ref" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} className="input-control text-sm" placeholder="Contoh: Koreksi pembebanan solar Oktober" />
        </Field>
      </div>
      <div className="space-y-2">
        {lines.map((row) => (
          <div key={row.key} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_2rem]">
            <select aria-label="Akun" value={row.accountCode} onChange={(event) => setLine(row.key, { accountCode: event.target.value })} className="input-control h-9 text-xs">
              <option value="">- Pilih akun -</option>
              {(accounts || []).filter((account) => account.isActive).map((account) => <option key={account.id} value={account.code}>{account.code} · {account.name}</option>)}
            </select>
            <input aria-label="Debit" type="number" min="0" step="any" value={row.debit} onChange={(event) => setLine(row.key, { debit: event.target.value, credit: event.target.value ? '' : row.credit })} className="input-control h-9 text-right font-mono text-xs" placeholder="Debit" />
            <input aria-label="Kredit" type="number" min="0" step="any" value={row.credit} onChange={(event) => setLine(row.key, { credit: event.target.value, debit: event.target.value ? '' : row.debit })} className="input-control h-9 text-right font-mono text-xs" placeholder="Kredit" />
            <button type="button" disabled={lines.length <= 2} onClick={() => setLines((current) => current.filter((item) => item.key !== row.key))} className="text-sm font-bold text-slate-400 hover:text-red-600 disabled:opacity-30" aria-label="Hapus baris">✕</button>
          </div>
        ))}
        <button type="button" onClick={() => setLines((current) => [...current, newLine()])} className="btn btn-secondary text-xs">+ Tambah Baris</button>
      </div>
    </FormPage>
  );
}
