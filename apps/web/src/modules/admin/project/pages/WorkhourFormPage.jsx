import { useEffect, useState } from 'react';
import FormPage, { Field, FormError, InfoCard, SectionDivider } from '../components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../components/ProjectUi.jsx';
import { createWorkhourLog, listAllocations } from '../services/projectService.js';
import { fieldErrorsFrom, stageCrumbs, subProjectTypeLabel, todayIso } from '../utils/projectFormat.js';

const toMinutes = (time) => {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/** Jam bersih dari jam mulai–selesai dikurangi jeda; null kalau belum lengkap. */
const computeHours = ({ startTime, stopTime, pausedDurationMinutes }) => {
  const start = toMinutes(startTime);
  const stop = toMinutes(stopTime);
  if (start === null || stop === null || stop <= start) return null;
  const net = stop - start - Number(pausedDurationMinutes || 0);
  return net > 0 ? Math.round((net / 60) * 100) / 100 : null;
};

/**
 * Catat jam kerja satu unit lewat alokasinya ke tahapan ini
 * (sourceType internal_project). Unit alat diturunkan backend dari alokasi.
 */
export default function WorkhourFormPage({ project, stage, onCancel, onSaved }) {
  const [allocations, setAllocations] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ allocationId: '', workDate: todayIso(), startTime: '07:00', stopTime: '15:00', pausedDurationMinutes: '60', totalWorkhour: '', description: '' });
  const [manualTotal, setManualTotal] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAllocations(stage.id, { status: 'assigned' })
      .then((rows) => {
        if (cancelled) return;
        setAllocations(rows);
        if (rows.length === 1) setForm((current) => ({ ...current, allocationId: String(rows[0].id) }));
      })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [stage.id]);

  const computed = computeHours(form);
  const total = manualTotal ? form.totalWorkhour : (computed ?? '');

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined, totalWorkhour: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.allocationId) nextErrors.allocationId = 'Pilih unit alat.';
    if (!form.workDate) nextErrors.workDate = 'Tanggal wajib diisi.';
    else if (form.workDate > todayIso()) nextErrors.workDate = 'Tanggal tidak boleh di masa depan.';
    if ((form.startTime && !form.stopTime) || (!form.startTime && form.stopTime)) nextErrors.stopTime = 'Isi jam mulai dan selesai sekaligus, atau kosongkan keduanya.';
    else if (form.startTime && toMinutes(form.stopTime) <= toMinutes(form.startTime)) nextErrors.stopTime = 'Jam selesai harus setelah jam mulai (shift lewat tengah malam dicatat per tanggal).';
    if (!(Number(total) > 0 && Number(total) <= 24)) nextErrors.totalWorkhour = 'Total jam harus lebih dari 0 dan maksimal 24.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await createWorkhourLog({ ...form, totalWorkhour: total }));
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  if (loadError) return <EmptyPanel icon="⚠️" title="Alokasi alat tidak bisa dimuat">{loadError}</EmptyPanel>;
  if (!allocations) return <LoadingPanel>Memuat alat di tahapan ini...</LoadingPanel>;
  if (allocations.length === 0) {
    return (
      <EmptyPanel icon="🚜" title="Belum ada alat aktif" action={<a href={`#/admin/projects/${project.id}/sub/${stage.id}/alat`} className="btn btn-secondary text-xs">Ke halaman Alat →</a>}>
        Jam kerja dicatat lewat alokasi yang masih berjalan. Alokasikan alat ke tahapan ini dulu.
      </EmptyPanel>
    );
  }

  return (
    <FormPage
      breadcrumb={stageCrumbs(project, stage, { label: 'Timesheet Alat', href: `#/admin/projects/${project.id}/sub/${stage.id}/timesheet` }, { label: 'Input Jam Kerja' })}
      icon="⏱️"
      title="Input Jam Kerja Alat"
      subtitle={`Tahapan ${subProjectTypeLabel(stage.subProjectType)} · ${project.projectName}`}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Simpan Jam Kerja"
      footerNote="Jam kerja ikut menggerakkan counter maintenance alat."
      aside={(
        <InfoCard title="Ketentuan">
          <p>Total jam per unit per hari maksimal 24 jam, termasuk catatan lain di tanggal yang sama.</p>
          <p>Unit berstatus maintenance/retired tidak bisa dicatat jam kerjanya.</p>
          <p>Untuk beberapa sesi (pagi, siang, lembur), simpan satu catatan per sesi.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Unit Alat" htmlFor="allocationId" required error={errors.allocationId || errors.subProjectEquipmentAllocationId}>
          <select id="allocationId" name="allocationId" value={form.allocationId} onChange={update} className="input-control text-sm">
            <option value="">- Pilih unit -</option>
            {allocations.map((row) => (
              <option key={row.id} value={row.id}>{row.equipmentItem?.assetCode} — {row.poolItem?.equipmentType?.typeName}</option>
            ))}
          </select>
        </Field>
        <Field label="Tanggal Kerja" htmlFor="workDate" required error={errors.workDate}>
          <input id="workDate" name="workDate" type="date" max={todayIso()} value={form.workDate} onChange={update} className="input-control text-sm" />
        </Field>
      </div>

      <SectionDivider>Sesi Kerja</SectionDivider>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Jam Mulai" htmlFor="startTime" error={errors.startedAt}>
          <input id="startTime" name="startTime" type="time" value={form.startTime} onChange={update} className="input-control font-mono text-sm" />
        </Field>
        <Field label="Jam Selesai" htmlFor="stopTime" error={errors.stopTime || errors.stoppedAt}>
          <input id="stopTime" name="stopTime" type="time" value={form.stopTime} onChange={update} className="input-control font-mono text-sm" />
        </Field>
        <Field label="Jeda (menit)" htmlFor="pausedDurationMinutes" error={errors.pausedDurationMinutes} hint="Istirahat / standby.">
          <input id="pausedDurationMinutes" name="pausedDurationMinutes" type="number" min="0" step="1" value={form.pausedDurationMinutes} onChange={update} className="input-control font-mono text-sm" />
        </Field>
      </div>

      <Field
        label="Total Jam Kerja"
        htmlFor="totalWorkhour"
        required
        error={errors.totalWorkhour}
        hint={manualTotal ? 'Diisi manual (mis. dari pembacaan hour meter).' : 'Dihitung otomatis dari jam mulai − selesai − jeda.'}
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="totalWorkhour"
            name="totalWorkhour"
            type="number"
            min="0"
            max="24"
            step="0.01"
            value={total}
            onChange={update}
            readOnly={!manualTotal}
            className={`input-control max-w-[10rem] font-mono text-sm ${manualTotal ? '' : 'bg-slate-100'}`}
          />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={manualTotal}
              onChange={(event) => {
                setManualTotal(event.target.checked);
                if (event.target.checked) setForm((current) => ({ ...current, totalWorkhour: computed ?? '' }));
              }}
              className="accent-teal-700"
            />
            Isi manual
          </label>
        </div>
      </Field>

      <Field label="Keterangan" htmlFor="description">
        <textarea id="description" name="description" rows={2} value={form.description} onChange={update} className="input-control h-auto resize-y text-sm" placeholder="Contoh: Galian badan jalan STA 12+400 – 12+600" />
      </Field>
    </FormPage>
  );
}
