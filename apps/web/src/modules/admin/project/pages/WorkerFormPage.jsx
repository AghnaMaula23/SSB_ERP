import { useEffect, useState } from 'react';
import FormPage, { Field, FormError, InfoCard, SectionDivider } from '../components/FormPage.jsx';
import { EmptyPanel, LoadingPanel, MockBanner } from '../components/ProjectUi.jsx';
import { EMPLOYMENT_TYPES, WORKER_ROLES, WORKER_STATUS, createWorker, getWorker, updateWorker } from '../services/fieldMockService.js';
import { fieldErrorsFrom, stageCrumbs } from '../utils/projectFormat.js';

const emptyForm = { fullName: '', nik: '', role: WORKER_ROLES[0], groupName: '', status: 'active', employmentType: 'harian', phone: '', dailyWage: '' };

/** Tambah atau ubah pekerja tahapan — DATA CONTOH. */
export default function WorkerFormPage({ project, stage, workerId, onCancel, onSaved }) {
  const isEdit = Boolean(workerId);
  const [form, setForm] = useState(emptyForm);
  const [loadState, setLoadState] = useState(isEdit ? 'loading' : 'ready');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    getWorker(stage.id, workerId)
      .then((worker) => {
        if (cancelled) return;
        setForm({ ...emptyForm, ...worker, dailyWage: worker.dailyWage ? String(worker.dailyWage) : '' });
        setLoadState('ready');
      })
      .catch((error) => { if (!cancelled) { setFormError(error.message); setLoadState('error'); } });
    return () => { cancelled = true; };
  }, [isEdit, stage.id, workerId]);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.fullName.trim()) nextErrors.fullName = 'Nama wajib diisi.';
    if (!/^\d{16}$/.test(form.nik.trim())) nextErrors.nik = 'NIK harus 16 digit angka.';
    if (form.phone.trim() && !/^[0-9+\-\s]{8,16}$/.test(form.phone.trim())) nextErrors.phone = 'Nomor telepon tidak valid.';
    if (form.employmentType === 'harian' && !(Number(form.dailyWage) > 0)) nextErrors.dailyWage = 'Upah harian wajib diisi untuk pekerja harian.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(isEdit ? await updateWorker(stage.id, workerId, form) : await createWorker(stage.id, form));
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  if (loadState === 'loading') return <LoadingPanel>Memuat pekerja...</LoadingPanel>;
  if (loadState === 'error') return <EmptyPanel icon="🔎" title="Pekerja tidak ditemukan">{formError}</EmptyPanel>;

  return (
    <FormPage
      breadcrumb={stageCrumbs(project, stage, { label: 'Pekerja', href: `#/admin/projects/${project.id}/sub/${stage.id}/pekerja` }, { label: isEdit ? 'Ubah' : 'Tambah Pekerja' })}
      icon="👷"
      title={isEdit ? `Ubah ${form.fullName || 'Pekerja'}` : 'Tambah Pekerja'}
      subtitle="Data tenaga kerja yang ditugaskan di tahapan ini"
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Simpan Perubahan' : 'Simpan Pekerja'}
      footerNote={<><span className="text-red-500">*</span> wajib diisi</>}
      aside={(
        <InfoCard title="Harian vs Kontrak">
          <p><b>Harian</b> dibayar per hari kerja sesuai upah harian.</p>
          <p><b>Kontrak</b> digaji bulanan lewat payroll, jadi upah hariannya tidak diisi di sini.</p>
        </InfoCard>
      )}
    >
      <MockBanner>Belum tersambung API.</MockBanner>
      <FormError>{formError}</FormError>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama Lengkap" htmlFor="fullName" required error={errors.fullName}>
          <input id="fullName" name="fullName" value={form.fullName} onChange={update} maxLength={150} className="input-control text-sm" placeholder="Contoh: Dedi Kurniawan" autoFocus={!isEdit} />
        </Field>
        <Field label="NIK" htmlFor="nik" required error={errors.nik}>
          <input id="nik" name="nik" value={form.nik} onChange={update} inputMode="numeric" maxLength={16} className="input-control font-mono text-sm" placeholder="16 digit" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="No. Telepon" htmlFor="phone" error={errors.phone}>
          <input id="phone" name="phone" value={form.phone} onChange={update} inputMode="tel" className="input-control text-sm" placeholder="08xxxxxxxxxx" />
        </Field>
        <Field label="Status" htmlFor="status" required>
          <select id="status" name="status" value={form.status} onChange={update} className="input-control text-sm">
            {Object.entries(WORKER_STATUS).map(([value, style]) => <option key={value} value={value}>{style.label}</option>)}
          </select>
        </Field>
      </div>

      <SectionDivider>Penugasan</SectionDivider>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Peran" htmlFor="role" required>
          <select id="role" name="role" value={form.role} onChange={update} className="input-control text-sm">
            {WORKER_ROLES.map((option) => <option key={option} value={option}>{option}</option>)}
            {!WORKER_ROLES.includes(form.role) && <option value={form.role}>{form.role}</option>}
          </select>
        </Field>
        <Field label="Grup" htmlFor="groupName" hint="Contoh: Grup Beton 1, Unit Alat Berat.">
          <input id="groupName" name="groupName" value={form.groupName} onChange={update} maxLength={100} className="input-control text-sm" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Jenis Pekerja" htmlFor="employmentType" required>
          <select id="employmentType" name="employmentType" value={form.employmentType} onChange={update} className="input-control text-sm">
            {Object.entries(EMPLOYMENT_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Upah Harian (Rp)" htmlFor="dailyWage" required={form.employmentType === 'harian'} error={errors.dailyWage}>
          <input id="dailyWage" name="dailyWage" type="number" min="0" step="1000" value={form.employmentType === 'harian' ? form.dailyWage : ''} onChange={update} disabled={form.employmentType !== 'harian'} className="input-control font-mono text-sm disabled:bg-slate-100" placeholder={form.employmentType === 'harian' ? '150000' : 'Gaji bulanan'} />
        </Field>
      </div>
    </FormPage>
  );
}
