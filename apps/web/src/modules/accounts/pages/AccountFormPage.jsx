import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard, SectionDivider } from '../../admin/project/components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../../admin/project/components/ProjectUi.jsx';
import { fieldErrorsFrom } from '../../admin/project/utils/projectFormat.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { currentUserId } from '../../lapangan/utils/fieldFormat.js';
import { hasPermission } from '../../../services/permissions.js';
import { getUser, listEmployeeOptions, listRoles, registerUser, setUserEmployee, setUserRoles, updateUser } from '../services/accountService.js';

const SUPER_ADMIN = 'super_admin';

function AccountForm({ initial, roles, employees, onCancel, onSaved }) {
  const isEdit = Boolean(initial);
  const isSelf = initial?.id === currentUserId();
  const [form, setForm] = useState({
    username: initial?.username || '',
    fullName: initial?.fullName || '',
    email: initial?.email || '',
    password: '',
    isActive: initial?.isActive ?? true,
  });
  const [roleIds, setRoleIds] = useState(() => (initial?.roles || []).map((role) => role.id));
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ? String(initial.employeeId) : '');
  // Karyawan yang belum tertaut ke akun lain (satu karyawan satu akun)
  const employeeOptions = (employees || []).filter((employee) => !employee.user || employee.user.id === initial?.id);
  const employeeChanged = String(initial?.employeeId || '') !== employeeId;
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const superAdmin = roles.find((role) => role.code === SUPER_ADMIN);

  const update = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  // super_admin eksklusif: memilihnya melepas role lain, dan sebaliknya.
  const toggleRole = (role) => setRoleIds((current) => {
    if (current.includes(role.id)) return current.filter((id) => id !== role.id);
    if (role.code === SUPER_ADMIN) return [role.id];
    return [...current.filter((id) => id !== superAdmin?.id), role.id];
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!isEdit && form.username.trim().length < 3) next.username = 'Username minimal 3 karakter.';
    if (!form.fullName.trim()) next.fullName = 'Nama lengkap wajib diisi.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Format email tidak valid.';
    if (!isEdit && form.password.length < 8) next.password = 'Password minimal 8 karakter.';
    if (isEdit && form.password && form.password.length < 8) next.password = 'Password baru minimal 8 karakter.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFormError('');
    try {
      let saved;
      if (isEdit) {
        saved = await updateUser(initial.id, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          ...(!isSelf && { isActive: form.isActive }),
          ...(form.password && { password: form.password }),
        });
        const before = initial.roles.map((role) => role.id).sort().join(',');
        if (!isSelf && before !== [...roleIds].sort().join(',')) saved = await setUserRoles(initial.id, roleIds);
        if (employees && employeeChanged) saved = await setUserEmployee(initial.id, employeeId || null);
        onSaved(saved, `Akun ${saved.username} diperbarui.`);
      } else {
        const created = await registerUser(form);
        try {
          saved = roleIds.length ? await setUserRoles(created.id, roleIds) : created;
          if (employees && employeeId) saved = await setUserEmployee(created.id, employeeId);
          onSaved(saved, `Akun ${created.username} dibuat.`);
        } catch (roleError) {
          // Akunnya sudah tersimpan — jangan sembunyikan, arahkan ke halaman ubah.
          onSaved(created, `Akun ${created.username} dibuat, tetapi role/tautan karyawan gagal dipasang: ${roleError.message}`);
        }
      }
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={[{ label: 'Manajemen Akun', href: '#/akun' }, { label: isEdit ? initial.username : 'Buat Akun' }]}
      icon="👤"
      title={isEdit ? `Kelola ${initial.fullName}` : 'Buat Akun'}
      subtitle={isEdit ? `Username ${initial.username} tidak bisa diubah.` : 'Akun baru langsung aktif.'}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Simpan Perubahan' : 'Buat Akun'}
      aside={(
        <InfoCard title="Aturan akun">
          <p>Role menentukan menu dan tombol yang muncul. Akun tanpa role bisa login, tapi tidak bisa membuka modul apa pun.</p>
          <p>super_admin hanya memantau dan mengelola akun, jadi tidak bisa digabung dengan role lain.</p>
          <p>Role dan status akun sendiri tidak bisa diubah — minta super_admin lain.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username" htmlFor="username" required={!isEdit} error={errors.username}>
          <input id="username" value={form.username} disabled={isEdit} onChange={(event) => update('username', event.target.value)} maxLength={50} autoComplete="off" className="input-control font-mono text-sm disabled:bg-slate-100" />
        </Field>
        <Field label="Nama Lengkap" htmlFor="fullName" required error={errors.fullName}>
          <input id="fullName" value={form.fullName} onChange={(event) => update('fullName', event.target.value)} maxLength={150} className="input-control text-sm" />
        </Field>
        <Field label="Email" htmlFor="email" required error={errors.email}>
          <input id="email" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} maxLength={150} autoComplete="off" className="input-control text-sm" />
        </Field>
        <Field label={isEdit ? 'Password Baru' : 'Password'} htmlFor="password" required={!isEdit} error={errors.password} hint={isEdit ? 'Kosongkan bila tidak diganti.' : 'Minimal 8 karakter. Sampaikan ke pemilik akun lewat jalur pribadi.'}>
          <input id="password" type="password" value={form.password} onChange={(event) => update('password', event.target.value)} autoComplete="new-password" className="input-control text-sm" />
        </Field>
      </div>

      <SectionDivider>Role</SectionDivider>
      {isSelf && <p className="text-xs text-amber-700">Ini akun Anda sendiri, jadi role dan statusnya tidak bisa diubah di sini.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((role) => (
          <label key={role.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${roleIds.includes(role.id) ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 hover:bg-slate-50'} ${isSelf || !role.isActive ? 'cursor-not-allowed opacity-60' : ''}`}>
            <input type="checkbox" checked={roleIds.includes(role.id)} disabled={isSelf || !role.isActive} onChange={() => toggleRole(role)} className="mt-0.5 accent-brand-700" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">{role.name}</span>
              <span className="block font-mono text-[11px] text-slate-500">{role.code}{role.isActive ? '' : ' · nonaktif'}</span>
            </span>
          </label>
        ))}
      </div>

      {employees && (
        <>
          <SectionDivider>Karyawan Terkait</SectionDivider>
          <Field label="Akun ini milik karyawan" htmlFor="employeeId" hint="Opsional. Akun sistem/demo tidak wajib karyawan; karyawan yang sudah punya akun tidak muncul.">
            <select id="employeeId" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="input-control text-sm">
              <option value="">- Tidak ditautkan -</option>
              {employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.fullName}{employee.isActive ? '' : ' (keluar)'}</option>)}
            </select>
          </Field>
        </>
      )}

      {isEdit && !isSelf && (
        <>
          <SectionDivider>Status</SectionDivider>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(event) => update('isActive', event.target.checked)} className="accent-brand-700" />
            <span><b>Akun aktif.</b> Hilangkan centang untuk menonaktifkan: akun tidak bisa login, dokumen buatannya tetap ada.</span>
          </label>
        </>
      )}
    </FormPage>
  );
}

/** Tanpa `userId` = akun baru; dengan `userId` = kelola akun yang ada. */
export default function AccountFormPage({ userId, onCancel, onSaved }) {
  const { data, error } = useRecord(async () => {
    // Tautan karyawan hanya untuk pemegang user:update yang bisa membaca master karyawan
    const canLink = hasPermission('user:update') && hasPermission('employee:read');
    const [roles, user, employees] = await Promise.all([listRoles(), userId ? getUser(userId) : Promise.resolve(null), canLink ? listEmployeeOptions() : Promise.resolve(null)]);
    return { roles, user, employees };
  }, userId || 'new');
  if (error) return <EmptyPanel icon="🔎" title="Akun tidak bisa dimuat">{error}</EmptyPanel>;
  if (!data) return <LoadingPanel>Memuat akun...</LoadingPanel>;
  return <AccountForm initial={data.user} roles={data.roles} employees={data.employees} onCancel={onCancel} onSaved={onSaved} />;
}
