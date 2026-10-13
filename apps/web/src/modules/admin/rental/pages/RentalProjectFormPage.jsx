import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard, SectionDivider } from '../../project/components/FormPage.jsx';
import { MockBanner } from '../../project/components/ProjectUi.jsx';
import ProjectSourceField from '../../components/ProjectSourceField.jsx';
import UnitFields from '../components/UnitFields.jsx';
import { fieldErrorsFrom } from '../../project/utils/projectFormat.js';
import { BILLING_METHODS } from '../utils/rentalFormat.js';
import { emptyUnitForm, validateUnitForm } from '../utils/unitForm.js';

const toForm = (project) => ({
  clientName: project?.clientName || '',
  projectName: project?.projectName || '',
  location: project?.location || '',
  contractNo: project?.contractNo || '',
  contractStartDate: project?.contractStartDate || '',
  contractEndDate: project?.contractEndDate || '',
  billingMethod: project?.billingMethod || 'hourly',
});

/**
 * "Transaksi Baru" — kontrak rental. Saat membuat, unit pertama boleh langsung
 * diisi seperti di prototype; workspace lalu mengirimnya sebagai Request Alat
 * setelah kontraknya tersimpan (`onSubmitForm(form, unitForm | null)`).
 */
export default function RentalProjectFormPage({ project, onSubmitForm, onCancel, onSaved }) {
  const isEdit = Boolean(project);
  const [form, setForm] = useState(() => toForm(project));
  const [withUnit, setWithUnit] = useState(!isEdit);
  const [unit, setUnit] = useState(() => emptyUnitForm());
  const [errors, setErrors] = useState({});
  const [unitErrors, setUnitErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    // Periode unit pertama mengikuti periode kontrak selama belum diubah sendiri.
    if (name === 'contractStartDate' || name === 'contractEndDate') {
      const key = name === 'contractStartDate' ? 'periodStart' : 'periodEnd';
      setUnit((current) => (current[key] === form[name] ? { ...current, [key]: value } : current));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.clientName.trim()) nextErrors.clientName = 'Nama penyewa wajib diisi.';
    if (!form.projectName.trim()) nextErrors.projectName = 'Pilih proyek.';
    if (form.contractStartDate && form.contractEndDate && form.contractStartDate > form.contractEndDate) nextErrors.contractEndDate = 'Periode akhir tidak boleh sebelum periode mulai.';
    const nextUnitErrors = withUnit ? validateUnitForm(unit, { optional: true }) : {};
    setErrors(nextErrors);
    setUnitErrors(nextUnitErrors);
    if (Object.keys(nextErrors).length || Object.keys(nextUnitErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await onSubmitForm(form, withUnit && unit.equipmentTypeId ? unit : null));
    } catch (error) {
      const apiErrors = fieldErrorsFrom(error);
      if (apiErrors.rentalProjectName) apiErrors.projectName = apiErrors.rentalProjectName;
      setErrors(apiErrors);
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={isEdit
        ? [{ label: 'Rental', href: '#/admin/rental' }, { label: project.projectName, href: `#/admin/rental/${project.id}` }, { label: 'Ubah' }]
        : [{ label: 'Rental', href: '#/admin/rental' }, { label: 'Transaksi Baru' }]}
      icon="🛠️"
      title={isEdit ? 'Ubah Kontrak Rental' : 'Transaksi Baru'}
      subtitle={isEdit ? project.projectCode : 'Sewa alat berat ke penyewa eksternal'}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Simpan Perubahan' : '➤ Submit Request'}
      footerNote={<><span className="text-red-500">*</span> wajib diisi</>}
      aside={(
        <InfoCard title="Alur sewa">
          <p>1. Kontrak tersimpan dengan kode RNT otomatis.</p>
          <p>2. Unit yang diminta dikirim sebagai <b>Request Alat</b> dan langsung masuk antrean Divisi Alat.</p>
          <p>3. Setelah disetujui, Divisi Alat menentukan unit fisiknya — baru timesheet bisa diisi.</p>
        </InfoCard>
      )}
    >
      {project?.isDemo && <MockBanner>Ini kontrak contoh — perubahan hanya tersimpan di browser ini.</MockBanner>}
      <FormError>{formError}</FormError>

      <Field label="Penyewa" htmlFor="clientName" required error={errors.clientName}>
        <input id="clientName" name="clientName" value={form.clientName} onChange={update} maxLength={255} className="input-control text-sm uppercase" placeholder="PT SINAR UTARA BANTEN" autoFocus={!isEdit} />
      </Field>
      <ProjectSourceField
        projectName={form.projectName}
        location={form.location}
        legacyName={project?.projectName}
        legacyLocation={project?.location}
        error={errors.projectName}
        onChange={({ projectName, location }) => { setForm((current) => ({ ...current, projectName, location })); setErrors((current) => ({ ...current, projectName: undefined })); }}
      />

      <SectionDivider>Kontrak</SectionDivider>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Periode Mulai" htmlFor="contractStartDate" error={errors.contractStartDate}>
          <input id="contractStartDate" name="contractStartDate" type="date" value={form.contractStartDate} onChange={update} className="input-control text-sm" />
        </Field>
        <Field label="Periode Akhir" htmlFor="contractEndDate" error={errors.contractEndDate}>
          <input id="contractEndDate" name="contractEndDate" type="date" value={form.contractEndDate} min={form.contractStartDate || undefined} onChange={update} className="input-control text-sm" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nomor Kontrak" htmlFor="contractNo" error={errors.contractNo}>
          <input id="contractNo" name="contractNo" value={form.contractNo} onChange={update} maxLength={100} className="input-control text-sm" placeholder="Opsional" />
        </Field>
        <Field label="Metode Tagihan" htmlFor="billingMethod" error={errors.billingMethod}>
          <select id="billingMethod" name="billingMethod" value={form.billingMethod} onChange={update} className="input-control text-sm">
            {Object.entries(BILLING_METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
      </div>

      {!isEdit && (
        <>
          <SectionDivider>Unit Pertama</SectionDivider>
          <label className="-mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={withUnit} onChange={(event) => setWithUnit(event.target.checked)} className="accent-teal-700" />
            Langsung ajukan unit untuk kontrak ini (bisa juga ditambah nanti lewat “Unit Baru”)
          </label>
          {withUnit && (
            <UnitFields
              form={unit}
              errors={unitErrors}
              idPrefix="first-unit"
              onChange={(patch) => { setUnit((current) => ({ ...current, ...patch })); setUnitErrors({}); }}
            />
          )}
        </>
      )}
    </FormPage>
  );
}
