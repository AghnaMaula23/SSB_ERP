import { useEffect, useState } from 'react';
import FormPage, { Field, FormError } from '../components/FormPage.jsx';
import { EmptyPanel, LoadingPanel, MockBanner } from '../components/ProjectUi.jsx';
import { getInventoryItem, recordInventoryMovement } from '../services/fieldMockService.js';
import { fieldErrorsFrom, formatDate, formatNumber, stageCrumbs, todayIso } from '../utils/projectFormat.js';

/** Catat barang masuk/keluar dan lihat riwayat mutasinya — DATA CONTOH. */
export default function InventoryMovementPage({ project, stage, itemId, onCancel, onSaved }) {
  const [item, setItem] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ type: 'out', quantity: '', date: todayIso(), note: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInventoryItem(stage.id, itemId)
      .then((row) => { if (!cancelled) setItem(row); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [itemId, stage.id]);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!(Number(form.quantity) > 0)) nextErrors.quantity = 'Jumlah harus lebih dari 0.';
    if (!form.date) nextErrors.date = 'Tanggal wajib diisi.';
    if (!form.note.trim()) nextErrors.note = 'Keterangan wajib diisi (mis. dipakai untuk apa / dari mana).';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await recordInventoryMovement(stage.id, itemId, form));
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  if (loadError) return <EmptyPanel icon="🔎" title="Barang tidak ditemukan">{loadError}</EmptyPanel>;
  if (!item) return <LoadingPanel>Memuat barang...</LoadingPanel>;

  const after = form.quantity ? item.stock + (form.type === 'out' ? -1 : 1) * Number(form.quantity) : null;

  return (
    <FormPage
      breadcrumb={stageCrumbs(project, stage, { label: 'Inventory', href: `#/admin/projects/${project.id}/sub/${stage.id}/inventory` }, { label: item.itemName })}
      icon="🔁"
      title="Catat Mutasi Stok"
      subtitle={`${item.itemName} · stok saat ini ${formatNumber(item.stock)} ${item.unit}`}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Simpan Mutasi"
      footerNote={after !== null ? `Stok setelah mutasi: ${formatNumber(after)} ${item.unit}` : ''}
      aside={(
        <div className="card-panel overflow-hidden">
          <p className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-teal-700">Riwayat Mutasi</p>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {item.movements.length === 0 && <li className="px-4 py-6 text-center text-xs text-slate-500">Belum ada mutasi.</li>}
            {item.movements.map((move) => (
              <li key={move.id} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`font-mono text-sm font-bold ${move.type === 'in' ? 'text-emerald-700' : 'text-red-600'}`}>{move.type === 'in' ? '+' : '−'}{formatNumber(move.quantity)}</span>
                  <span className="text-[11px] text-slate-400">{formatDate(move.date)}</span>
                </div>
                <p className="truncate text-[11px] text-slate-600" title={move.note}>{move.note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    >
      <MockBanner>Belum tersambung API.</MockBanner>
      <FormError>{formError}</FormError>
      <fieldset>
        <legend className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Jenis Mutasi</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[['in', 'Barang Masuk', 'Pengiriman / penerimaan'], ['out', 'Barang Keluar', 'Pemakaian di lapangan']].map(([value, label, hint]) => (
            <label key={value} className={`cursor-pointer rounded-lg border p-3 transition ${form.type === value ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-600/15' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="type" value={value} checked={form.type === value} onChange={update} className="sr-only" />
              <span className="block text-sm font-semibold text-slate-900">{value === 'in' ? '⬇' : '⬆'} {label}</span>
              <span className="block text-[11px] text-slate-500">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Jumlah (${item.unit})`} htmlFor="quantity" required error={errors.quantity}>
          <input id="quantity" name="quantity" type="number" min="0" step="any" value={form.quantity} onChange={update} className="input-control font-mono text-sm" placeholder="0" autoFocus />
        </Field>
        <Field label="Tanggal" htmlFor="date" required error={errors.date}>
          <input id="date" name="date" type="date" max={todayIso()} value={form.date} onChange={update} className="input-control text-sm" />
        </Field>
      </div>
      <Field label="Keterangan" htmlFor="note" required error={errors.note}>
        <input id="note" name="note" value={form.note} onChange={update} maxLength={200} className="input-control text-sm" placeholder="Contoh: Pengisian solar EXC-003" />
      </Field>
    </FormPage>
  );
}
