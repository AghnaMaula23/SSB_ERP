import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../project/components/FormPage.jsx';
import { fieldErrorsFrom } from '../../project/utils/projectFormat.js';
import { hasPermission } from '../../../../services/permissions.js';
import { createFolder } from '../services/projectFiles.js';
import { projectCrumbs, stageLabel } from '../utils/filesFormat.js';

/** Folder user baru — satu tingkat, menempel ke project atau ke satu tahapan (L8). */
export default function FolderFormPage({ type, projectId, directory, subProjectId, onCancel, onSaved }) {
  const stages = directory.stages || [];
  const [form, setForm] = useState({ name: '', subProjectId: subProjectId ? String(subProjectId) : '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(hasPermission('project-file:create') ? '' : 'Anda tidak memiliki izin membuat folder (project-file:create).');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) { setErrors({ name: 'Nama folder wajib diisi.' }); return; }
    setBusy(true);
    setFormError('');
    try {
      onSaved(await createFolder(type, projectId, form));
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={projectCrumbs(type, directory, { label: 'Folder Baru' })}
      icon="🗂"
      title="Buat Folder Baru"
      subtitle={directory.project.name}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Buat Folder"
      footerNote={<><span className="text-red-500">*</span> wajib diisi</>}
      aside={(
        <InfoCard title="Tentang folder">
          <p>Folder hanya satu tingkat — tidak ada subfolder.</p>
          <p>Surat jalan, bukti penerimaan, dan arsip penutupan sudah tampil otomatis di folder <b>Sistem</b>; tidak perlu dibuatkan folder.</p>
          <p>Nama folder unik di tempatnya (huruf besar/kecil dianggap sama).</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>
      {stages.length > 0 && (
        <Field label="Letak Folder" htmlFor="folderPlace" required error={errors.subProjectId}>
          <select id="folderPlace" value={form.subProjectId} onChange={(event) => setForm((current) => ({ ...current, subProjectId: event.target.value }))} className="input-control text-sm">
            <option value="">Tingkat project</option>
            {stages.map((stage) => <option key={stage.subProjectId} value={stage.subProjectId}>{stageLabel(stage)}</option>)}
          </select>
        </Field>
      )}
      <Field label="Nama Folder" htmlFor="folderName" required error={errors.name}>
        <input id="folderName" value={form.name} onChange={(event) => { setForm((current) => ({ ...current, name: event.target.value })); setErrors({}); }} maxLength={120} autoFocus className="input-control text-sm" placeholder="Contoh: Kontrak & Addendum" />
      </Field>
    </FormPage>
  );
}
