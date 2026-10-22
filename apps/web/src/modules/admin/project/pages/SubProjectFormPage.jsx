import { useState } from 'react';
import FormPage, { Field, InfoCard, SectionDivider } from '../components/FormPage.jsx';
import { createSubProject, updateSubProject } from '../services/projectService.js';
import { SUB_PROJECT_TYPES, VOLUME_UNITS, fieldErrorsFrom, formatCurrency, subProjectTypeLabel, unitLabel } from '../utils/projectFormat.js';

const toForm = (subProject, defaultType) => ({
  subProjectType: subProject?.subProjectType || defaultType || '',
  targetVolume: subProject?.targetVolume ?? '',
  volumeUnit: subProject?.volumeUnit || 'm3',
  dailyTargetVolume: subProject?.dailyTargetVolume ?? '',
  contractValue: subProject?.contractValue ?? '',
  contractNo: subProject?.contractNo || '',
  contractDate: subProject?.contractDate || '',
  sequenceOrder: subProject?.sequenceOrder ?? '',
  contractStartDate: subProject?.contractStartDate || '',
  contractEndDate: subProject?.contractEndDate || '',
});

/**
 * Tambah atau ubah tahapan (sub-project). Tipe tahapan hanya dipilih saat
 * membuat — backend memperlakukannya immutable dan satu tipe per project.
 */
