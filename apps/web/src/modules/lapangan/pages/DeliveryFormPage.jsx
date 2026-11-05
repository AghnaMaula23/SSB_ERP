import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../admin/project/components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../../admin/project/components/ProjectUi.jsx';
import { fieldErrorsFrom, formatNumber, todayIso } from '../../admin/project/utils/projectFormat.js';
import { FilePicker } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { createDelivery, getMaterialRequest, listSuppliers } from '../services/fieldService.js';

/** Satu surat jalan = satu truk = satu material. Nomor surat jalan diketik dari dokumen fisiknya. */
export default function DeliveryFormPage({ requestId, onCancel, onSaved }) {
  const { data: request, error } = useRecord(() => getMaterialRequest(requestId), requestId);
  const { data: suppliers } = useRecord(listSuppliers, 'suppliers');
  const [form, setForm] = useState({
    materialRequestItemId: '', supplierId: '', deliveredQuantity: '', deliveryNoteNumber: '', deliveryNoteDate: todayIso(),
    vehicleNumber: '', vehicleType: '', driverName: '', driverPhone: '', originLocation: '', destinationLocation: '', notes: '',
  });
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (error) return <EmptyPanel icon="🔎" title="Request material tidak ditemukan">{error}</EmptyPanel>;
  if (!request) return <LoadingPanel>Memuat request...</LoadingPanel>;
  if (request.status !== 'approved') {
    return <EmptyPanel icon="⏸️" title="Request belum disetujui" action={<button type="button" onClick={onCancel} className="btn btn-secondary text-xs">← Kembali</button>}>Surat jalan hanya bisa dicatat untuk request yang sudah disetujui Finance.</EmptyPanel>;
  }

  const item = request.items.find((row) => String(row.id) === form.materialRequestItemId);
  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!form.materialRequestItemId) next.materialRequestItemId = 'Pilih material.';
    if (!form.supplierId) next.supplierId = 'Pilih supplier.';
    if (!(Number(form.deliveredQuantity) > 0)) next.deliveredQuantity = 'Jumlah harus lebih dari 0.';
    if (!form.deliveryNoteNumber.trim()) next.deliveryNoteNumber = 'Nomor surat jalan wajib diisi.';
    if (!form.deliveryNoteDate) next.deliveryNoteDate = 'Tanggal wajib diisi.';
    if (!form.vehicleNumber.trim()) next.vehicleNumber = 'Nomor kendaraan wajib diisi.';
    if (!form.driverName.trim()) next.driverName = 'Nama sopir wajib diisi.';
    if (files.length !== 1) next.deliveryNote = 'Lampirkan file surat jalan.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await createDelivery(form, files[0]));
    } catch (requestError) {
      setErrors(fieldErrorsFrom(requestError));
      setFormError(requestError.message);
      setBusy(false);
    }
  };

  const text = (name, label, { required = false, placeholder, type = 'text', max } = {}) => (
    <Field label={label} htmlFor={name} required={required} error={errors[name]}>
      <input id={name} name={name} type={type} max={max} value={form[name]} onChange={update} placeholder={placeholder} className="input-control text-sm" />
    </Field>
  );

  return (
    <FormPage
      breadcrumb={[{ label: 'Request Material', href: '#/lapangan/material' }, { label: request.requestCode, href: `#/lapangan/material/${request.id}` }, { label: 'Catat Surat Jalan' }]}
      icon="🧾"
      title="Catat Surat Jalan"
      subtitle={request.requestCode}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Simpan Surat Jalan"
      aside={(
        <InfoCard title="Aturan">
          <p>Jumlah kiriman boleh melebihi kuantitas request: truk yang datang tetap dicatat.</p>
          <p>Nomor surat jalan unik per supplier.</p>
          <p>Tidak ada ubah: salah input dibatalkan dengan alasan, lalu dicatat ulang. Setelah diterima, surat jalan terkunci.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>
      <Field label="Material" htmlFor="materialRequestItemId" required error={errors.materialRequestItemId}>
        <select id="materialRequestItemId" name="materialRequestItemId" value={form.materialRequestItemId} onChange={update} className="input-control text-sm">
          <option value="">- Pilih material -</option>
          {request.items.map((row) => <option key={row.id} value={row.id}>{row.materialType?.materialName} — terkirim {formatNumber(row.deliveredQuantity)} dari {formatNumber(row.effectiveQuantity)} {row.unit}</option>)}
        </select>
      </Field>
      <Field label="Supplier" htmlFor="supplierId" required error={errors.supplierId}>
        <select id="supplierId" name="supplierId" value={form.supplierId} onChange={update} className="input-control text-sm">
          <option value="">- Pilih supplier -</option>
          {(suppliers?.data || []).map((row) => <option key={row.id} value={row.id}>{row.supplierName}</option>)}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        {text('deliveredQuantity', `Jumlah${item?.unit ? ` (${item.unit})` : ''}`, { required: true, type: 'number', placeholder: '0' })}
        {text('deliveryNoteNumber', 'Nomor Surat Jalan', { required: true, placeholder: 'SJ-0123' })}
        {text('deliveryNoteDate', 'Tanggal', { required: true, type: 'date', max: todayIso() })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('vehicleNumber', 'Nomor Kendaraan', { required: true, placeholder: 'A 1234 BC' })}
        {text('vehicleType', 'Jenis Kendaraan', { placeholder: 'Dump truck' })}
        {text('driverName', 'Nama Sopir', { required: true })}
        {text('driverPhone', 'Telepon Sopir')}
        {text('originLocation', 'Asal')}
        {text('destinationLocation', 'Tujuan')}
      </div>
      {text('notes', 'Catatan')}
      <Field label="File Surat Jalan" htmlFor="deliveryNote" required error={errors.deliveryNote} hint="PDF, JPG, PNG, atau WebP, maksimal 10 MB.">
        <FilePicker id="deliveryNote" files={files} onChange={setFiles} />
      </Field>
    </FormPage>
  );
}
