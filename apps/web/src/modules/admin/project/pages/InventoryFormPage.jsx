import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../components/FormPage.jsx';
import { MockBanner } from '../components/ProjectUi.jsx';
import { INVENTORY_CATEGORIES, INVENTORY_UNITS, createInventoryItem } from '../services/fieldMockService.js';
import { fieldErrorsFrom, stageCrumbs } from '../utils/projectFormat.js';

/** Tambah barang ke inventory tahapan — DATA CONTOH. */
export default function InventoryFormPage({ project, stage, onCancel, onSaved }) {
  const [form, setForm] = useState({ itemName: '', category: INVENTORY_CATEGORIES[0], unit: INVENTORY_UNITS[0], initialStock: '', minStock: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.itemName.trim()) nextErrors.itemName = 'Nama barang wajib diisi.';
    if (form.initialStock !== '' && Number(form.initialStock) < 0) nextErrors.initialStock = 'Stok awal tidak boleh negatif.';
    if (form.minStock !== '' && Number(form.minStock) < 0) nextErrors.minStock = 'Stok minimum tidak boleh negatif.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await createInventoryItem(stage.id, form));
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={stageCrumbs(project, stage, { label: 'Inventory', href: `#/admin/projects/${project.id}/sub/${stage.id}/inventory` }, { label: 'Tambah Barang' })}
      icon="📦"
      title="Tambah Barang"
      subtitle="Daftarkan material atau bahan habis pakai di lokasi tahapan"
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Simpan Barang"
      footerNote="Stok awal tercatat sebagai mutasi masuk."
      aside={<InfoCard title="Stok minimum"><p>Barang dengan stok di bawah angka minimum ditandai <b className="text-red-600">LOW</b> di daftar inventory.</p></InfoCard>}
    >
      <MockBanner>Belum tersambung API.</MockBanner>
      <FormError>{formError}</FormError>
      <Field label="Nama Barang" htmlFor="itemName" required error={errors.itemName}>
        <input id="itemName" name="itemName" value={form.itemName} onChange={update} maxLength={150} className="input-control text-sm" placeholder="Contoh: Solar B30 - High Speed Diesel" autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kategori" htmlFor="category" required>
          <select id="category" name="category" value={form.category} onChange={update} className="input-control text-sm">
            {INVENTORY_CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Satuan" htmlFor="unit" required>
          <select id="unit" name="unit" value={form.unit} onChange={update} className="input-control text-sm">
            {INVENTORY_UNITS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Stok Awal" htmlFor="initialStock" error={errors.initialStock}>
          <input id="initialStock" name="initialStock" type="number" min="0" step="any" value={form.initialStock} onChange={update} className="input-control font-mono text-sm" placeholder="0" />
        </Field>
        <Field label="Stok Minimum" htmlFor="minStock" error={errors.minStock}>
          <input id="minStock" name="minStock" type="number" min="0" step="any" value={form.minStock} onChange={update} className="input-control font-mono text-sm" placeholder="0" />
        </Field>
      </div>
    </FormPage>
  );
}
