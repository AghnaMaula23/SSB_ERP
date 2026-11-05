import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../admin/project/components/FormPage.jsx';
import { formatCurrency, todayIso } from '../../admin/project/utils/projectFormat.js';
import { StageSelect } from '../components/FieldUi.jsx';
import { useActiveStages, useRecord } from '../hooks/useFieldData.js';
import { createCashRequest, listExpenseCategories } from '../services/fieldService.js';

const newRow = () => ({ key: crypto.randomUUID(), categoryId: '', itemName: '', quantity: '1', unit: '', estimatedUnitPrice: '' });

export default function CashRequestFormPage({ onCancel, onSaved }) {
  const { stages, error: stageError } = useActiveStages();
  const { data: categories, error: categoryError } = useRecord(listExpenseCategories, 'categories');
  const [subProjectId, setSubProjectId] = useState('');
  const [requestDate, setRequestDate] = useState(todayIso());
  const [neededDate, setNeededDate] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState([newRow()]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const setRow = (key, patch) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const total = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.estimatedUnitPrice) || 0), 0);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!subProjectId) next.subProjectId = 'Pilih tahapan.';
    if (rows.some((row) => !row.categoryId || !row.itemName.trim() || !(Number(row.quantity) > 0) || !row.unit.trim() || row.estimatedUnitPrice === '' || Number(row.estimatedUnitPrice) < 0)) {
      next.items = 'Lengkapi kategori, nama, jumlah, satuan, dan harga di setiap baris.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await createCashRequest({
        subProjectId: Number(subProjectId),
        requestDate,
        ...(neededDate && { neededDate }),
        ...(notes.trim() && { notes: notes.trim() }),
        items: rows.map((row) => ({
          categoryId: Number(row.categoryId),
          itemName: row.itemName.trim(),
          quantity: Number(row.quantity),
          unit: row.unit.trim(),
          estimatedUnitPrice: Number(row.estimatedUnitPrice),
        })),
      }));
    } catch (error) {
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={[{ label: 'Kas Lapangan', href: '#/lapangan/kas' }, { label: 'Ajukan Dana' }]}
      icon="💵"
      title="Ajukan Dana Operasional"
      subtitle="Nominal adalah perkiraan. Admin memeriksa, lalu Finance memutuskan."
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Kirim ke Admin"
      footerNote={`Total perkiraan ${formatCurrency(total)}`}
      aside={(
        <InfoCard title="Aturan">
          <p>Disetujui berarti izin belanja, bukan pencairan otomatis: pencairan terjadi di luar sistem.</p>
          <p>Pengeluaran resmi dihitung dari laporan realisasi yang divalidasi Finance.</p>
          <p>Ditolak bersifat final. Untuk revisi, buat pengajuan baru.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError || stageError || categoryError}</FormError>
      <Field label="Tahapan" htmlFor="subProjectId" required error={errors.subProjectId}>
        <StageSelect stages={stages} value={subProjectId} onChange={setSubProjectId} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal Pengajuan" htmlFor="requestDate" required>
          <input id="requestDate" type="date" max={todayIso()} value={requestDate} onChange={(event) => setRequestDate(event.target.value)} className="input-control text-sm" />
        </Field>
        <Field label="Dibutuhkan Tanggal" htmlFor="neededDate">
          <input id="neededDate" type="date" min={requestDate} value={neededDate} onChange={(event) => setNeededDate(event.target.value)} className="input-control text-sm" />
        </Field>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Rincian Biaya<span className="ml-0.5 text-red-500">*</span></p>
        {errors.items && <p className="mt-1 text-[11px] font-medium text-red-600">{errors.items}</p>}
        <div className="mt-2 space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[9rem_minmax(0,1fr)_5rem_5.5rem_8rem_2rem]">
              <select aria-label="Kategori" value={row.categoryId} onChange={(event) => setRow(row.key, { categoryId: event.target.value })} className="input-control h-9 text-xs">
                <option value="">- Kategori -</option>
                {(categories || []).map((category) => <option key={category.id} value={category.id}>{category.categoryName}</option>)}
              </select>
              <input aria-label="Nama biaya" value={row.itemName} onChange={(event) => setRow(row.key, { itemName: event.target.value })} maxLength={150} className="input-control h-9 text-xs" placeholder="Contoh: Solar genset" />
              <input aria-label="Jumlah" type="number" min="0" step="any" value={row.quantity} onChange={(event) => setRow(row.key, { quantity: event.target.value })} className="input-control h-9 font-mono text-xs" />
              <input aria-label="Satuan" value={row.unit} onChange={(event) => setRow(row.key, { unit: event.target.value })} maxLength={30} className="input-control h-9 text-xs" placeholder="liter" />
              <input aria-label="Perkiraan harga satuan" type="number" min="0" step="any" value={row.estimatedUnitPrice} onChange={(event) => setRow(row.key, { estimatedUnitPrice: event.target.value })} className="input-control h-9 font-mono text-xs" placeholder="Harga" />
              <button type="button" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} className="text-sm font-bold text-slate-400 hover:text-red-600 disabled:opacity-30" aria-label="Hapus baris">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows((current) => [...current, newRow()])} className="btn btn-secondary mt-2 text-xs">+ Tambah Baris</button>
      </div>
      <Field label="Catatan" htmlFor="notes">
        <input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className="input-control text-sm" placeholder="Opsional" />
      </Field>
    </FormPage>
  );
}
