import { useEffect, useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../components/ProjectUi.jsx';
import { createStockMovement, getStageStock, listActiveMaterialTypes } from '../services/materialStockService.js';
import { fieldErrorsFrom, formatNumber, stageCrumbs, todayIso } from '../utils/projectFormat.js';
import { MOVEMENT_TYPES } from '../utils/stockFormat.js';

/**
 * Catat pemakaian / koreksi stok satu tahapan (material-stock:create — Divisi
 * Lapangan). `materialTypeId` diisi bila dibuka dari baris saldo tertentu.
 * Satuan tidak bisa dipilih: mengikuti jenis material.
 */
export default function InventoryMovementPage({ project, stage, materialTypeId, onCancel, onSaved }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ materialTypeId: materialTypeId ? String(materialTypeId) : '', movementType: 'used', quantity: '', movementDate: todayIso(), notes: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listActiveMaterialTypes(), getStageStock(stage.id)])
      .then(([types, stock]) => { if (!cancelled) setData({ types, stock: stock || [] }); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [stage.id]);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  if (loadError) return <EmptyPanel icon="⚠️" title="Data stok tidak bisa dimuat">{loadError}</EmptyPanel>;
  if (!data) return <LoadingPanel>Memuat jenis material...</LoadingPanel>;

  const type = MOVEMENT_TYPES[form.movementType];
  const material = data.types.find((row) => String(row.id) === form.materialTypeId);
  const balanceRow = data.stock.find((row) => String(row.materialType.id) === form.materialTypeId);
  const balance = balanceRow?.balance || 0;
  const unit = material?.unit || balanceRow?.unit || '';
  const after = form.quantity && material ? balance + type.sign * Number(form.quantity) : null;
  // Material yang sudah punya saldo didahulukan di daftar pilihan.
  const inStock = new Set(data.stock.map((row) => row.materialType.id));
  const options = [...data.types].sort((a, b) => Number(inStock.has(b.id)) - Number(inStock.has(a.id)) || a.materialName.localeCompare(b.materialName));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.materialTypeId) nextErrors.materialTypeId = 'Pilih jenis material.';
    if (!(Number(form.quantity) > 0)) nextErrors.quantity = 'Jumlah harus lebih dari 0.';
    if (!form.movementDate) nextErrors.movementDate = 'Tanggal wajib diisi.';
    if (type.needsNotes && !form.notes.trim()) nextErrors.notes = 'Koreksi stok wajib disertai alasan.';
    if (type.sign < 0 && after !== null && after < 0) nextErrors.quantity = `Melebihi saldo (${formatNumber(balance)} ${unit}). Stok tidak boleh minus.`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await createStockMovement(stage.id, form));
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={stageCrumbs(project, stage, { label: 'Inventory', href: `#/admin/projects/${project.id}/sub/${stage.id}/inventory` }, { label: 'Catat Mutasi' })}
      icon="🔁"
      title="Catat Mutasi Stok"
      subtitle={material ? `${material.materialName} · saldo ${formatNumber(balance)} ${unit}` : 'Pemakaian atau koreksi stok material tahapan'}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Simpan Mutasi"
      footerNote={after !== null ? `Saldo setelah mutasi: ${formatNumber(after)} ${unit}` : ''}
      aside={(
        <InfoCard title="Aturan stok">
          <p>Stok masuk dari pengiriman tercatat otomatis lewat <b>penerimaan material</b> — tidak diinput di sini.</p>
          <p>Koreksi (opname) wajib disertai alasan. Stok tidak boleh minus.</p>
          <p>Salah input? Batalkan barisnya dari riwayat stok, lalu catat ulang.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>
      <fieldset>
        <legend className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Jenis Mutasi</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {Object.entries(MOVEMENT_TYPES).map(([value, option]) => (
            <label key={value} className={`cursor-pointer rounded-lg border p-3 transition ${form.movementType === value ? 'border-brand-600 bg-brand-50/60 ring-2 ring-brand-600/15' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="movementType" value={value} checked={form.movementType === value} onChange={update} className="sr-only" />
              <span className="block text-sm font-semibold text-slate-900">{option.icon} {option.label}</span>
              <span className="block text-[11px] text-slate-500">{option.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Jenis Material" htmlFor="materialTypeId" required error={errors.materialTypeId}>
        <select id="materialTypeId" name="materialTypeId" value={form.materialTypeId} onChange={update} className="input-control text-sm">
          <option value="">- Pilih material -</option>
          {options.map((row) => {
            const stockRow = data.stock.find((item) => item.materialType.id === row.id);
            return <option key={row.id} value={row.id}>{row.materialName} ({row.unit}){stockRow ? ` — saldo ${formatNumber(stockRow.balance)}` : ''}</option>;
          })}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Jumlah${unit ? ` (${unit})` : ''}`} htmlFor="quantity" required error={errors.quantity}>
          <input id="quantity" name="quantity" type="number" min="0" step="any" value={form.quantity} onChange={update} className="input-control font-mono text-sm" placeholder="0" />
        </Field>
        <Field label="Tanggal" htmlFor="movementDate" required error={errors.movementDate}>
          <input id="movementDate" name="movementDate" type="date" max={todayIso()} value={form.movementDate} onChange={update} className="input-control text-sm" />
        </Field>
      </div>
      <Field label={type.needsNotes ? 'Alasan Koreksi' : 'Keterangan'} htmlFor="notes" required={type.needsNotes} error={errors.notes}>
        <input id="notes" name="notes" value={form.notes} onChange={update} maxLength={500} className="input-control text-sm" placeholder={type.needsNotes ? 'Contoh: Hasil opname 18 Okt, selisih tercecer' : 'Contoh: Pengecoran pile cap P3'} />
      </Field>
    </FormPage>
  );
}