export default function SubProjectFormPage({ project, subProject, usedTypes = [], onCancel, onSaved }) {
  const isEdit = Boolean(subProject);
  const availableTypes = SUB_PROJECT_TYPES.filter((type) => !usedTypes.includes(type.value));
  const [form, setForm] = useState(() => toForm(subProject, availableTypes[0]?.value));
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
    if (!isEdit && !form.subProjectType) nextErrors.subProjectType = 'Pilih jenis tahapan.';
    if (!(Number(form.targetVolume) > 0)) nextErrors.targetVolume = 'Total target harus lebih dari 0.';
    if (!form.volumeUnit.trim()) nextErrors.volumeUnit = 'Satuan wajib diisi.';
    if (form.dailyTargetVolume !== '' && !(Number(form.dailyTargetVolume) > 0)) nextErrors.dailyTargetVolume = 'Target harian harus lebih dari 0.';
    if (form.sequenceOrder !== '' && ![1, 2, 3, 4].includes(Number(form.sequenceOrder))) nextErrors.sequenceOrder = 'Urutan harus 1-4.';
    if (form.contractValue !== '' && Number(form.contractValue) < 0) nextErrors.contractValue = 'Nilai kontrak tidak boleh negatif.';
    if (form.contractStartDate && form.contractEndDate && form.contractStartDate > form.contractEndDate) nextErrors.contractEndDate = 'Tanggal akhir tidak boleh sebelum tanggal mulai.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      const saved = isEdit
        ? await updateSubProject(project.id, subProject.id, form)
        : await createSubProject(project.id, form);
      onSaved(saved);
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  const unit = unitLabel(form.volumeUnit);

  return (
    <FormPage
      breadcrumb={[
        { label: 'Project', href: '#/admin/projects' },
        { label: project.projectName, href: `#/admin/projects/${project.id}` },
        ...(isEdit ? [{ label: subProjectTypeLabel(subProject.subProjectType), href: `#/admin/projects/${project.id}/sub/${subProject.id}/volume` }, { label: 'Ubah' }] : [{ label: 'Sub-Project Baru' }]),
      ]}
      icon="🧱"
      title={isEdit ? `Ubah Tahapan ${subProjectTypeLabel(subProject.subProjectType)}` : 'Input Sub-Project Baru'}
      subtitle="Menambahkan entitas pekerjaan baru dalam struktur WBS"
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Simpan Perubahan' : 'Simpan Sub-Project'}
      footerNote="Progress & tagihan dihitung dari target volume dan nilai kontrak."
      aside={(
        <InfoCard title="Aturan tahapan">
          <p>Satu jenis tahapan hanya boleh sekali per project, dan jenisnya tidak bisa diubah setelah disimpan.</p>
          <p>Progress = volume tervalidasi ÷ total target. Nilai siap ditagih = progress × nilai kontrak.</p>
          <p>Tahapan baru berstatus <b>Planned</b>; aktifkan supaya Lapangan bisa mencatat progress harian.</p>
        </InfoCard>
      )}
    >
      {formError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{formError}</div>}

      <Field label="Nama Project" htmlFor="parentProject">
        <div id="parentProject" className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-700">
          <span aria-hidden="true" className="text-xs">🔒</span>
          <span className="truncate">{project.projectName}</span>
          <span className="ml-auto font-mono text-[11px] text-slate-400">{project.projectCode}</span>
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Jenis Sub-Project" htmlFor="subProjectType" required={!isEdit} error={errors.subProjectType} hint={isEdit ? 'Jenis tahapan tidak bisa diubah.' : 'Satu jenis tahapan per project.'}>
          {isEdit ? (
            <input id="subProjectType" value={subProjectTypeLabel(form.subProjectType)} disabled className="input-control bg-slate-100 text-sm" />
          ) : (
            <select id="subProjectType" name="subProjectType" value={form.subProjectType} onChange={update} className="input-control text-sm" disabled={availableTypes.length === 0}>
              {availableTypes.length === 0 && <option value="">Semua jenis tahapan sudah dibuat</option>}
              {availableTypes.map((type) => <option key={type.value} value={type.value}>{type.label} ({type.hint})</option>)}
            </select>
          )}
        </Field>
        <Field label="Nomor Kontrak" htmlFor="contractNo" error={errors.contractNo}>
          <input id="contractNo" name="contractNo" value={form.contractNo} onChange={update} maxLength={100} className="input-control text-sm" placeholder="Contoh: KTR/2026/014" />
        </Field>
      </div>

      <SectionDivider>Parameter Target Produksi</SectionDivider>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Total Target" htmlFor="targetVolume" required error={errors.targetVolume}>
          <input id="targetVolume" name="targetVolume" type="number" min="0" step="any" inputMode="decimal" value={form.targetVolume} onChange={update} className="input-control font-mono text-sm" placeholder="0" />
        </Field>
        <Field label="Satuan" htmlFor="volumeUnit" required error={errors.volumeUnit}>
          <select id="volumeUnit" name="volumeUnit" value={form.volumeUnit} onChange={update} className="input-control text-sm">
            {VOLUME_UNITS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            {!VOLUME_UNITS.some((option) => option.value === form.volumeUnit) && <option value={form.volumeUnit}>{form.volumeUnit}</option>}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Target Harian" htmlFor="dailyTargetVolume" error={errors.dailyTargetVolume}>
          <input id="dailyTargetVolume" name="dailyTargetVolume" type="number" min="0" step="any" inputMode="decimal" value={form.dailyTargetVolume} onChange={update} className="input-control font-mono text-sm" placeholder="0.00" />
        </Field>
        <Field label="Satuan / Hari" htmlFor="dailyUnit">
          <input id="dailyUnit" value={`${unit}/hari`} disabled className="input-control bg-slate-100 text-sm" />
        </Field>
      </div>

      <SectionDivider>Kontrak</SectionDivider>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nilai Kontrak (Rp)" htmlFor="contractValue" error={errors.contractValue} hint={form.contractValue !== '' ? formatCurrency(form.contractValue) : 'Dasar tagihan: progress tervalidasi × nilai kontrak.'}>
          <input id="contractValue" name="contractValue" type="number" min="0" step="any" inputMode="numeric" value={form.contractValue} onChange={update} className="input-control font-mono text-sm" placeholder="0" />
        </Field>
        <Field label="Tanggal Kontrak" htmlFor="contractDate" error={errors.contractDate} hint="Tanggal penandatanganan kontrak.">
          <input id="contractDate" name="contractDate" type="date" value={form.contractDate} onChange={update} className="input-control text-sm" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mulai Kontrak" htmlFor="contractStartDate" error={errors.contractStartDate}>
          <input id="contractStartDate" name="contractStartDate" type="date" value={form.contractStartDate} onChange={update} className="input-control text-sm" />
        </Field>
        <Field label="Akhir Kontrak" htmlFor="contractEndDate" error={errors.contractEndDate}>
          <input id="contractEndDate" name="contractEndDate" type="date" value={form.contractEndDate} min={form.contractStartDate || undefined} onChange={update} className="input-control text-sm" />
        </Field>
      </div>

      <SectionDivider>Urutan Pengerjaan</SectionDivider>
      <Field label="Urutan Tahapan" htmlFor="sequenceOrder" error={errors.sequenceOrder} hint="Kosongkan untuk urutan baku (Galian 1, Timbunan 2, Line Clearing 3, Aspal 4). Ubah bila kontrak menyepakati urutan lain.">
        <select id="sequenceOrder" name="sequenceOrder" value={form.sequenceOrder} onChange={update} className="input-control text-sm sm:max-w-xs">
          <option value="">Otomatis (urutan baku)</option>
          {[1, 2, 3, 4].map((order) => <option key={order} value={order}>Urutan ke-{order}</option>)}
        </select>
      </Field>
    </FormPage>
  );
}
