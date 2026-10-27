import { useEffect, useRef, useState } from 'react';
import FormPage, { Field, FormError, InfoCard, SectionDivider } from '../components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../components/ProjectUi.jsx';
import {
  WORKER_ROLES, WORKER_TYPES, createAssignment, createWorker, getAssignment, getWorker, listAllWorkers, updateAssignment, updateWorker,
} from '../services/workerService.js';
import { fieldErrorsFrom, stageCrumbs, todayIso } from '../utils/projectFormat.js';

const emptyForm = (stage) => ({
  projectWorkerId: '',
  fullName: '', idNumber: '', phone: '', joinedAt: '', defaultRole: '',
  workerType: 'daily', assignedRole: WORKER_ROLES[0], dailyWage: '',
  startDate: stage.contractStartDate && stage.contractStartDate > todayIso() ? stage.contractStartDate : todayIso(),
  endDate: '', notes: '',
});

const IDENTITY_FIELDS = ['fullName', 'idNumber', 'phone', 'joinedAt'];
const identityOf = (person) => ({
  fullName: person?.fullName || '', idNumber: person?.idNumber || '', phone: person?.phone || '',
  joinedAt: person?.joinedAt || '', defaultRole: person?.defaultRole || '',
});

/**
 * Tugaskan pekerja ke tahapan. Orang dipilih dari master pekerja global
 * (POST /api/workers untuk orang baru); upah, jenis, dan periode milik
 * penugasan di tahapan ini (/api/worker-assignments).
 */
