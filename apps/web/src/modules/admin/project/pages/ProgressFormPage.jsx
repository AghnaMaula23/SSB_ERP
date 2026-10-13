import { useEffect, useState } from 'react';
import FormPage, { Field, FormError, InfoCard, SectionDivider } from '../components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../components/ProjectUi.jsx';
import { createProgressLog, getProgressLog, updateProgressLog } from '../services/projectService.js';
import { fieldErrorsFrom, formatDate, formatVolume, stageCrumbs, todayIso, unitLabel } from '../utils/projectFormat.js';

const WEATHER_OPTIONS = ['Cerah', 'Berawan', 'Gerimis', 'Hujan', 'Hujan Lebat'];

const emptyForm = () => ({
  progressDate: todayIso(),
  realizedVolume: '',
  notes: '',
  weatherMorning: '',
  weatherAfternoon: '',
  fieldConditionNotes: '',
  incidentNotes: '',
});

const toForm = (log) => ({
  progressDate: log.progressDate,
  realizedVolume: log.realizedVolume ?? '',
  notes: log.notes || '',
  weatherMorning: log.fieldCondition?.weatherMorning || '',
  weatherAfternoon: log.fieldCondition?.weatherAfternoon || '',
  fieldConditionNotes: log.fieldCondition?.fieldConditionNotes || '',
  incidentNotes: log.fieldCondition?.incidentNotes || '',
});

