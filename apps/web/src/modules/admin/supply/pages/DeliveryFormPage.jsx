import { useEffect, useState } from 'react';
import FormPage, { Field, FormError, InfoCard, SectionDivider } from '../../project/components/FormPage.jsx';
import { EmptyPanel, LoadingPanel, MockBanner } from '../../project/components/ProjectUi.jsx';
import { fieldErrorsFrom, todayIso } from '../../project/utils/projectFormat.js';
import { MATERIALS, VEHICLE_TYPES, createDelivery, getDelivery, listDeliveries, suggestNoteNo, updateDelivery } from '../services/deliveryMockService.js';

const emptyForm = {
  deliveryDate: todayIso(),
  deliveryNoteNo: '',
  vehicleType: VEHICLE_TYPES[0],
  plateNumber: '',
  driverName: '',
  material: MATERIALS[0],
  originLocation: '',
  destinationLocation: '',
  volume: '',
  notes: '',
};

/** Input / ubah satu ritase pengiriman — DATA CONTOH. */
export default function DeliveryFormPage({ project, deliveryId, onCancel, onSaved }) {
  const isEdit = Boolean(deliveryId);
  const [form, setForm] = useState(emptyForm);
  const [history, setHistory] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Riwayat dipakai untuk saran isian (nopol, driver, lokasi) dan auto-isi
    // driver/tipe kendaraan saat nopol yang sudah dikenal dipilih.
    Promise.all([
      listDeliveries(project.id),
      isEdit ? getDelivery(project.id, deliveryId) : suggestNoteNo(project.id),
    ])
      .then(([rows, current]) => {
        if (cancelled) return;
        setHistory(rows);
        if (isEdit) {
          setForm({ ...emptyForm, ...current, volume: String(current.volume) });
        } else {
          const last = rows[rows.length - 1];
          setForm((value) => ({
            ...value,
            deliveryNoteNo: current,
            originLocation: last?.originLocation || '',
            destinationLocation: last?.destinationLocation || project.location || '',
          }));
        }
        setLoadState('ready');
      })
      .catch((error) => { if (!cancelled) { setFormError(error.message); setLoadState('error'); } });
    return () => { cancelled = true; };
  }, [deliveryId, isEdit, project.id, project.location]);

  const distinct = (key) => [...new Set(history.map((row) => row[key]).filter(Boolean))];

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === 'plateNumber') {
        const known = history.find((row) => row.plateNumber === value.trim().toUpperCase());
        if (known) Object.assign(next, { driverName: current.driverName || known.driverName, vehicleType: known.vehicleType });
      }
      return next;
    });
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.deliveryDate) nextErrors.deliveryDate = 'Tanggal wajib diisi.';
    else if (form.deliveryDate > todayIso()) nextErrors.deliveryDate = 'Tanggal tidak boleh di masa depan.';
    if (!form.deliveryNoteNo.trim()) nextErrors.deliveryNoteNo = 'Nomor surat jalan wajib diisi.';
    if (!form.plateNumber.trim()) nextErrors.plateNumber = 'Nomor polisi wajib diisi.';
    if (!form.driverName.trim()) nextErrors.driverName = 'Nama driver wajib diisi.';
    if (!form.originLocation.trim()) nextErrors.originLocation = 'Lokasi gali wajib diisi.';
    if (!form.destinationLocation.trim()) nextErrors.destinationLocation = 'Lokasi bongkar wajib diisi.';
    if (!(Number(form.volume) > 0)) nextErrors.volume = 'Volume harus lebih dari 0.';
    else if (Number(form.volume) > 60) nextErrors.volume = 'Volume satu ritase tidak wajar (> 60 m³). Periksa kembali.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(isEdit ? await updateDelivery(project.id, deliveryId, form) : await createDelivery(project.id, form));
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
      setBusy(false);
    }
  };

  if (loadState === 'loading') return <LoadingPanel>Memuat form ritase...</LoadingPanel>;
  if (loadState === 'error') return <EmptyPanel icon="🔎" title="Ritase tidak ditemukan">{formError}</EmptyPanel>;

  return (
    <FormPage
      breadcrumb={[{ label: 'Supply', href: '#/admin/supply' }, { label: project.projectName, href: `#/admin/supply/${project.id}` }, { label: isEdit ? 'Ubah Ritase' : 'Input Ritase' }]}
      icon="🚛"
      title={isEdit ? `Ubah Ritase ${form.deliveryNoteNo}` : 'Input Ritase'}
      subtitle={`${project.clientName ? `${project.clientName} · ` : ''}${project.projectName}`}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Simpan Perubahan' : 'Simpan Ritase'}
      footerNote="Satu surat jalan = satu ritase."
      aside={(
        <InfoCard title="Tips input">
          <p>Nomor polisi yang pernah dicatat akan mengisi tipe kendaraan dan driver secara otomatis.</p>
          <p>Volume dicatat dalam m³ sesuai standar proyek.</p>
        </InfoCard>
      )}
    >
      <MockBanner>Ritase belum tersambung API.</MockBanner>
      <FormError>{formError}</FormError>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal" htmlFor="deliveryDate" required error={errors.deliveryDate}>
          <input id="deliveryDate" name="deliveryDate" type="date" max={todayIso()} value={form.deliveryDate} onChange={update} className="input-control text-sm" />
        </Field>
        <Field label="No. Surat Jalan" htmlFor="deliveryNoteNo" required error={errors.deliveryNoteNo}>
          <input id="deliveryNoteNo" name="deliveryNoteNo" value={form.deliveryNoteNo} onChange={update} maxLength={50} className="input-control font-mono text-sm uppercase" />
        </Field>
      </div>

      <SectionDivider>Kendaraan</SectionDivider>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nomor Polisi" htmlFor="plateNumber" required error={errors.plateNumber}>
          <input id="plateNumber" name="plateNumber" list="plate-options" value={form.plateNumber} onChange={update} maxLength={15} className="input-control font-mono text-sm uppercase" placeholder="B 9021 WKA" autoFocus={!isEdit} />
          <datalist id="plate-options">{distinct('plateNumber').map((value) => <option key={value} value={value} />)}</datalist>
        </Field>
        <Field label="Type Kendaraan" htmlFor="vehicleType" required>
          <select id="vehicleType" name="vehicleType" value={form.vehicleType} onChange={update} className="input-control text-sm">
            {VEHICLE_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
            {!VEHICLE_TYPES.includes(form.vehicleType) && <option value={form.vehicleType}>{form.vehicleType}</option>}
          </select>
        </Field>
        <Field label="Driver" htmlFor="driverName" required error={errors.driverName}>
          <input id="driverName" name="driverName" list="driver-options" value={form.driverName} onChange={update} maxLength={100} className="input-control text-sm" />
          <datalist id="driver-options">{distinct('driverName').map((value) => <option key={value} value={value} />)}</datalist>
        </Field>
      </div>

      <SectionDivider>Muatan</SectionDivider>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field label="Material" htmlFor="material" required>
          <select id="material" name="material" value={form.material} onChange={update} className="input-control text-sm">
            {MATERIALS.map((option) => <option key={option} value={option}>{option}</option>)}
            {!MATERIALS.includes(form.material) && <option value={form.material}>{form.material}</option>}
          </select>
        </Field>
        <Field label="Volume (m³)" htmlFor="volume" required error={errors.volume}>
          <input id="volume" name="volume" type="number" min="0" step="0.01" inputMode="decimal" value={form.volume} onChange={update} className="input-control font-mono text-sm" placeholder="0.00" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Gali (Lok. Tambang)" htmlFor="originLocation" required error={errors.originLocation}>
          <input id="originLocation" name="originLocation" list="origin-options" value={form.originLocation} onChange={update} maxLength={150} className="input-control text-sm" placeholder="Quarry Arjawinangun" />
          <datalist id="origin-options">{distinct('originLocation').map((value) => <option key={value} value={value} />)}</datalist>
        </Field>
        <Field label="Bongkar (Lok. Project)" htmlFor="destinationLocation" required error={errors.destinationLocation}>
          <input id="destinationLocation" name="destinationLocation" list="destination-options" value={form.destinationLocation} onChange={update} maxLength={150} className="input-control text-sm" placeholder="STA 12+400 Toll Subang" />
          <datalist id="destination-options">{distinct('destinationLocation').map((value) => <option key={value} value={value} />)}</datalist>
        </Field>
      </div>
      <Field label="Catatan" htmlFor="notes">
        <input id="notes" name="notes" value={form.notes} onChange={update} maxLength={200} className="input-control text-sm" placeholder="Opsional" />
      </Field>
    </FormPage>
  );
}
