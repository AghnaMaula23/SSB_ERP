import { useEffect, useRef, useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../project/components/FormPage.jsx';
import { EmptyPanel, LoadingPanel, MockBanner } from '../../project/components/ProjectUi.jsx';
import { fieldErrorsFrom } from '../../project/utils/projectFormat.js';
import { ACCEPTED_TYPES, MAX_FILE_SIZE, getFolder, uploadFile } from '../services/fileStore.js';
import { FILE_CATEGORIES, fileKind, fileTypeError, formatBytes } from '../utils/filesFormat.js';

// Tebak kategori dari nama berkas supaya isian awalnya masuk akal.
const guessCategory = (name) => {
  const lower = name.toLowerCase();
  if (/laporan|harian|daily/.test(lower)) return 'Laporan Harian';
  if (/\.dwg$|gambar|drawing/.test(lower)) return 'Gambar Teknik';
  if (/sertifikat|certificate/.test(lower)) return 'Sertifikat';
  if (/kontrak|contract|spk/.test(lower)) return 'Kontrak';
  if (/invoice|faktur|tagihan/.test(lower)) return 'Invoice';
  if (/\.(jpe?g|png)$/.test(lower)) return 'Foto Lapangan';
  return 'Lainnya';
};

const prettyName = (fileName) => fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

/** Upload satu berkas ke folder — halaman, bukan modal. */
export default function UploadPage({ folderId, onCancel, onSaved }) {
  const [folder, setFolder] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'Lainnya', description: '', tags: [] });
  const [tagDraft, setTagDraft] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getFolder(folderId)
      .then((row) => { if (!cancelled) setFolder(row); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [folderId]);

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
    setForm((current) => ({ ...current, name: current.name || prettyName(picked.name), category: current.category === 'Lainnya' ? guessCategory(picked.name) : current.category }));
    setErrors((current) => ({ ...current, file: undefined }));
  };

  const commitTag = (text) => {
    const tag = text.trim();
    if (tag) setForm((current) => (current.tags.includes(tag) || current.tags.length >= 8 ? current : { ...current, tags: [...current.tags, tag] }));
    setTagDraft('');
  };
  const addTag = () => commitTag(tagDraft);

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
      onSaved(await uploadFile(folderId, { ...form, tags: tagDraft.trim() ? [...form.tags, tagDraft.trim()] : form.tags }, file));
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.name === 'QuotaExceededError' ? 'Penyimpanan browser penuh. Hapus beberapa berkas lalu coba lagi.' : error.message);
      setBusy(false);
    }
  };

  if (loadError) return <EmptyPanel icon="🔎" title="Folder tidak ditemukan">{loadError}</EmptyPanel>;
  if (!folder) return <LoadingPanel>Memuat folder...</LoadingPanel>;
  if (folder.archived) {
    return <EmptyPanel icon="🗄️" title="Folder diarsipkan" action={<a href={`#/admin/files/${folder.id}`} className="btn btn-secondary text-xs">← Kembali</a>}>Aktifkan kembali folder dari menu ⋮ di daftar folder sebelum mengunggah.</EmptyPanel>;
  }

  const kind = file ? fileKind({ fileName: file.name, mimeType: file.type }) : null;

  return (
    <FormPage
      breadcrumb={[{ label: 'Files', href: '#/admin/files' }, { label: folder.name, href: `#/admin/files/${folder.id}` }, { label: 'Upload' }]}
      icon="⬆"
      title="Upload Berkas Baru"
      subtitle={`Ke folder ${folder.name} · ${folder.projectCode}`}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Upload Sekarang"
      footerNote="PDF, JPG, PNG, WebP, DWG, XLSX, DOCX · maks. 50 MB"
      aside={(
        <InfoCard title="Tips">
          <p>Nama dokumen & kategori terisi otomatis dari nama berkas — ubah bila perlu.</p>
          <p>Surat jalan & bukti penerimaan tidak perlu diunggah — sudah tampil otomatis di folder sistem proyek.</p>
          <p>Tag membantu pencarian, misalnya lokasi (<i>Jakarta-Pusat</i>) atau revisi (<i>Rev-2</i>). Tekan Enter atau koma untuk menambah.</p>
        </InfoCard>
      )}
    >
      <MockBanner>Berkas disimpan di browser ini (IndexedDB) sampai backend penyimpanan tersedia.</MockBanner>
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
            dragging ? 'border-teal-500 bg-teal-50' : errors.file ? 'border-red-300 bg-red-50/40' : 'border-slate-300 bg-slate-50 hover:border-teal-400 hover:bg-teal-50/40'
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
                <span className="mt-1 block text-[11px] font-semibold text-teal-700">Klik untuk mengganti berkas</span>
              </span>
            </div>
          ) : (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-2xl" aria-hidden="true">☁️</span>
              <p className="mt-3 text-sm font-bold text-slate-900">Pilih file atau tarik ke sini</p>
              <p className="mt-0.5 text-xs text-slate-500">PDF, JPG, PNG, WebP, DWG, XLSX, DOCX (Maks. 50MB)</p>
            </>
          )}
          <input ref={inputRef} type="file" accept={ACCEPTED_TYPES} className="sr-only" onChange={(event) => pickFile(event.target.files?.[0])} aria-label="Pilih berkas" />
        </div>
        {errors.file && <p className="mt-1 text-[11px] font-medium text-red-600">{errors.file}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Nama Dokumen" htmlFor="docName" required error={errors.name}>
          <input id="docName" value={form.name} onChange={(event) => { setForm((current) => ({ ...current, name: event.target.value })); setErrors((current) => ({ ...current, name: undefined })); }} maxLength={150} className="input-control text-sm" placeholder="Technical Drawing" />
        </Field>
        <Field label="Kategori" htmlFor="docCategory" required>
          <select id="docCategory" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="input-control text-sm">
            {FILE_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Deskripsi" htmlFor="docDescription">
        <textarea id="docDescription" rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={500} className="input-control h-auto resize-y text-sm" placeholder="Masukkan deskripsi berkas..." />
      </Field>

      <Field label="Tags" htmlFor="docTags">
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus-within:border-teal-600 focus-within:ring-3 focus-within:ring-teal-600/15">
          {form.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
              {tag}
              <button type="button" onClick={() => setForm((current) => ({ ...current, tags: current.tags.filter((item) => item !== tag) }))} className="text-sky-600 hover:text-sky-900" aria-label={`Hapus tag ${tag}`}>✕</button>
            </span>
          ))}
          <input
            id="docTags"
            value={tagDraft}
            onChange={(event) => (event.target.value.includes(',') ? commitTag(event.target.value.replace(/,/g, '')) : setTagDraft(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); addTag(); }
              if (event.key === 'Backspace' && !tagDraft && form.tags.length) setForm((current) => ({ ...current, tags: current.tags.slice(0, -1) }));
            }}
            onBlur={addTag}
            maxLength={30}
            className="min-w-24 flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none"
            placeholder={form.tags.length ? '' : 'Tambah tag...'}
          />
        </div>
      </Field>
    </FormPage>
  );
}