function WeatherSelect({ id, value, onChange }) {
  const known = WEATHER_OPTIONS.includes(value) || value === '';
  return (
    <select id={id} name={id} value={value} onChange={onChange} className="input-control text-sm">
      <option value="">- Pilih cuaca -</option>
      {WEATHER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
      {!known && <option value={value}>{value}</option>}
    </select>
  );
}

/** Catat atau perbaiki realisasi harian satu tahapan (permission progress:create). */
export default function ProgressFormPage({ project, stage, logId, onCancel, onSaved }) {
  const isEdit = Boolean(logId);
  const [form, setForm] = useState(emptyForm);
  const [original, setOriginal] = useState(null);
  const [loadState, setLoadState] = useState(isEdit ? 'loading' : 'ready');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const unit = unitLabel(stage.volumeUnit);

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    getProgressLog(stage.id, logId)
      .then((log) => {
        if (cancelled) return;
        setOriginal(log);
        setForm(toForm(log));
        setLoadState('ready');
      })
      .catch((error) => { if (!cancelled) { setFormError(error.message); setLoadState('error'); } });
    return () => { cancelled = true; };
  }, [isEdit, logId, stage.id]);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.progressDate) nextErrors.progressDate = 'Tanggal wajib diisi.';
    else if (form.progressDate > todayIso()) nextErrors.progressDate = 'Tanggal tidak boleh di masa depan.';
    if (form.realizedVolume === '' || Number(form.realizedVolume) < 0) nextErrors.realizedVolume = 'Volume wajib diisi dan tidak boleh negatif.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      const saved = isEdit
        ? await updateProgressLog(stage.id, logId, form, { hadCondition: Boolean(original?.fieldCondition) })
        : await createProgressLog(stage.id, form);
      onSaved(saved);
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  const crumbs = stageCrumbs(project, stage, { label: 'Kontrak Volume', href: `#/admin/projects/${project.id}/sub/${stage.id}/volume` }, { label: isEdit ? 'Ubah Progress' : 'Input Progress' });

  if (loadState === 'loading') return <LoadingPanel>Memuat catatan progress...</LoadingPanel>;
  if (loadState === 'error') return <EmptyPanel icon="🔎" title="Catatan tidak bisa dibuka">{formError}</EmptyPanel>;
  if (!isEdit && stage.status !== 'active') {
    return (
      <EmptyPanel icon="⏸️" title="Tahapan belum aktif" action={<a href={`#/admin/projects/${project.id}`} className="btn btn-secondary text-xs">← Ke ringkasan project</a>}>
        Progress harian hanya bisa dicatat pada tahapan berstatus Active. Aktifkan tahapan ini dulu dari ringkasan project.
      </EmptyPanel>
    );
  }
  if (isEdit && original?.status === 'validated') {
    return (
      <EmptyPanel icon="🔒" title="Progress sudah divalidasi" action={<a href={`#/admin/projects/${project.id}/sub/${stage.id}/volume`} className="btn btn-secondary text-xs">← Kembali</a>}>
        Angka tervalidasi sudah menjadi dasar tagihan. Admin perlu menekan “Buka Kembali” pada baris ini sebelum catatannya bisa diperbaiki.
      </EmptyPanel>
    );
  }

  return (
    <FormPage
      breadcrumb={crumbs}
      icon="📝"
      title={isEdit ? `Ubah Progress ${formatDate(original?.progressDate)}` : 'Input Progress Harian'}
      subtitle={`Realisasi volume tahapan dalam ${unit}`}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Simpan Perubahan' : 'Simpan Progress'}
      footerNote="Progress baru berstatus Menunggu Validasi."
      aside={(
        <InfoCard title="Posisi tahapan">
          <p>Target total <b>{formatVolume(stage.targetVolume, stage.volumeUnit)}</b>{stage.dailyTargetVolume ? <>, target harian <b>{formatVolume(stage.dailyTargetVolume, stage.volumeUnit)}</b></> : null}.</p>
          <p>Sudah tervalidasi {formatVolume(stage.progress?.validatedVolume, stage.volumeUnit)}, sisa {formatVolume(stage.progress?.remainingVolume, stage.volumeUnit)}.</p>
          <p>Satu tanggal hanya boleh satu catatan per tahapan. Tanggal tidak bisa diubah setelah disimpan.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal Progress" htmlFor="progressDate" required error={errors.progressDate} hint={isEdit ? 'Tanggal tidak bisa diubah.' : undefined}>
          <input id="progressDate" name="progressDate" type="date" max={todayIso()} value={form.progressDate} onChange={update} disabled={isEdit} className="input-control text-sm disabled:bg-slate-100" />
        </Field>
        <Field label={`Volume Realisasi (${unit})`} htmlFor="realizedVolume" required error={errors.realizedVolume}>
          <input id="realizedVolume" name="realizedVolume" type="number" min="0" step="any" inputMode="decimal" value={form.realizedVolume} onChange={update} className="input-control font-mono text-sm" placeholder="0.00" autoFocus />
        </Field>
      </div>
      <Field label="Catatan Pekerjaan" htmlFor="notes" error={errors.notes}>
        <textarea id="notes" name="notes" rows={2} value={form.notes} onChange={update} className="input-control h-auto resize-y text-sm" placeholder="Contoh: Galian badan jalan segmen 17" />
      </Field>

      <SectionDivider>Kondisi Lapangan</SectionDivider>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cuaca Pagi" htmlFor="weatherMorning" error={errors['fieldCondition.weatherMorning']}>
          <WeatherSelect id="weatherMorning" value={form.weatherMorning} onChange={update} />
        </Field>
        <Field label="Cuaca Siang" htmlFor="weatherAfternoon" error={errors['fieldCondition.weatherAfternoon']}>
          <WeatherSelect id="weatherAfternoon" value={form.weatherAfternoon} onChange={update} />
        </Field>
      </div>
      <Field label="Catatan Kondisi Lapangan" htmlFor="fieldConditionNotes">
        <textarea id="fieldConditionNotes" name="fieldConditionNotes" rows={2} value={form.fieldConditionNotes} onChange={update} className="input-control h-auto resize-y text-sm" placeholder="Contoh: Tanah becek di STA 12+400" />
      </Field>
      <Field label="Insiden" htmlFor="incidentNotes">
        <textarea id="incidentNotes" name="incidentNotes" rows={2} value={form.incidentNotes} onChange={update} className="input-control h-auto resize-y text-sm" placeholder="Kosongkan bila tidak ada insiden" />
      </Field>
    </FormPage>
  );
}
