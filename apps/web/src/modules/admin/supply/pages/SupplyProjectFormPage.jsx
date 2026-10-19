import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard, SectionDivider } from '../../project/components/FormPage.jsx';
import { MockBanner } from '../../project/components/ProjectUi.jsx';
import { fieldErrorsFrom } from '../../project/utils/projectFormat.js';

const toForm = (project) => ({
  clientName: project?.clientName || '',
  projectName: project?.projectName || '',
  location: project?.location || '',
  contractNo: project?.contractNo || '',
  contractStartDate: project?.contractStartDate || '',
  contractEndDate: project?.contractEndDate || '',
});

/**
 * "Buat Transaksi Baru" — header kontrak supply.
 *
 * Supply adalah kontrak ke client eksternal, bukan bagian project konstruksi,
 * jadi nama proyek & lokasi diketik bebas (backlog E18). `onSubmitForm`
 * disediakan workspace: API untuk kontrak asli, penyimpanan lokal untuk
 * kontrak contoh.
 */
export default function SupplyProjectFormPage({ project, onSubmitForm, onCancel, onSaved }) {
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
    if (!form.clientName.trim()) nextErrors.clientName = 'Nama client wajib diisi.';
    if (!form.projectName.trim()) nextErrors.projectName = 'Nama pekerjaan client wajib diisi.';
    if (form.contractStartDate && form.contractEndDate && form.contractStartDate > form.contractEndDate) nextErrors.contractEndDate = 'Akhir kontrak tidak boleh sebelum mulai kontrak.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await onSubmitForm(form));
    } catch (error) {
      const apiErrors = fieldErrorsFrom(error);
      // Nama field backend `supplyProjectName`; di form disebut projectName.
      if (apiErrors.supplyProjectName) apiErrors.projectName = apiErrors.supplyProjectName;
      setErrors(apiErrors);
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={isEdit
        ? [{ label: 'Supply', href: '#/admin/supply' }, { label: project.projectName, href: `#/admin/supply/${project.id}` }, { label: 'Ubah' }]
        : [{ label: 'Supply', href: '#/admin/supply' }, { label: 'Transaksi Baru' }]}
      icon="🚚"
      title={isEdit ? 'Ubah Kontrak Supply' : 'Buat Transaksi Baru'}
      subtitle={isEdit ? project.projectCode : 'Kontrak supply material ke client eksternal'}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Simpan Perubahan' : 'Simpan'}
      footerNote={<><span className="text-red-500">*</span> wajib diisi</>}
      aside={(
        <InfoCard title="Kontrak supply">
          <p>SSB bertindak sebagai supplier. Nama pekerjaan & lokasi adalah milik client — tujuan pengiriman material, bukan project konstruksi SSB.</p>
          <p>Kode SPL dibuat otomatis saat disimpan.</p>
          <p>Tahun kontrak diambil dari tanggal mulai kontrak.</p>
        </InfoCard>
      )}
    >
      {project?.isDemo && <MockBanner>Ini kontrak contoh — perubahan hanya tersimpan di browser ini.</MockBanner>}
      <FormError>{formError}</FormError>

      <Field label="Client" htmlFor="clientName" required error={errors.clientName}>
        <input id="clientName" name="clientName" value={form.clientName} onChange={update} maxLength={255} className="input-control text-sm" placeholder="Masukkan nama perusahaan..." autoFocus={!isEdit} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama Pekerjaan Client" htmlFor="projectName" required error={errors.projectName}>
          <input id="projectName" name="projectName" value={form.projectName} onChange={update} maxLength={255} className="input-control text-sm" placeholder="Contoh: Gudang Logistik Cikarang" />
        </Field>
        <Field label="Lokasi Pengiriman" htmlFor="location" error={errors.location}>
          <input id="location" name="location" value={form.location} onChange={update} maxLength={255} className="input-control text-sm" placeholder="Contoh: Cikarang, Bekasi" />
        </Field>
      </div>

      <SectionDivider>Kontrak</SectionDivider>
      <Field label="Nomor Kontrak" htmlFor="contractNo" error={errors.contractNo}>
        <input id="contractNo" name="contractNo" value={form.contractNo} onChange={update} maxLength={100} className="input-control text-sm sm:max-w-sm" placeholder="Contoh: SPK/WIKA/2026/031" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mulai Kontrak" htmlFor="contractStartDate" error={errors.contractStartDate} hint={form.contractStartDate ? `Tahun kontrak ${form.contractStartDate.slice(0, 4)}` : 'Menentukan tahun kontrak.'}>
          <input id="contractStartDate" name="contractStartDate" type="date" value={form.contractStartDate} onChange={update} className="input-control text-sm" />
        </Field>
        <Field label="Akhir Kontrak" htmlFor="contractEndDate" error={errors.contractEndDate}>
          <input id="contractEndDate" name="contractEndDate" type="date" value={form.contractEndDate} min={form.contractStartDate || undefined} onChange={update} className="input-control text-sm" />
        </Field>
      </div>
    </FormPage>
  );
}
