import { useEffect, useState } from 'react';
import { Field } from '../project/components/FormPage.jsx';
import { listProjects } from '../project/services/projectService.js';

/**
 * Pemilih "Proyek" + tampilan "Lokasi" untuk kontrak Supply & Rental.
 *
 * Proyek dipilih dari project konstruksi terdaftar dan lokasinya ikut dari
 * project itu, supaya penamaan seragam dengan modul Project. Backend kontrak
 * menyimpan keduanya sebagai teks (belum ada FK), jadi komponen ini hanya
 * mengembalikan { projectName, location } lewat onChange.
 *
 * `legacyName` = nama tersimpan yang tidak cocok dengan project mana pun;
 * tetap ditawarkan sebagai pilihan supaya tidak hilang saat kontrak diubah.
 */
export default function ProjectSourceField({ projectName, location, legacyName, legacyLocation, error, onChange }) {
  const [sources, setSources] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listProjects({ limit: 100 })
      .then((result) => { if (!cancelled) setSources((result.data || []).filter((row) => row.status !== 'cancelled')); })
      .catch((requestError) => { if (!cancelled) { setSources([]); setLoadError(requestError.message); } });
    return () => { cancelled = true; };
  }, []);

  const selected = sources?.find((row) => row.projectName === projectName);
  const showLegacy = Boolean(sources && legacyName && !sources.some((row) => row.projectName === legacyName));
  const value = selected ? String(selected.id) : showLegacy && projectName === legacyName ? 'legacy' : '';

  const handleChange = (event) => {
    if (event.target.value === 'legacy') return onChange({ projectName: legacyName, location: legacyLocation || '' });
    const source = sources.find((row) => String(row.id) === event.target.value);
    return onChange(source ? { projectName: source.projectName, location: source.location || '' } : { projectName: '', location: '' });
  };

  return (
    <>
      <Field label="Proyek" htmlFor="projectSource" required error={error || loadError}>
        <select id="projectSource" value={value} onChange={handleChange} disabled={!sources} className="input-control text-sm disabled:bg-slate-100">
          <option value="">{sources ? (sources.length ? '- Pilih proyek -' : 'Belum ada project terdaftar') : 'Memuat project...'}</option>
          {showLegacy && <option value="legacy">{legacyName} (nama lama)</option>}
          {(sources || []).map((row) => <option key={row.id} value={row.id}>{row.projectName} · {row.projectCode}</option>)}
        </select>
      </Field>
      <Field label="Lokasi Proyek" htmlFor="projectLocation" hint={selected && !selected.location ? 'Project ini belum punya lokasi — lengkapi di menu Project.' : 'Otomatis dari project yang dipilih.'}>
        <div id="projectLocation" className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-700">
          <span aria-hidden="true" className="text-xs">📍</span>
          <span className={`truncate ${location ? '' : 'text-slate-400'}`}>{location || (projectName ? 'Lokasi belum diisi' : 'Pilih proyek dulu')}</span>
        </div>
      </Field>
    </>
  );
}
