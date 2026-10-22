import { useEffect, useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../project/components/FormPage.jsx';
import { MockBanner } from '../../project/components/ProjectUi.jsx';
import { fieldErrorsFrom } from '../../project/utils/projectFormat.js';
import { createFolder } from '../services/fileStore.js';
import { listProjectSources } from '../services/projectSources.js';
import { PROJECT_KINDS } from '../utils/filesFormat.js';

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, index) => thisYear + 1 - index);

/** "Buat Folder Baru" — folder selalu terikat ke kode proyek yang terdaftar. */
export default function FolderFormPage({ onCancel, onSaved }) {
  const [sources, setSources] = useState(null);
  const [sourceErrors, setSourceErrors] = useState([]);
  const [form, setForm] = useState({ projectKey: '', name: '', year: String(thisYear) });
  const [nameTouched, setNameTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listProjectSources().then(({ projects, errors: loadErrors }) => {
      if (cancelled) return;
      setSources(projects);
      setSourceErrors(loadErrors);
    });
    return () => { cancelled = true; };
  }, []);

  const project = sources?.find((row) => row.key === form.projectKey);

  const chooseProject = (key) => {
    const target = sources.find((row) => row.key === key);
    setForm((current) => ({
      ...current,
      projectKey: key,
      // Nama & tahun mengikuti proyek selama belum diubah sendiri.
      name: nameTouched ? current.name : target?.projectName || '',
      year: target ? String(target.year) : current.year,
    }));
    setErrors({});
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!project) nextErrors.projectKey = 'Pilih kode proyek.';
    if (!form.name.trim()) nextErrors.name = 'Nama folder wajib diisi.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    setFormError('');
    try {
      onSaved(await createFolder(form, project));
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  const grouped = Object.keys(PROJECT_KINDS).map((kind) => ({ kind, rows: (sources || []).filter((row) => row.kind === kind) })).filter((group) => group.rows.length);

  return (
    <FormPage
      breadcrumb={[{ label: 'Files', href: '#/admin/files' }, { label: 'Folder Baru' }]}
      icon="🗂"
      title="Buat Folder Baru"
      subtitle="Direktori dokumen untuk satu proyek"
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Simpan Folder"
      footerNote={<><span className="text-red-500">*</span> wajib diisi</>}
      aside={(
        <InfoCard title="Tentang folder">
          <p>Kode proyek diambil dari menu Project, Rental, dan Supply — folder selalu terikat ke proyek yang terdaftar.</p>
          <p>Status folder mengikuti status proyeknya: proyek selesai otomatis tampil sebagai arsip.</p>
        </InfoCard>
      )}
    >
      <MockBanner>Folder disimpan di browser ini sampai backend penyimpanan berkas tersedia.</MockBanner>
      <FormError>{formError || (sourceErrors.length ? `Sebagian proyek gagal dimuat: ${sourceErrors.join('; ')}` : '')}</FormError>

      <Field label="Kode Proyek" htmlFor="projectKey" required error={errors.projectKey}>
        <select id="projectKey" value={form.projectKey} onChange={(event) => chooseProject(event.target.value)} disabled={!sources} className="input-control text-sm disabled:bg-slate-100">
          <option value="">{sources ? 'Pilih kode' : 'Memuat proyek...'}</option>
          {grouped.map((group) => (
            <optgroup key={group.kind} label={PROJECT_KINDS[group.kind].label}>
              {group.rows.map((row) => <option key={row.key} value={row.key}>{row.projectCode} — {row.projectName}{row.isDemo ? ' (contoh)' : ''}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field label="Nama Folder" htmlFor="folderName" required error={errors.name} hint="Default: nama proyek.">
          <input id="folderName" value={form.name} onChange={(event) => { setNameTouched(true); setForm((current) => ({ ...current, name: event.target.value })); setErrors({}); }} maxLength={120} className="input-control text-sm" placeholder="Masukkan nama folder..." />
        </Field>
        <Field label="Tahun Proyek" htmlFor="folderYear" required>
          <select id="folderYear" value={form.year} onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))} className="input-control text-sm">
            {[...new Set([...YEARS, Number(form.year)])].sort((a, b) => b - a).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
      </div>

      {project && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <span className="text-xl" aria-hidden="true">{PROJECT_KINDS[project.kind].icon}</span>
          <span>
            <b className="text-slate-900">{project.projectName}</b><br />
            {PROJECT_KINDS[project.kind].label}{project.clientName ? ` · ${project.clientName}` : ''} · status {project.status}
          </span>
        </div>
      )}
    </FormPage>
  );
}