export default function WorkerFormPage({ project, stage, workerId, onCancel, onSaved }) {
  const isEdit = Boolean(workerId);
  const [form, setForm] = useState(() => emptyForm(stage));
  const [people, setPeople] = useState([]);
  const [loadState, setLoadState] = useState(isEdit ? 'loading' : 'ready');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  // Identitas master saat form dibuka — hanya dikirim ulang kalau berubah.
  const originalIdentity = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!isEdit) {
      listAllWorkers()
        .then((rows) => { if (!cancelled) setPeople(rows); })
        .catch((error) => { if (!cancelled) setFormError(`Daftar pekerja terdaftar gagal dimuat: ${error.message}`); });
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const row = await getAssignment(workerId);
        const person = await getWorker(row.worker.id);
        if (cancelled) return;
        originalIdentity.current = identityOf(person);
        setForm({
          ...emptyForm(stage),
          projectWorkerId: String(person.id),
          ...identityOf(person),
          workerType: row.workerType, assignedRole: row.role || WORKER_ROLES[0], dailyWage: String(row.dailyWage),
          startDate: row.startDate || '', endDate: row.endDate || '', notes: row.notes || '',
        });
        setLoadState('ready');
      } catch (error) {
        if (!cancelled) { setFormError(error.message); setLoadState('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, stage, workerId]);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  // Memilih orang terdaftar mengisi identitasnya; peran default jadi peran awal di tahapan.
  const pickPerson = (event) => {
    const person = people.find((row) => String(row.id) === event.target.value);
    originalIdentity.current = person ? identityOf(person) : null;
    setForm((current) => ({
      ...current,
      projectWorkerId: event.target.value,
      ...identityOf(person),
      assignedRole: person?.defaultRole || current.assignedRole,
    }));
    setErrors({});
  };

  const identityChanged = () => !originalIdentity.current
    || IDENTITY_FIELDS.some((field) => String(form[field] || '').trim() !== String(originalIdentity.current[field] || '').trim());

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.fullName.trim()) nextErrors.fullName = 'Nama wajib diisi.';
    if (form.idNumber.trim() && !/^\d{16}$/.test(form.idNumber.trim())) nextErrors.idNumber = 'NIK harus 16 digit angka (atau kosongkan).';
    if (form.phone.trim() && !/^[0-9+\-\s]{8,16}$/.test(form.phone.trim())) nextErrors.phone = 'Nomor telepon tidak valid.';
    if (!(Number(form.dailyWage) > 0)) nextErrors.dailyWage = 'Upah harian wajib diisi — kontrak maupun harian dibayar per hari.';
    if (!form.startDate) nextErrors.startDate = 'Tanggal mulai wajib diisi.';
    if (form.startDate && form.endDate && form.startDate > form.endDate) nextErrors.endDate = 'Selesai tidak boleh sebelum mulai.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      let projectWorkerId = form.projectWorkerId;
      if (!projectWorkerId) {
        const created = await createWorker(form);
        projectWorkerId = String(created.id);
        // Simpan id-nya supaya kalau langkah penugasan gagal, kirim ulang tidak
        // mendaftarkan orang yang sama dua kali.
        originalIdentity.current = identityOf(created);
        setForm((current) => ({ ...current, projectWorkerId }));
      } else if (identityChanged()) {
        originalIdentity.current = identityOf(await updateWorker(projectWorkerId, form));
      }
      const saved = isEdit ? await updateAssignment(workerId, form) : await createAssignment(stage.id, projectWorkerId, form);
      onSaved(saved);
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  if (loadState === 'loading') return <LoadingPanel>Memuat pekerja...</LoadingPanel>;
  if (loadState === 'error') return <EmptyPanel icon="🔎" title="Pekerja tidak ditemukan">{formError}</EmptyPanel>;

  const existing = Boolean(form.projectWorkerId);

  return (
    <FormPage
      breadcrumb={stageCrumbs(project, stage, { label: 'Pekerja', href: `#/admin/projects/${project.id}/sub/${stage.id}/pekerja` }, { label: isEdit ? 'Ubah' : 'Tugaskan Pekerja' })}
      icon="👷"
      title={isEdit ? `Ubah ${form.fullName || 'Pekerja'}` : 'Tugaskan Pekerja'}
      subtitle="Identitas orang + kesepakatan kerjanya di tahapan ini"
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Simpan Perubahan' : 'Simpan Penugasan'}
      footerNote={<><span className="text-red-500">*</span> wajib diisi</>}
      aside={(
        <InfoCard title="Kontrak vs Harian">
          <p><b>Kontrak</b> disewa selama tahapan berlangsung; <b>Harian</b> hadir saat dipanggil. Keduanya <b>dibayar harian</b>.</p>
          <p>Upah melekat pada penugasan, jadi orang yang sama boleh beda upah di tahapan lain.</p>
          <p>Untuk mengeluarkan pekerja, isi tanggal <b>Selesai</b> — riwayat log hariannya tetap tersimpan.</p>
          <p>NIK boleh kosong untuk pekerja harian — lebih baik kosong daripada dikarang.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>

      {!isEdit && (
        <Field label="Pekerja Terdaftar" htmlFor="projectWorkerId" error={errors.projectWorkerId} hint="Pilih kalau orangnya sudah terdaftar; kosongkan untuk mendaftarkan orang baru.">
          <select id="projectWorkerId" value={form.projectWorkerId} onChange={pickPerson} className="input-control text-sm">
            <option value="">+ Orang baru</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.workerCode} — {person.fullName}{person.idNumber ? ` · ${person.idNumber}` : ''}</option>)}
          </select>
        </Field>
      )}

      <SectionDivider>Identitas</SectionDivider>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama Lengkap" htmlFor="fullName" required error={errors.fullName}>
          <input id="fullName" name="fullName" value={form.fullName} onChange={update} maxLength={150} className="input-control text-sm" placeholder="Contoh: Dedi Kurniawan" autoFocus={!isEdit && !existing} />
        </Field>
        <Field label="NIK" htmlFor="idNumber" error={errors.idNumber} hint="Opsional, 16 digit.">
          <input id="idNumber" name="idNumber" value={form.idNumber} onChange={update} inputMode="numeric" maxLength={16} className="input-control font-mono text-sm" placeholder="16 digit" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="No. WhatsApp" htmlFor="phone" error={errors.phone}>
          <input id="phone" name="phone" value={form.phone} onChange={update} inputMode="tel" className="input-control text-sm" placeholder="08xxxxxxxxxx" />
        </Field>
        <Field label="Mulai Bekerja dengan SSB" htmlFor="joinedAt" error={errors.joinedAt} hint="Untuk menghitung lama kerja.">
          <input id="joinedAt" name="joinedAt" type="date" value={form.joinedAt} max={todayIso()} onChange={update} className="input-control text-sm" />
        </Field>
      </div>

      <SectionDivider>Penugasan di Tahapan Ini</SectionDivider>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Jenis Pekerja" htmlFor="workerType" required error={errors.workerType} hint={WORKER_TYPES[form.workerType]?.hint}>
          <select id="workerType" name="workerType" value={form.workerType} onChange={update} className="input-control text-sm">
            {Object.entries(WORKER_TYPES).map(([value, type]) => <option key={value} value={value}>{type.label}</option>)}
          </select>
        </Field>
        <Field label="Peran" htmlFor="assignedRole" required error={errors.assignedRole}>
          <select id="assignedRole" name="assignedRole" value={form.assignedRole} onChange={update} className="input-control text-sm">
            {WORKER_ROLES.map((option) => <option key={option} value={option}>{option}</option>)}
            {!WORKER_ROLES.includes(form.assignedRole) && <option value={form.assignedRole}>{form.assignedRole}</option>}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Upah Harian (Rp)" htmlFor="dailyWage" required error={errors.dailyWage}>
          <input id="dailyWage" name="dailyWage" type="number" min="0" step="1000" value={form.dailyWage} onChange={update} className="input-control font-mono text-sm" placeholder="150000" />
        </Field>
        <Field label="Mulai" htmlFor="startDate" required error={errors.startDate}>
          <input id="startDate" name="startDate" type="date" value={form.startDate} onChange={update} className="input-control text-sm" />
        </Field>
        <Field label="Selesai" htmlFor="endDate" error={errors.endDate} hint="Kosongkan selama masih bertugas.">
          <input id="endDate" name="endDate" type="date" value={form.endDate} min={form.startDate || undefined} onChange={update} className="input-control text-sm" />
        </Field>
      </div>
      <Field label="Catatan" htmlFor="notes" error={errors.notes}>
        <input id="notes" name="notes" value={form.notes} onChange={update} maxLength={200} className="input-control text-sm" placeholder="Opsional" />
      </Field>
    </FormPage>
  );
}
