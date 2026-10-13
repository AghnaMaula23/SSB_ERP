import { useEffect, useState } from 'react';
import FormPage, { FormError, InfoCard } from '../components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../components/ProjectUi.jsx';
import { createAllocation, listProjectPoolsWithItems } from '../services/projectService.js';
import { stageCrumbs, subProjectTypeLabel } from '../utils/projectFormat.js';
import { equipmentStatusLabel } from '../../../alat/services/alatService.js';

/**
 * Alokasikan satu unit dari equipment pool project ke tahapan ini. Yang bisa
 * dipilih hanya pool item `available` yang sudah terikat unit fisik dan
 * pool-nya masih hidup — syarat yang sama dengan backend.
 */
export default function AllocationFormPage({ project, stage, onCancel, onSaved }) {
  const [pools, setPools] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listProjectPoolsWithItems(project.id)
      .then((rows) => { if (!cancelled) setPools(rows); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [project.id]);

  const candidates = (pools || [])
    .filter((pool) => ['draft', 'active'].includes(pool.status))
    .flatMap((pool) => (pool.items || []).map((item) => ({ ...item, poolCode: pool.poolCode })))
    .filter((item) => item.status === 'available');
  const ready = candidates.filter((item) => item.equipmentItemId);
  const unbound = candidates.length - ready.length;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selected) {
      setFormError('Pilih satu unit alat yang akan dialokasikan.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      onSaved(await createAllocation(stage.id, selected));
    } catch (error) {
      setFormError(error.message);
      setBusy(false);
    }
  };

  const poolHref = `#/admin/projects/${project.id}/pool`;

  if (stage.status !== 'active') {
    return (
      <EmptyPanel icon="⏸️" title="Tahapan belum aktif" action={<a href={`#/admin/projects/${project.id}`} className="btn btn-secondary text-xs">← Ke ringkasan project</a>}>
        Alat hanya bisa dialokasikan ke tahapan berstatus Active.
      </EmptyPanel>
    );
  }
  if (loadError) return <EmptyPanel icon="⚠️" title="Equipment pool tidak bisa dimuat">{loadError}</EmptyPanel>;
  if (!pools) return <LoadingPanel>Memuat equipment pool project...</LoadingPanel>;

  return (
    <FormPage
      breadcrumb={stageCrumbs(project, stage, { label: 'Alat', href: `#/admin/projects/${project.id}/sub/${stage.id}/alat` }, { label: 'Alokasikan' })}
      icon="🚜"
      title="Alokasikan Alat"
      subtitle={`Tempatkan unit dari equipment pool ke tahapan ${subProjectTypeLabel(stage.subProjectType)}`}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Alokasikan"
      footerNote={`${ready.length} unit siap dialokasikan`}
      aside={(
        <InfoCard title="Alur alokasi">
          <p>1. Divisi Alat memasukkan unit ke <a href={poolHref} className="font-semibold text-teal-700 hover:underline">Equipment Pool</a> project.</p>
          <p>2. Unit dialokasikan ke tahapan di halaman ini.</p>
          <p>3. Lapangan menekan <b>Terima</b> saat unit sampai di lokasi, lalu jam kerjanya dicatat di Timesheet.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>

      {ready.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-700">Tidak ada unit yang siap dialokasikan</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            {unbound > 0
              ? `${unbound} item pool belum terikat unit fisik. Ikat unitnya dulu di halaman Equipment Pool.`
              : 'Semua unit di pool project sedang dipakai, atau pool belum berisi alat.'}
          </p>
          <a href={poolHref} className="btn btn-secondary mt-4 text-xs">Buka Equipment Pool →</a>
        </div>
      ) : (
        <fieldset>
          <legend className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Pilih Unit <span className="text-red-500">*</span></legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ready.map((item) => {
              const checked = String(item.id) === String(selected);
              return (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${checked ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-600/15' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  <input type="radio" name="poolItem" value={item.id} checked={checked} onChange={() => { setSelected(String(item.id)); setFormError(''); }} className="mt-1 accent-teal-700" />
                  <span className="min-w-0">
                    <span className="block font-mono text-sm font-bold text-teal-700">{item.equipmentItem?.assetCode}</span>
                    <span className="block text-xs font-semibold text-slate-800">{item.equipmentType?.typeName}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">{item.poolCode} · {equipmentStatusLabel(item.equipmentItem?.currentStatus)}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {unbound > 0 && <p className="mt-2 text-[11px] text-slate-400">{unbound} item pool lain belum terikat unit dan tidak ditampilkan.</p>}
        </fieldset>
      )}
    </FormPage>
  );
}
