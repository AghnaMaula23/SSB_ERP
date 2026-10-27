import { useEffect, useRef, useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../project/components/FormPage.jsx';
import { EmptyPanel } from '../../project/components/ProjectUi.jsx';
import { fieldErrorsFrom } from '../../project/utils/projectFormat.js';
import { hasPermission } from '../../../../services/permissions.js';
import { ACCEPTED_TYPES, MAX_FILE_SIZE, flattenFolders, uploadFile } from '../services/projectFiles.js';
import { filesHref } from '../utils/filesRoute.js';
import { fileKind, fileTypeError, formatBytes, projectCrumbs, stageLabel } from '../utils/filesFormat.js';

const prettyName = (fileName) => fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 150);

/** Unggah satu berkas ke folder — form + berkas dalam satu multipart (L4). */
export default function UploadPage({ type, projectId, directory, folderId, onCancel, onSaved }) {
  const folder = flattenFolders(directory).find((row) => row.kind === 'user' && row.id === folderId) || null;
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(hasPermission('project-file:create') ? '' : 'Anda tidak memiliki izin mengunggah berkas (project-file:create).');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // Object URL pratinjau dibebaskan saat berkas diganti atau halaman ditinggal.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const pickFile = (picked) => {
    if (!picked) return;
    const typeError = fileTypeError(picked.name);
    if (typeError) {
      setErrors((current) => ({ ...current, file: typeError }));
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      setErrors((current) => ({ ...current, file: `Ukuran ${formatBytes(picked.size)} melebihi batas 50 MB.` }));
      return;
    }
    setFile(picked);
    setPreviewUrl(fileKind({ fileName: picked.name, mimeType: picked.type }).kind === 'image' ? URL.createObjectURL(picked) : '');
    setForm((current) => ({ ...current, name: current.name || prettyName(picked.name) }));
    setErrors((current) => ({ ...current, file: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!file) nextErrors.file = 'Pilih berkas yang akan diunggah.';
    if (!form.name.trim()) nextErrors.name = 'Nama dokumen wajib diisi.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    setFormError('');
    try {
      onSaved(await uploadFile(folderId, form, file));
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  if (!folder) return <EmptyPanel icon="🔎" title="Folder tidak ditemukan" action={<a href={filesHref.project(type, projectId)} className="btn btn-secondary text-xs">← Kembali ke project</a>} />;

  const kind = file ? fileKind({ fileName: file.name, mimeType: file.type }) : null;

  return (
    <FormPage
      breadcrumb={projectCrumbs(type, directory, { label: folder.name, href: filesHref.folder(type, projectId, folder.id) }, { label: 'Unggah' })}
      icon="⬆"
      title="Unggah Berkas Baru"
      subtitle={`Ke folder ${folder.name} · ${stageLabel(folder.stage)}`}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Unggah Sekarang"
      footerNote="PDF, JPG, PNG, WebP, DWG, XLSX, DOCX · maks. 50 MB"
      aside={(
        <InfoCard title="Tips">
          <p>Nama dokumen terisi otomatis dari nama berkas — ubah bila perlu. Nama unduhan tetap nama berkas aslinya.</p>
          <p>Surat jalan & bukti penerimaan tidak perlu diunggah — sudah tampil otomatis di folder sistem.</p>
          <p>Revisi diunggah sebagai berkas baru; tulis nomor revisi di nama atau deskripsi supaya mudah dicari.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>

      <div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); pickFile(event.dataTransfer.files?.[0]); }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
            dragging ? 'border-brand-500 bg-brand-50' : errors.file ? 'border-red-300 bg-red-50/40' : 'border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40'
          }`}
        >
          {file ? (
            <div className="flex w-full max-w-md items-center gap-4 text-left">
              {previewUrl
                ? <img src={previewUrl} alt="Pratinjau" className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 object-cover" />
                : <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-3xl ${kind.tone}`}>{kind.icon}</span>}
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-900">{file.name}</span>
                <span className="block text-xs text-slate-500">{formatBytes(file.size)} · {file.type || 'tipe tidak dikenal'}</span>
                <span className="mt-1 block text-[11px] font-semibold text-brand-700">Klik untuk mengganti berkas</span>
              </span>
            </div>
          ) : (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-2xl" aria-hidden="true">☁️</span>
              <p className="mt-3 text-sm font-bold text-slate-900">Pilih file atau tarik ke sini</p>
              <p className="mt-0.5 text-xs text-slate-500">PDF, JPG, PNG, WebP, DWG, XLSX, DOCX (Maks. 50MB)</p>
            </>
          )}
          <input ref={inputRef} type="file" accept={ACCEPTED_TYPES} className="sr-only" onChange={(event) => pickFile(event.target.files?.[0])} aria-label="Pilih berkas" />
        </div>
        {errors.file && <p className="mt-1 text-[11px] font-medium text-red-600">{errors.file}</p>}
      </div>

      <Field label="Nama Dokumen" htmlFor="docName" required error={errors.name}>
        <input id="docName" value={form.name} onChange={(event) => { setForm((current) => ({ ...current, name: event.target.value })); setErrors((current) => ({ ...current, name: undefined })); }} maxLength={150} className="input-control text-sm" placeholder="Contoh: Gambar Kerja Rev-2" />
      </Field>

      <Field label="Deskripsi" htmlFor="docDescription" error={errors.description}>
        <textarea id="docDescription" rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={500} className="input-control h-auto resize-y text-sm" placeholder="Opsional — lokasi, revisi, atau catatan singkat." />
      </Field>
    </FormPage>
  );
}
