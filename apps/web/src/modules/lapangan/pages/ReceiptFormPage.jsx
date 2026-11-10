import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../admin/project/components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../../admin/project/components/ProjectUi.jsx';
import { fieldErrorsFrom, formatNumber } from '../../admin/project/utils/projectFormat.js';
import { FilePicker } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { createReceipt, getDelivery } from '../services/fieldService.js';

const nowLocal = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/**
 * Penerimaan satu surat jalan. Konstruksi: penerimanya akun Lapangan yang mencatat.
 * Supply: nama penerima di klien wajib. Sah begitu dicatat bersama buktinya.
 */
export default function ReceiptFormPage({ deliveryId, onCancel, onSaved }) {
  const { data: delivery, error } = useRecord(() => getDelivery(deliveryId), deliveryId);
  const [form, setForm] = useState({ receivedAt: nowLocal(), receivedQuantity: '', acceptedQuantity: '', externalReceiverName: '', externalReceiverPhone: '', notes: '' });
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (error) return <EmptyPanel icon="🔎" title="Surat jalan tidak ditemukan">{error}</EmptyPanel>;
  if (!delivery) return <LoadingPanel>Memuat surat jalan...</LoadingPanel>;
  if (delivery.receipt || delivery.isCancelled) {
    return <EmptyPanel icon="🔒" title="Tidak bisa dicatat" action={<button type="button" onClick={onCancel} className="btn btn-secondary text-xs">← Kembali</button>}>{delivery.isCancelled ? 'Surat jalan ini sudah dibatalkan.' : `Surat jalan ini sudah diterima (${delivery.receipt.receiptCode}).`}</EmptyPanel>;
  }

  const isSupply = delivery.materialRequest?.requestType === 'external_supply';
  const received = Number(form.receivedQuantity) || 0;
  const accepted = Number(form.acceptedQuantity) || 0;
  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!form.receivedAt) next.receivedAt = 'Waktu terima wajib diisi.';
    if (!(received > 0)) next.receivedQuantity = 'Jumlah datang harus lebih dari 0.';
    if (form.acceptedQuantity === '' || accepted < 0) next.acceptedQuantity = 'Isi jumlah diterima baik (0 bila semua ditolak).';
    else if (accepted > received) next.acceptedQuantity = 'Tidak boleh melebihi jumlah yang datang.';
    if (isSupply && !form.externalReceiverName.trim()) next.externalReceiverName = 'Nama penerima di klien wajib diisi.';
    if (files.length === 0) next.proofs = 'Lampirkan minimal satu bukti.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await createReceipt({
        materialDeliveryId: delivery.id,
        receivedAt: new Date(form.receivedAt).toISOString(),
        receivedQuantity: received,
        acceptedQuantity: accepted,
        notes: form.notes,
        ...(isSupply && { externalReceiverName: form.externalReceiverName, externalReceiverPhone: form.externalReceiverPhone }),
      }, files));
    } catch (requestError) {
      setErrors(fieldErrorsFrom(requestError));
      setFormError(requestError.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={[{ label: 'Request Material', href: '#/lapangan/material' }, { label: delivery.materialRequest?.requestCode, href: `#/lapangan/material/${delivery.materialRequestId}` }, { label: 'Penerimaan' }]}
      icon="📦"
      title="Catat Penerimaan"
      subtitle={`${delivery.deliveryNoteNumber} · ${delivery.materialType?.materialName} · dikirim ${formatNumber(delivery.deliveredQuantity)} ${delivery.unit}`}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Simpan Penerimaan"
      footerNote={received ? `Ditolak: ${formatNumber(Math.max(0, received - accepted))} ${delivery.unit}` : ''}
      aside={(
        <InfoCard title="Aturan">
          <p>Jumlah diterima baik menambah stok tahapan (konstruksi). Yang ditolak tidak.</p>
          <p>Bukti wajib 1–5 berkas: foto muatan atau surat jalan bertanda tangan.</p>
          <p>Setelah dicatat, surat jalannya terkunci.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>
      <Field label="Waktu Terima" htmlFor="receivedAt" required error={errors.receivedAt}>
        <input id="receivedAt" name="receivedAt" type="datetime-local" max={nowLocal()} value={form.receivedAt} onChange={update} className="input-control text-sm sm:max-w-xs" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Jumlah Datang (${delivery.unit})`} htmlFor="receivedQuantity" required error={errors.receivedQuantity}>
          <input id="receivedQuantity" name="receivedQuantity" type="number" min="0" step="any" value={form.receivedQuantity} onChange={update} className="input-control font-mono text-sm" />
        </Field>
        <Field label={`Diterima Baik (${delivery.unit})`} htmlFor="acceptedQuantity" required error={errors.acceptedQuantity}>
          <input id="acceptedQuantity" name="acceptedQuantity" type="number" min="0" step="any" value={form.acceptedQuantity} onChange={update} className="input-control font-mono text-sm" />
        </Field>
      </div>
      {isSupply && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Penerima di Klien" htmlFor="externalReceiverName" required error={errors.externalReceiverName}>
            <input id="externalReceiverName" name="externalReceiverName" value={form.externalReceiverName} onChange={update} className="input-control text-sm" />
          </Field>
          <Field label="Telepon Penerima" htmlFor="externalReceiverPhone">
            <input id="externalReceiverPhone" name="externalReceiverPhone" value={form.externalReceiverPhone} onChange={update} className="input-control text-sm" />
          </Field>
        </div>
      )}
      <Field label="Catatan" htmlFor="notes">
        <input id="notes" name="notes" value={form.notes} onChange={update} maxLength={500} className="input-control text-sm" placeholder="Contoh: 2 m³ basah, ditolak" />
      </Field>
      <Field label="Bukti Penerimaan" htmlFor="proofs" required error={errors.proofs} hint="1–5 berkas: PDF, JPG, PNG, atau WebP, maksimal 10 MB per berkas.">
        <FilePicker id="proofs" files={files} onChange={setFiles} max={5} />
      </Field>
    </FormPage>
  );
}
