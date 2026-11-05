import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../admin/project/components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../../admin/project/components/ProjectUi.jsx';
import { formatCurrency, todayIso } from '../../admin/project/utils/projectFormat.js';
import { FilePicker, StageSelect } from '../components/FieldUi.jsx';
import { useActiveStages, useRecord } from '../hooks/useFieldData.js';
import { createExpenseReport, getCashRequest, listExpenseCategories } from '../services/fieldService.js';
import { stageLabel } from '../utils/fieldFormat.js';

const newRow = (patch = {}) => ({
  key: crypto.randomUUID(), categoryId: '', expenseDate: todayIso(), itemName: '', quantity: '1', unit: '', unitPrice: '', vendorName: '', fieldOperationalRequestItemId: null, ...patch,
});

/**
 * Laporan realisasi + nota. Dua bentuk: merujuk pengajuan yang sudah disetujui
 * (`requestId`), atau mendesak tanpa pengajuan dengan alasan wajib. Harga mengikuti nota.
 */
export default function ExpenseReportFormPage({ requestId, onCancel, onSaved }) {
  const { stages } = useActiveStages();
  const { data: categories, error: categoryError } = useRecord(listExpenseCategories, 'categories');
  const { data: request, error: requestError } = useRecord(() => (requestId ? getCashRequest(requestId) : Promise.resolve(null)), requestId || 'urgent');
  const [subProjectId, setSubProjectId] = useState('');
  const [reportDate, setReportDate] = useState(todayIso());
  const [urgentReason, setUrgentReason] = useState('');
  const [notes, setNotes] = useState('');
  const [editedRows, setRows] = useState(null);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (requestId && requestError) return <EmptyPanel icon="🔎" title="Pengajuan tidak ditemukan">{requestError}</EmptyPanel>;
  if (requestId && !request) return <LoadingPanel>Memuat pengajuan...</LoadingPanel>;
  if (request && request.status !== 'approved') {
    return <EmptyPanel icon="⏸️" title="Pengajuan belum disetujui" action={<button type="button" onClick={onCancel} className="btn btn-secondary text-xs">← Kembali</button>}>Realisasi hanya bisa dilaporkan untuk pengajuan yang sudah disetujui Finance.</EmptyPanel>;
  }

  // Isi awal dari baris pengajuan; harga dikosongkan supaya diketik dari nota.
  const rows = editedRows ?? (request
    ? request.items.map((item) => newRow({
      key: `item-${item.id}`, categoryId: String(item.categoryId), itemName: item.itemName, quantity: String(item.quantity), unit: item.unit, fieldOperationalRequestItemId: item.id,
    }))
    : [newRow({ key: 'first' })]);
  const setRow = (key, patch) => setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const total = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0), 0);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!request && !subProjectId) next.subProjectId = 'Pilih tahapan.';
    if (!request && !urgentReason.trim()) next.urgentReason = 'Laporan tanpa pengajuan wajib menyebut alasan mendesak.';
    if (!rows.length || rows.some((row) => !row.categoryId || !row.expenseDate || !row.itemName.trim() || !(Number(row.quantity) > 0) || !row.unit.trim() || row.unitPrice === '' || Number(row.unitPrice) < 0)) {
      next.items = 'Lengkapi kategori, tanggal, nama, jumlah, satuan, dan harga nota di setiap baris.';
    }
    if (files.length === 0) next.receipts = 'Lampirkan minimal satu nota.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await createExpenseReport({
        subProjectId: request ? request.subProjectId : Number(subProjectId),
        reportDate,
        notes: notes.trim(),
        ...(request ? { fieldOperationalRequestId: request.id } : { urgentReason: urgentReason.trim() }),
        items: rows.map((row) => ({
          categoryId: Number(row.categoryId),
          expenseDate: row.expenseDate,
          itemName: row.itemName.trim(),
          quantity: Number(row.quantity),
          unit: row.unit.trim(),
          unitPrice: Number(row.unitPrice),
          vendorName: row.vendorName.trim() || null,
          fieldOperationalRequestItemId: row.fieldOperationalRequestItemId,
        })),
      }, files));
    } catch (error) {
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={[{ label: 'Kas Lapangan', href: '#/lapangan/kas' }, { label: 'Laporan Realisasi', href: '#/lapangan/kas/laporan' }, { label: request ? request.requestCode : 'Mendesak' }]}
      icon="🧾"
      title={request ? `Lapor Realisasi ${request.requestCode}` : 'Laporan Mendesak'}
      subtitle={request ? `${stageLabel(request.subProject)} · perkiraan ${formatCurrency(request.requestedAmount)}` : 'Belanja yang harus terjadi tanpa pengajuan dana.'}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Kirim ke Finance"
      footerNote={`Total nota ${formatCurrency(total)}`}
      aside={(
        <InfoCard title="Aturan">
          <p>Harga mengikuti nota dan boleh melebihi perkiraan: Finance yang menilai.</p>
          <p>Nota wajib 1–10 berkas. Laporan langsung diperiksa Finance, tanpa tahap Admin.</p>
          <p>Koreksi: batalkan atau tunggu penolakan, lalu lapor ulang.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError || categoryError}</FormError>
      {!request && (
        <>
          <Field label="Tahapan" htmlFor="subProjectId" required error={errors.subProjectId}>
            <StageSelect stages={stages} value={subProjectId} onChange={setSubProjectId} />
          </Field>
          <Field label="Alasan Mendesak" htmlFor="urgentReason" required error={errors.urgentReason}>
            <input id="urgentReason" value={urgentReason} onChange={(event) => { setUrgentReason(event.target.value); setErrors((current) => ({ ...current, urgentReason: undefined })); }} maxLength={500} className="input-control text-sm" placeholder="Contoh: Pompa mati saat hujan, solar harus dibeli malam itu" />
          </Field>
        </>
      )}
      <Field label="Tanggal Laporan" htmlFor="reportDate" required>
        <input id="reportDate" type="date" max={todayIso()} value={reportDate} onChange={(event) => setReportDate(event.target.value)} className="input-control text-sm sm:max-w-xs" />
      </Field>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Rincian Belanja<span className="ml-0.5 text-red-500">*</span></p>
        {errors.items && <p className="mt-1 text-[11px] font-medium text-red-600">{errors.items}</p>}
        <div className="mt-2 space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-6">
              <select aria-label="Kategori" value={row.categoryId} onChange={(event) => setRow(row.key, { categoryId: event.target.value })} className="input-control h-9 text-xs sm:col-span-2">
                <option value="">- Kategori -</option>
                {(categories || []).map((category) => <option key={category.id} value={category.id}>{category.categoryName}</option>)}
              </select>
              <input aria-label="Nama belanja" value={row.itemName} onChange={(event) => setRow(row.key, { itemName: event.target.value })} maxLength={150} className="input-control h-9 text-xs sm:col-span-2" placeholder="Nama belanja" />
              <input aria-label="Tanggal belanja" type="date" max={todayIso()} value={row.expenseDate} onChange={(event) => setRow(row.key, { expenseDate: event.target.value })} className="input-control h-9 text-xs sm:col-span-2" />
              <input aria-label="Jumlah" type="number" min="0" step="any" value={row.quantity} onChange={(event) => setRow(row.key, { quantity: event.target.value })} className="input-control h-9 font-mono text-xs" />
              <input aria-label="Satuan" value={row.unit} onChange={(event) => setRow(row.key, { unit: event.target.value })} maxLength={30} className="input-control h-9 text-xs" placeholder="Satuan" />
              <input aria-label="Harga satuan nota" type="number" min="0" step="any" value={row.unitPrice} onChange={(event) => setRow(row.key, { unitPrice: event.target.value })} className="input-control h-9 font-mono text-xs sm:col-span-2" placeholder="Harga nota" />
              <input aria-label="Toko atau vendor" value={row.vendorName} onChange={(event) => setRow(row.key, { vendorName: event.target.value })} maxLength={150} className="input-control h-9 text-xs" placeholder="Vendor" />
              <button type="button" disabled={rows.length === 1} onClick={() => setRows(rows.filter((item) => item.key !== row.key))} className="text-xs font-semibold text-red-600 disabled:opacity-30">Hapus</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows([...rows, newRow()])} className="btn btn-secondary mt-2 text-xs">+ Tambah Baris</button>
      </div>
      <Field label="Catatan" htmlFor="notes">
        <input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className="input-control text-sm" placeholder="Opsional" />
      </Field>
      <Field label="Nota" htmlFor="receipts" required error={errors.receipts} hint="1–10 berkas: PDF, JPG, PNG, atau WebP, maksimal 10 MB per berkas.">
        <FilePicker id="receipts" files={files} onChange={setFiles} max={10} />
      </Field>
    </FormPage>
  );
}
