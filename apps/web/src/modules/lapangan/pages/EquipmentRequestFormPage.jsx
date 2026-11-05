import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../admin/project/components/FormPage.jsx';
import { todayIso } from '../../admin/project/utils/projectFormat.js';
import { StageSelect } from '../components/FieldUi.jsx';
import { useActiveStages, useRecord } from '../hooks/useFieldData.js';
import { createEquipmentRequest, listEquipmentTypes } from '../services/fieldService.js';

const newRow = () => ({ key: crypto.randomUUID(), equipmentTypeId: '', requestedQuantity: '1', estimatedWorkhours: '', itemNotes: '' });

/** Pengajuan menyebut jenis alat saja: memilih unit fisik wewenang Divisi Alat. */
export default function EquipmentRequestFormPage({ onCancel, onSaved }) {
  const { stages, error: stageError } = useActiveStages();
  const { data: types, error: typeError } = useRecord(listEquipmentTypes, 'types');
  const [subProjectId, setSubProjectId] = useState('');
  const [neededDate, setNeededDate] = useState('');
  const [locationDetail, setLocationDetail] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [rows, setRows] = useState([newRow()]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const typeList = Array.isArray(types) ? types : types?.data || [];
  const setRow = (key, patch) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!subProjectId) next.subProjectId = 'Pilih tahapan.';
    if (rows.some((row) => !row.equipmentTypeId || !(Number(row.requestedQuantity) >= 1 && Number(row.requestedQuantity) <= 100))) next.items = 'Setiap baris wajib punya jenis alat dan jumlah 1–100.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFormError('');
    try {
      onSaved(await createEquipmentRequest({
        subProjectId: Number(subProjectId),
        requestDate: todayIso(),
        ...(neededDate && { neededDate }),
        ...(locationDetail.trim() && { locationDetail: locationDetail.trim() }),
        ...(requestNotes.trim() && { requestNotes: requestNotes.trim() }),
        items: rows.map((row) => ({
          equipmentTypeId: Number(row.equipmentTypeId),
          requestedQuantity: Number(row.requestedQuantity),
          ...(row.estimatedWorkhours !== '' && { estimatedWorkhours: Number(row.estimatedWorkhours) }),
          ...(row.itemNotes.trim() && { itemNotes: row.itemNotes.trim() }),
        })),
      }));
    } catch (error) {
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={[{ label: 'Request Alat', href: '#/lapangan/alat' }, { label: 'Ajukan' }]}
      icon="🚜"
      title="Ajukan Request Alat"
      subtitle="Hanya untuk tahapan yang sedang aktif."
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Kirim ke Admin"
      aside={(
        <InfoCard title="Alur">
          <p>Admin meneruskan ke Divisi Alat, lalu Divisi Alat memutuskan jumlah yang dipenuhi.</p>
          <p>Unit yang dialokasikan muncul di halaman Alat pada tahapan, tempat Anda mengonfirmasi penerimaannya.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError || stageError || typeError}</FormError>
      <Field label="Tahapan" htmlFor="subProjectId" required error={errors.subProjectId}>
        <StageSelect stages={stages} value={subProjectId} onChange={setSubProjectId} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dibutuhkan Tanggal" htmlFor="neededDate">
          <input id="neededDate" type="date" min={todayIso()} value={neededDate} onChange={(event) => setNeededDate(event.target.value)} className="input-control text-sm" />
        </Field>
        <Field label="Detail Lokasi" htmlFor="locationDetail">
          <input id="locationDetail" value={locationDetail} onChange={(event) => setLocationDetail(event.target.value)} maxLength={200} className="input-control text-sm" placeholder="Contoh: STA 12+300" />
        </Field>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Alat<span className="ml-0.5 text-red-500">*</span></p>
        {errors.items && <p className="mt-1 text-[11px] font-medium text-red-600">{errors.items}</p>}
        <div className="mt-2 space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_minmax(0,1fr)_2rem]">
              <select aria-label="Jenis alat" value={row.equipmentTypeId} onChange={(event) => setRow(row.key, { equipmentTypeId: event.target.value })} className="input-control h-9 text-xs">
                <option value="">- Pilih jenis alat -</option>
                {typeList.map((type) => <option key={type.id} value={type.id}>{type.typeName}</option>)}
              </select>
              <input aria-label="Jumlah" type="number" min="1" max="100" value={row.requestedQuantity} onChange={(event) => setRow(row.key, { requestedQuantity: event.target.value })} className="input-control h-9 font-mono text-xs" />
              <input aria-label="Perkiraan jam" type="number" min="0" step="any" value={row.estimatedWorkhours} onChange={(event) => setRow(row.key, { estimatedWorkhours: event.target.value })} className="input-control h-9 font-mono text-xs" placeholder="Est. jam" />
              <input aria-label="Catatan alat" value={row.itemNotes} onChange={(event) => setRow(row.key, { itemNotes: event.target.value })} maxLength={500} className="input-control h-9 text-xs" placeholder="Catatan (opsional)" />
              <button type="button" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} className="text-sm font-bold text-slate-400 hover:text-red-600 disabled:opacity-30" aria-label="Hapus baris">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows((current) => [...current, newRow()])} className="btn btn-secondary mt-2 text-xs">+ Tambah Alat</button>
      </div>
      <Field label="Catatan" htmlFor="requestNotes">
        <input id="requestNotes" value={requestNotes} onChange={(event) => setRequestNotes(event.target.value)} maxLength={500} className="input-control text-sm" placeholder="Opsional" />
      </Field>
    </FormPage>
  );
}
