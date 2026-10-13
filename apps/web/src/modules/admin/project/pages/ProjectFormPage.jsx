import { useState } from 'react';
import FormPage, { Field, InfoCard, SectionDivider } from '../components/FormPage.jsx';
import { createProject, updateProject } from '../services/projectService.js';
import { fieldErrorsFrom, formatCurrency } from '../utils/projectFormat.js';

const toForm = (project) => ({
  projectName: project?.projectName || '',
  clientName: project?.clientName || '',
  location: project?.location || '',
  startDate: project?.startDate || '',
  endDate: project?.endDate || '',
});

/** Halaman buat project baru, atau ubah project yang ada bila `project` diberikan. */
export default function ProjectFormPage({ project, contractSummary, onCancel, onSaved }) {
  const isEdit = Boolean(project);
  const [form, setForm] = useState(() => toForm(project));
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
    if (!form.projectName.trim()) nextErrors.projectName = 'Nama project wajib diisi.';
    if (form.startDate && form.endDate && form.startDate > form.endDate) nextErrors.endDate = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      const saved = isEdit ? await updateProject(project.id, form) : await createProject(form);
      onSaved(saved);
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={isEdit
        ? [{ label: 'Project', href: '#/admin/projects' }, { label: project.projectName, href: `#/admin/projects/${project.id}` }, { label: 'Ubah' }]
        : [{ label: 'Project', href: '#/admin/projects' }, { label: 'Project Baru' }]}
      icon="🏗️"
      title={isEdit ? 'Ubah Project' : 'Input Project Baru'}
      subtitle={isEdit ? project.projectCode : 'Drafting new construction project'}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Simpan Perubahan' : 'Simpan Project ›'}
      footerNote={<><span className="text-red-500">*</span> wajib diisi</>}
      aside={(
        <>
          <InfoCard title="Nilai Project">
            {isEdit && contractSummary ? (
              <>
                <p className="text-xl font-bold text-slate-900">{formatCurrency(contractSummary.totalContractValue)}</p>
                <p>Jumlah nilai kontrak {contractSummary.activeStageCount} sub-project yang berjalan. Ubah nilainya lewat form masing-masing sub-project.</p>
              </>
            ) : (
              <p>Nilai project tidak diisi di sini — dihitung otomatis dari jumlah nilai kontrak tiap sub-project, karena setiap tahapan punya kontrak sendiri.</p>
            )}
          </InfoCard>
          {!isEdit && (
            <InfoCard title="Setelah disimpan">
              <p>Kode project (PRJ-xxxxxx) dibuat otomatis oleh sistem.</p>
              <p>Project baru berstatus <b>Planned</b>. Tambahkan sub-project (Galian, Timbunan, Line Clearing, Aspal) lalu mulai project dari halaman ringkasannya.</p>
            </InfoCard>
          )}
        </>
      )}
    >
      {formError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{formError}</div>}

      <Field label="Nama Project" htmlFor="projectName" required error={errors.projectName}>
        <input id="projectName" name="projectName" value={form.projectName} onChange={update} maxLength={255} className="input-control text-sm" placeholder="Contoh: Pembangunan Jalan Trans Kalimantan" autoFocus={!isEdit} />
      </Field>

      <Field label="Nama Klien" htmlFor="clientName" error={errors.clientName}>
        <input id="clientName" name="clientName" value={form.clientName} onChange={update} maxLength={255} className="input-control text-sm" placeholder="Contoh: PT Halmahera Utama" />
      </Field>

      <Field label="Lokasi Project" htmlFor="location" error={errors.location}>
        <div className="relative">
          <textarea id="location" name="location" value={form.location} onChange={update} rows={3} className="input-control h-auto resize-none pr-9 text-sm" placeholder="Masukkan alamat lengkap atau koordinat lokasi..." />
          <span className="pointer-events-none absolute bottom-2.5 right-3 text-sm text-slate-400" aria-hidden="true">📍</span>
        </div>
      </Field>

      <SectionDivider>Jadwal Project</SectionDivider>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal Mulai" htmlFor="startDate" error={errors.startDate}>
          <input id="startDate" name="startDate" type="date" value={form.startDate} onChange={update} className="input-control text-sm" />
        </Field>
        <Field label="Tanggal Selesai" htmlFor="endDate" error={errors.endDate} hint="Dipakai menghitung minggu berjalan & sisa hari.">
          <input id="endDate" name="endDate" type="date" value={form.endDate} min={form.startDate || undefined} onChange={update} className="input-control text-sm" />
        </Field>
      </div>
    </FormPage>
  );
}
