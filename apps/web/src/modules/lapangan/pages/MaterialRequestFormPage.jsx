import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../admin/project/components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../../admin/project/components/ProjectUi.jsx';
import { listActiveMaterialTypes } from '../../admin/project/services/materialStockService.js';
import { listSupplyProjects } from '../../admin/supply/services/supplyService.js';
import { todayIso } from '../../admin/project/utils/projectFormat.js';
import { StageSelect } from '../components/FieldUi.jsx';
import { useActiveStages, useRecord } from '../hooks/useFieldData.js';
import { createMaterialRequest, getMaterialRequest, updateMaterialRequest } from '../services/fieldService.js';
import { stageLabel } from '../utils/fieldFormat.js';

const newRow = () => ({ key: crypto.randomUUID(), materialTypeId: '', requestedQuantity: '', itemNotes: '' });
const fromItem = (item) => ({ key: crypto.randomUUID(), materialTypeId: String(item.materialTypeId), requestedQuantity: String(item.requestedQuantity), itemNotes: item.itemNotes || '' });

/** Satuan milik jenis material (D1): tidak bisa dipilih, tampil di samping kuantitas. */
function MaterialRequestForm({ initial, onCancel, onSaved }) {
  const { stages, error: stageError } = useActiveStages();
  const { data: types, error: typeError } = useRecord(listActiveMaterialTypes, 'types');
  const { data: supplies } = useRecord(() => listSupplyProjects({ status: 'active' }), 'supply');
  const [requestType, setRequestType] = useState(initial?.requestType || 'internal_project');
  const [subProjectId, setSubProjectId] = useState(initial?.subProjectId ? String(initial.subProjectId) : '');
  const [supplyId, setSupplyId] = useState(initial?.externalSupplyProjectId ? String(initial.externalSupplyProjectId) : '');
  const [requestDate, setRequestDate] = useState(initial?.requestDate || todayIso());
  const [neededDate, setNeededDate] = useState(initial?.neededDate || '');
  const [requestNotes, setRequestNotes] = useState(initial?.requestNotes || '');
  const [rows, setRows] = useState(() => (initial ? initial.items.map(fromItem) : [newRow()]));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const setRow = (key, patch) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const unitOf = (row) => types?.find((type) => String(type.id) === row.materialTypeId)?.unit || '';

  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!initial && requestType === 'internal_project' && !subProjectId) next.context = 'Pilih tahapan.';
    if (!initial && requestType === 'external_supply' && !supplyId) next.context = 'Pilih kontrak supply.';
    const chosen = rows.map((row) => row.materialTypeId).filter(Boolean);
    if (rows.some((row) => !row.materialTypeId || !(Number(row.requestedQuantity) > 0))) next.items = 'Setiap baris wajib punya material dan kuantitas lebih dari 0.';
    else if (new Set(chosen).size !== chosen.length) next.items = 'Satu jenis material hanya boleh sekali per request.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFormError('');
    try {
      const items = rows.map((row) => ({
        materialTypeId: Number(row.materialTypeId),
        requestedQuantity: Number(row.requestedQuantity),
        ...(row.itemNotes.trim() && { itemNotes: row.itemNotes.trim() }),
      }));
      const notes = requestNotes.trim() || null;
      onSaved(initial
        ? await updateMaterialRequest(initial.id, { requestDate, neededDate: neededDate || null, requestNotes: notes, items })
        : await createMaterialRequest({
          requestType,
          ...(requestType === 'internal_project' ? { subProjectId: Number(subProjectId) } : { externalSupplyProjectId: Number(supplyId) }),
          requestDate,
          ...(neededDate && { neededDate }),
          ...(notes && { requestNotes: notes }),
          items,
        }));
    } catch (error) {
      setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={[{ label: 'Request Material', href: '#/lapangan/material' }, { label: initial ? initial.requestCode : 'Ajukan' }]}
      icon="🧱"
      title={initial ? `Ubah ${initial.requestCode}` : 'Ajukan Request Material'}
      subtitle="Admin memeriksa kuantitas dan biaya, lalu Finance menyetujui."
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel={initial ? 'Simpan Perubahan' : 'Kirim ke Admin'}
      aside={(
        <InfoCard title="Aturan">
          <p>Kuantitas memakai satuan jenis material. Dari rit? Konversikan dulu, mis. ke m³.</p>
          <p>Admin boleh menurunkan kuantitas. Yang berlaku adalah kuantitas hasil validasi.</p>
          <p>Surat jalan baru bisa dicatat setelah request disetujui.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError || stageError || typeError}</FormError>
      {initial ? (
        <Field label="Tujuan" htmlFor="context" hint="Salah tujuan: batalkan request ini lalu ajukan ulang.">
          <input id="context" disabled value={initial.requestType === 'external_supply' ? `Supply · ${initial.externalSupplyProject?.supplyProjectName || '-'}` : stageLabel(initial.subProject)} className="input-control text-sm disabled:bg-slate-100" />
        </Field>
      ) : (
        <>
          <fieldset>
            <legend className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Tujuan</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[['internal_project', 'Tahapan Konstruksi'], ['external_supply', 'Kontrak Supply']].map(([value, label]) => (
                <label key={value} className={`cursor-pointer rounded-lg border p-3 text-sm font-semibold transition ${requestType === value ? 'border-brand-600 bg-brand-50/60 ring-2 ring-brand-600/15' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name="requestType" value={value} checked={requestType === value} onChange={() => setRequestType(value)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {requestType === 'internal_project' ? (
            <Field label="Tahapan" htmlFor="subProjectId" required error={errors.context}>
              <StageSelect stages={stages} value={subProjectId} onChange={setSubProjectId} />
            </Field>
          ) : (
            <Field label="Kontrak Supply" htmlFor="supplyId" required error={errors.context}>
              <select id="supplyId" value={supplyId} onChange={(event) => setSupplyId(event.target.value)} className="input-control text-sm">
                <option value="">- Pilih kontrak aktif -</option>
                {(supplies?.data || []).map((project) => <option key={project.id} value={project.id}>{project.projectName}{project.clientName ? ` — ${project.clientName}` : ''}</option>)}
              </select>
            </Field>
          )}
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal Request" htmlFor="requestDate" required>
          <input id="requestDate" type="date" max={todayIso()} value={requestDate} onChange={(event) => setRequestDate(event.target.value)} className="input-control text-sm" />
        </Field>
        <Field label="Dibutuhkan Tanggal" htmlFor="neededDate">
          <input id="neededDate" type="date" min={requestDate} value={neededDate} onChange={(event) => setNeededDate(event.target.value)} className="input-control text-sm" />
        </Field>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Material<span className="ml-0.5 text-red-500">*</span></p>
        {errors.items && <p className="mt-1 text-[11px] font-medium text-red-600">{errors.items}</p>}
        <div className="mt-2 space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_2rem]">
              <select aria-label="Jenis material" value={row.materialTypeId} onChange={(event) => setRow(row.key, { materialTypeId: event.target.value })} className="input-control h-9 text-xs">
                <option value="">- Pilih material -</option>
                {(types || []).map((type) => <option key={type.id} value={type.id}>{type.materialName} ({type.unit})</option>)}
              </select>
              <div className="flex items-center gap-1.5">
                <input aria-label="Kuantitas" type="number" min="0" step="any" value={row.requestedQuantity} onChange={(event) => setRow(row.key, { requestedQuantity: event.target.value })} className="input-control h-9 min-w-0 font-mono text-xs" placeholder="0" />
                <span className="shrink-0 text-xs font-semibold text-slate-500">{unitOf(row)}</span>
              </div>
              <input aria-label="Catatan material" value={row.itemNotes} onChange={(event) => setRow(row.key, { itemNotes: event.target.value })} maxLength={500} className="input-control h-9 text-xs" placeholder="Catatan (opsional)" />
              <button type="button" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} className="text-sm font-bold text-slate-400 hover:text-red-600 disabled:opacity-30" aria-label="Hapus baris">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows((current) => [...current, newRow()])} className="btn btn-secondary mt-2 text-xs">+ Tambah Material</button>
      </div>
      <Field label="Catatan" htmlFor="requestNotes">
        <input id="requestNotes" value={requestNotes} onChange={(event) => setRequestNotes(event.target.value)} maxLength={500} className="input-control text-sm" placeholder="Opsional" />
      </Field>
    </FormPage>
  );
}

/** Tanpa `recordId` = pengajuan baru; dengan `recordId` = ubah pengajuan yang ada. */
export default function MaterialRequestFormPage({ recordId, onCancel, onSaved }) {
  const { data, error } = useRecord(() => (recordId ? getMaterialRequest(recordId) : Promise.resolve(null)), recordId || 'new');
  if (recordId && error) return <EmptyPanel icon="🔎" title="Request material tidak ditemukan">{error}</EmptyPanel>;
  if (recordId && !data) return <LoadingPanel>Memuat request...</LoadingPanel>;
  return <MaterialRequestForm initial={data} onCancel={onCancel} onSaved={onSaved} />;
}
