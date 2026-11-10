import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../admin/project/components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../../admin/project/components/ProjectUi.jsx';
import { formatCurrency, todayIso } from '../../admin/project/utils/projectFormat.js';
import { FilePicker } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { createPaymentProof, getWageClaim } from '../services/fieldService.js';

/** Bukti bayar klaim `approved`. Divalidasi Finance; nominal boleh beda dari klaim. */
export default function PaymentProofFormPage({ claimId, onCancel, onSaved }) {
  const { data: claim, error } = useRecord(() => getWageClaim(claimId), claimId);
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [editedAmount, setPaidAmount] = useState(null);
  const [receiverName, setReceiverName] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (error) return <EmptyPanel icon="🔎" title="Klaim tidak ditemukan">{error}</EmptyPanel>;
  if (!claim) return <LoadingPanel>Memuat klaim...</LoadingPanel>;
  if (claim.status !== 'approved' || claim.payment) {
    return (
      <EmptyPanel icon="🔒" title="Bukti belum bisa diunggah" action={<button type="button" onClick={onCancel} className="btn btn-secondary text-xs">← Kembali</button>}>
        {claim.payment ? `Klaim ini sudah punya bukti ${claim.payment.proofCode}. Bukti baru hanya bila yang lama ditolak atau dibatalkan.` : 'Bukti bayar hanya untuk klaim yang sudah disetujui Finance.'}
      </EmptyPanel>
    );
  }

  const paidAmount = editedAmount ?? String(claim.totalAmount);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!paymentDate) next.paymentDate = 'Tanggal bayar wajib diisi.';
    if (!(Number(paidAmount) > 0)) next.paidAmount = 'Nominal harus lebih dari 0.';
    if (files.length === 0) next.proofs = 'Lampirkan minimal satu berkas bukti.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await createPaymentProof({ laborWageClaimId: claim.id, paymentDate, paidAmount: Number(paidAmount), receiverName: receiverName.trim(), notes: notes.trim() }, files));
    } catch (requestError) {
      setFormError(requestError.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={[{ label: 'Upah Pekerja', href: '#/lapangan/upah' }, { label: claim.claimCode, href: `#/lapangan/upah/${claim.id}` }, { label: 'Bukti Bayar' }]}
      icon="🧾"
      title="Unggah Bukti Bayar"
      subtitle={`${claim.claimCode} · total klaim ${formatCurrency(claim.totalAmount)}`}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Kirim ke Finance"
      footerNote={Number(paidAmount) && Number(paidAmount) !== claim.totalAmount ? `Selisih ${formatCurrency(claim.totalAmount - Number(paidAmount))} dari total klaim` : ''}
      aside={(
        <InfoCard title="Aturan">
          <p>Hanya satu bukti aktif per klaim. Ditolak bersifat final: unggah bukti baru.</p>
          <p>Klaim dinyatakan lunas setelah bukti divalidasi Finance.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal Bayar" htmlFor="paymentDate" required error={errors.paymentDate}>
          <input id="paymentDate" type="date" max={todayIso()} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="input-control text-sm" />
        </Field>
        <Field label="Nominal Dibayar" htmlFor="paidAmount" required error={errors.paidAmount}>
          <input id="paidAmount" type="number" min="0" step="any" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} className="input-control font-mono text-sm" />
        </Field>
      </div>
      <Field label="Diterima Oleh" htmlFor="receiverName">
        <input id="receiverName" value={receiverName} onChange={(event) => setReceiverName(event.target.value)} maxLength={150} className="input-control text-sm" placeholder="Contoh: Mandor tahapan" />
      </Field>
      <Field label="Catatan" htmlFor="notes">
        <input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className="input-control text-sm" placeholder="Opsional" />
      </Field>
      <Field label="Berkas Bukti" htmlFor="proofs" required error={errors.proofs} hint="1–10 berkas: PDF, JPG, PNG, atau WebP, maksimal 10 MB per berkas.">
        <FilePicker id="proofs" files={files} onChange={setFiles} max={10} />
      </Field>
    </FormPage>
  );
}
