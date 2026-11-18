import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard, SectionDivider } from '../../project/components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../../project/components/ProjectUi.jsx';
import { fieldErrorsFrom, todayIso } from '../../project/utils/projectFormat.js';
import { useRecord } from '../../../lapangan/hooks/useFieldData.js';
import { hasPermission } from '../../../../services/permissions.js';
import { createEmployee, getEmployee, updateEmployee } from '../../../finance/services/financeService.js';
import { DEPARTMENTS } from '../utils/employeeRoute.js';

const TEXT = ['fullName', 'positionName', 'bankName', 'accountNumber', 'accountName', 'notes'];

function EmployeeForm({ initial, onCancel, onSaved }) {
  const isEdit = Boolean(initial);
  const canSave = hasPermission(isEdit ? 'employee:update' : 'employee:create');
  const [form, setForm] = useState({
    fullName: initial?.fullName || '', department: initial?.department || 'kantor', positionName: initial?.positionName || '',
    joinDate: initial?.joinDate || todayIso(), bankName: initial?.bankName || '', accountNumber: initial?.accountNumber || '',
    accountName: initial?.accountName || '', notes: initial?.notes || '', endDate: initial?.endDate || '', endReason: initial?.endReason || '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field) => (event) => { setForm((current) => ({ ...current, [field]: event.target.value })); setErrors((current) => ({ ...current, [field]: undefined })); };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) { setFormError('Akun ini hanya bisa melihat data karyawan.'); return; }
    if (!form.fullName.trim()) { setErrors({ fullName: 'Nama lengkap wajib diisi.' }); return; }
    if (form.endDate && form.endDate < form.joinDate) { setErrors({ endDate: 'Tanggal keluar tidak boleh sebelum tanggal masuk.' }); return; }
    setBusy(true);
    setFormError('');
    const payload = { department: form.department, joinDate: form.joinDate, ...Object.fromEntries(TEXT.map((f) => [f, form[f].trim() || null])) };
    payload.fullName = form.fullName.trim();
    try {
      const saved = isEdit
        ? await updateEmployee(initial.id, { ...payload, endDate: form.endDate || null, endReason: form.endDate ? form.endReason.trim() || null : null })
        : await createEmployee(payload);
      onSaved(`${saved.employeeCode} ${saved.fullName} ${isEdit ? 'diperbarui' : 'ditambahkan'}.`);
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  const input = (field, props = {}) => <input id={`emp-${field}`} value={form[field]} onChange={set(field)} disabled={!canSave} className="input-control text-sm disabled:bg-slate-100" {...props} />;

  return (
    <FormPage
      breadcrumb={[{ label: 'Master Karyawan', href: '#/admin/employees' }, { label: isEdit ? initial.employeeCode : 'Tambah Karyawan' }]}
      icon="🪪"
      title={isEdit ? initial.fullName : 'Tambah Karyawan'}
      subtitle={isEdit ? `${initial.employeeCode}${initial.user ? ` · akun ${initial.user.username}` : ''}` : 'Kode EMP- dibuat sistem.'}
      busy={busy}
      onCancel={onCancel}
      onSubmit={submit}
      submitLabel={isEdit ? 'Simpan Perubahan' : 'Tambah Karyawan'}
      aside={(
        <InfoCard title="Aturan karyawan">
          <p>Karyawan tidak dihapus. Karyawan keluar = isi tanggal keluar; ia tidak masuk payroll setelah bulan itu.</p>
          <p>Gaji pokok ditetapkan Finance di menu Gaji &amp; Upah. Rekening hanya acuan transfer.</p>
          <p>Akun login ditautkan dari Manajemen Akun (super_admin).</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama lengkap" htmlFor="emp-fullName" required error={errors.fullName}>{input('fullName', { maxLength: 150 })}</Field>
        <Field label="Bagian" htmlFor="emp-department" required>
          <select id="emp-department" value={form.department} onChange={set('department')} disabled={!canSave} className="input-control text-sm">{Object.entries(DEPARTMENTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        <Field label="Jabatan" htmlFor="emp-positionName">{input('positionName', { maxLength: 100 })}</Field>
        <Field label="Tanggal masuk" htmlFor="emp-joinDate" required error={errors.joinDate}>{input('joinDate', { type: 'date' })}</Field>
      </div>
      <SectionDivider>Rekening (acuan transfer)</SectionDivider>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Bank" htmlFor="emp-bankName">{input('bankName', { maxLength: 100 })}</Field>
        <Field label="No. rekening" htmlFor="emp-accountNumber">{input('accountNumber', { maxLength: 50 })}</Field>
        <Field label="Atas nama" htmlFor="emp-accountName">{input('accountName', { maxLength: 150 })}</Field>
      </div>
      <Field label="Catatan" htmlFor="emp-notes">{input('notes', { maxLength: 5000 })}</Field>
      {isEdit && (
        <>
          <SectionDivider>Karyawan keluar</SectionDivider>
          <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <Field label="Tanggal keluar" htmlFor="emp-endDate" error={errors.endDate} hint="Kosongkan bila masih bekerja.">{input('endDate', { type: 'date', min: form.joinDate })}</Field>
            <Field label="Alasan keluar" htmlFor="emp-endReason">{input('endReason', { maxLength: 5000, disabled: !canSave || !form.endDate })}</Field>
          </div>
        </>
      )}
    </FormPage>
  );
}

export default function EmployeeFormPage({ employeeId, onCancel, onSaved }) {
  const { data, error } = useRecord(() => (employeeId ? getEmployee(employeeId) : Promise.resolve(null)), employeeId || 'new');
  if (error) return <EmptyPanel icon="🔎" title="Karyawan tidak bisa dimuat">{error}</EmptyPanel>;
  if (employeeId && !data) return <LoadingPanel>Memuat karyawan...</LoadingPanel>;
  return <EmployeeForm initial={data} onCancel={onCancel} onSaved={onSaved} />;
}
