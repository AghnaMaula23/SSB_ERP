import { useEffect, useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../components/ProjectUi.jsx';
import { addPoolItem, getPool } from '../services/projectService.js';
import { fieldErrorsFrom } from '../utils/projectFormat.js';
import { getEquipmentTypes, getItems } from '../../../alat/services/alatService.js';

/** Tambah item ke equipment pool (permission equipment-pool:update). */
export default function PoolItemFormPage({ project, poolId, onCancel, onSaved }) {
  const [pool, setPool] = useState(null);
  const [types, setTypes] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [unitState, setUnitState] = useState({ typeId: '', units: [], error: '' });
  const [form, setForm] = useState({ equipmentTypeId: '', equipmentItemId: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPool(poolId), getEquipmentTypes()])
      .then(([poolData, typeRows]) => {
        if (cancelled) return;
        setPool(poolData);
        setTypes(typeRows || []);
      })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [poolId]);

  // Unit operational sesuai tipe yang dipilih; dimuat ulang tiap tipe berganti.
  useEffect(() => {
    if (!form.equipmentTypeId) return undefined;
    let cancelled = false;
    getItems({ typeId: form.equipmentTypeId, status: 'operational', limit: 100 })
      .then((result) => { if (!cancelled) setUnitState({ typeId: form.equipmentTypeId, units: result.data || [], error: '' }); })
      .catch((error) => { if (!cancelled) setUnitState({ typeId: form.equipmentTypeId, units: [], error: error.message }); });
    return () => { cancelled = true; };
  }, [form.equipmentTypeId]);

  const unitsLoading = Boolean(form.equipmentTypeId) && unitState.typeId !== form.equipmentTypeId;

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value, ...(name === 'equipmentTypeId' && { equipmentItemId: '' }) }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.equipmentTypeId) nextErrors.equipmentTypeId = 'Pilih jenis alat.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await addPoolItem(poolId, form));
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  if (loadError) return <EmptyPanel icon="⚠️" title="Pool tidak bisa dibuka">{loadError}</EmptyPanel>;
  if (!pool || !types) return <LoadingPanel>Memuat data pool...</LoadingPanel>;
  if (pool.constructionProjectId !== project.id) return <EmptyPanel icon="🔎" title="Pool bukan milik project ini" />;

  return (
    <FormPage
      breadcrumb={[
        { label: 'Project', href: '#/admin/projects' },
        { label: project.projectName, href: `#/admin/projects/${project.id}` },
        { label: 'Equipment Pool', href: `#/admin/projects/${project.id}/pool` },
        { label: pool.poolCode },
      ]}
      icon="🧰"
      title="Tambah Item Pool"
      subtitle={`Masukkan alat ke ${pool.poolCode}`}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Simpan Item"
      footerNote="Item baru langsung berstatus Available."
      aside={(
        <InfoCard title="Unit fisik">
          <p>Unit boleh dikosongkan dulu dan diikat belakangan dari halaman Equipment Pool.</p>
          <p>Satu item = satu unit. Butuh 3 unit? Tambahkan 3 item.</p>
          <p>Hanya unit operational yang tidak sedang terikat pool aktif lain yang bisa dipilih — satu unit tidak boleh berada di dua pool sekaligus.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>

      <Field label="Jenis Alat" htmlFor="equipmentTypeId" required error={errors.equipmentTypeId}>
        <select id="equipmentTypeId" name="equipmentTypeId" value={form.equipmentTypeId} onChange={update} className="input-control text-sm">
          <option value="">- Pilih jenis alat -</option>
          {types.map((type) => <option key={type.id} value={type.id}>{type.typeName}{type.typeCode ? ` (${type.typeCode})` : ''}</option>)}
        </select>
      </Field>

      <Field label="Unit Alat" htmlFor="equipmentItemId" error={errors.equipmentItemId || unitState.error} hint="Opsional — bisa diikat nanti.">
        <select id="equipmentItemId" name="equipmentItemId" value={form.equipmentItemId} onChange={update} disabled={!form.equipmentTypeId || unitsLoading} className="input-control text-sm disabled:bg-slate-100">
          <option value="">{!form.equipmentTypeId ? 'Pilih jenis alat dulu' : unitsLoading ? 'Memuat unit...' : 'Belum ditentukan'}</option>
          {!unitsLoading && unitState.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.itemCode} · {unit.merk} {unit.typeModel !== '-' ? unit.typeModel : ''}</option>)}
        </select>
      </Field>
    </FormPage>
  );
}
