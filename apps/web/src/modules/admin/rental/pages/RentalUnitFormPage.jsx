import { useState } from 'react';
import FormPage, { FormError, InfoCard } from '../../project/components/FormPage.jsx';
import { MockBanner } from '../../project/components/ProjectUi.jsx';
import UnitFields from '../components/UnitFields.jsx';
import { fieldErrorsFrom } from '../../project/utils/projectFormat.js';
import { emptyUnitForm, validateUnitForm } from '../utils/unitForm.js';

/** "Unit Baru" — ajukan unit tambahan untuk kontrak rental (Request Alat). */
export default function RentalUnitFormPage({ project, onSubmitForm, onCancel, onSaved }) {
  const [form, setForm] = useState(() => emptyUnitForm({ neededDate: project.contractStartDate, locationDetail: project.location }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateUnitForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    setFormError('');
    try {
      onSaved(await onSubmitForm(form));
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={[{ label: 'Rental', href: '#/admin/rental' }, { label: project.projectName, href: `#/admin/rental/${project.id}` }, { label: 'Unit Baru' }]}
      icon="🚜"
      title="Unit Baru"
      subtitle={`${project.clientName ? `${project.clientName} · ` : ''}${project.projectName}`}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="➤ Submit Request"
      footerNote={project.isDemo ? 'Kontrak contoh: unit langsung aktif.' : 'Request langsung masuk antrean Divisi Alat.'}
      aside={(
        <InfoCard title="Setelah diajukan">
          <p>Divisi Alat memutuskan jumlah unit yang disetujui dan menentukan unit fisiknya.</p>
          <p>Selama menunggu, unit tampil berstatus <b>Menunggu Divisi Alat</b> di halaman kontrak dan masih bisa dibatalkan.</p>
        </InfoCard>
      )}
    >
      {project.isDemo && <MockBanner>Kontrak contoh — unit hanya tersimpan di browser ini.</MockBanner>}
      <FormError>{formError}</FormError>
      <UnitFields form={form} errors={errors} onChange={(patch) => { setForm((current) => ({ ...current, ...patch })); setErrors({}); }} />
    </FormPage>
  );
}
