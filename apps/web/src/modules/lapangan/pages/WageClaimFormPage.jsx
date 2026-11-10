import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../admin/project/components/FormPage.jsx';
import { formatCurrency, todayIso } from '../../admin/project/utils/projectFormat.js';
import { StageSelect } from '../components/FieldUi.jsx';
import { useActiveStages, useRecord } from '../hooks/useFieldData.js';
import { createWageClaim, listUnclaimedLogs } from '../services/fieldService.js';

/**
 * Log tidak dipilih satu per satu: semua log tahapan dalam rentang yang belum ada
 * di klaim aktif ikut utuh (L5). Pratinjau di form hanya menampilkan apa yang akan ikut.
 */
export default function WageClaimFormPage({ onCancel, onSaved }) {
  const { stages, error: stageError } = useActiveStages();
  const [subProjectId, setSubProjectId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = subProjectId && periodStart && periodEnd && periodStart <= periodEnd;
  const { data: preview } = useRecord(
    () => (ready ? listUnclaimedLogs(subProjectId, periodStart, periodEnd) : Promise.resolve(null)),
    `${subProjectId}|${periodStart}|${periodEnd}`,
  );
  const logs = preview?.data || [];
  const total = logs.reduce((sum, log) => sum + (log.summary?.totalWage || 0), 0);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!subProjectId) next.subProjectId = 'Pilih tahapan.';
    if (!periodStart) next.periodStart = 'Tanggal awal wajib diisi.';
    if (!periodEnd) next.periodEnd = 'Tanggal akhir wajib diisi.';
    else if (periodStart && periodStart > periodEnd) next.periodEnd = 'Tanggal akhir tidak boleh sebelum tanggal awal.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await createWageClaim({ subProjectId: Number(subProjectId), periodStart, periodEnd, ...(notes.trim() && { notes: notes.trim() }) }));
    } catch (error) {
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={[{ label: 'Upah Pekerja', href: '#/lapangan/upah' }, { label: 'Ajukan Klaim' }]}
      icon="👷"
      title="Ajukan Klaim Upah"
      subtitle="Pilih tahapan dan rentang tanggal. Admin memeriksa, lalu Finance menyetujui."
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Kirim ke Admin"
      footerNote={ready && preview ? `${logs.length} log belum diklaim · perkiraan ${formatCurrency(total)}` : ''}
      aside={(
        <InfoCard title="Aturan">
          <p>Semua log dalam rentang yang belum diklaim ikut otomatis. Rentang tanpa log ditolak.</p>
          <p>Log di klaim aktif terkunci. Klaim ditolak atau dibatalkan membuka lognya lagi.</p>
          <p>Tahapan baru bisa ditutup setelah semua log diklaim dan buktinya tervalidasi.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError || stageError}</FormError>
      <Field label="Tahapan" htmlFor="subProjectId" required error={errors.subProjectId}>
        <StageSelect stages={stages} value={subProjectId} onChange={setSubProjectId} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Periode Mulai" htmlFor="periodStart" required error={errors.periodStart}>
          <input id="periodStart" type="date" max={todayIso()} value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="input-control text-sm" />
        </Field>
        <Field label="Periode Selesai" htmlFor="periodEnd" required error={errors.periodEnd}>
          <input id="periodEnd" type="date" max={todayIso()} value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="input-control text-sm" />
        </Field>
      </div>
      {ready && preview && (
        <p className={`rounded-lg border p-3 text-xs ${logs.length ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {logs.length
            ? `${logs.length} log harian akan masuk klaim ini, total ${formatCurrency(total)}.`
            : 'Tidak ada log yang belum diklaim pada rentang ini.'}
        </p>
      )}
      <Field label="Catatan" htmlFor="notes">
        <input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className="input-control text-sm" placeholder="Opsional" />
      </Field>
    </FormPage>
  );
}
