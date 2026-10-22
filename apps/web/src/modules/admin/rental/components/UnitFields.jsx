import { useEffect, useState } from 'react';
import { Field } from '../../project/components/FormPage.jsx';
import { getEquipmentTypes } from '../../../alat/services/alatService.js';
import { PACKETS } from '../utils/rentalFormat.js';

/**
 * Isian unit sewa = isi Request Alat external_rental (backlog E18): jenis,
 * jumlah, tanggal dibutuhkan, lokasi kerja, estimasi jam, catatan. Merek/model
 * sengaja tidak ditanyakan — memilih unit adalah wewenang Divisi Alat.
 * Operator & paket menentukan biaya internal, belum punya kolom; dititipkan
 * di catatan request (buildUnitNotes).
 */
export default function UnitFields({ form, errors = {}, onChange, idPrefix = 'unit' }) {
  const [types, setTypes] = useState(null);
  const [typeError, setTypeError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getEquipmentTypes()
      .then((rows) => { if (!cancelled) setTypes(rows || []); })
      .catch((error) => { if (!cancelled) { setTypes([]); setTypeError(error.message); } });
    return () => { cancelled = true; };
  }, []);

  const set = (name) => (event) => onChange({
    [name]: event.target.value,
    ...(name === 'equipmentTypeId' && { typeName: (types || []).find((type) => String(type.id) === event.target.value)?.typeName || '' }),
  });
  const id = (name) => `${idPrefix}-${name}`;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <Field label="Jenis Alat" htmlFor={id('equipmentTypeId')} required error={errors.equipmentTypeId || typeError}>
          <select id={id('equipmentTypeId')} value={form.equipmentTypeId} onChange={set('equipmentTypeId')} disabled={!types} className="input-control text-sm disabled:bg-slate-100">
            <option value="">{types ? '- Pilih jenis alat -' : 'Memuat jenis alat...'}</option>
            {(types || []).map((type) => <option key={type.id} value={type.id}>{type.typeName}</option>)}
          </select>
        </Field>
        <Field label="Jumlah" htmlFor={id('quantity')} required error={errors.quantity}>
          <input id={id('quantity')} type="number" min="1" max="100" step="1" value={form.quantity} onChange={set('quantity')} className="input-control font-mono text-sm" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Field label="Tanggal Dibutuhkan" htmlFor={id('neededDate')} error={errors.neededDate}>
          <input id={id('neededDate')} type="date" value={form.neededDate} onChange={set('neededDate')} className="input-control text-sm" />
        </Field>
        <Field label="Lokasi Kerja" htmlFor={id('locationDetail')} error={errors.locationDetail} hint="Titik pengiriman unit di lokasi penyewa.">
          <input id={id('locationDetail')} value={form.locationDetail} onChange={set('locationDetail')} maxLength={255} className="input-control text-sm" placeholder="Contoh: Gerbang 2, Kawasan Industri Cikande" />
        </Field>
      </div>

      <fieldset>
        <legend className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Packet</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {Object.entries(PACKETS).map(([value, packet]) => {
            const active = form.packet === value;
            return (
              <label key={value} className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-center transition ${active ? 'bg-white text-teal-800 shadow-sm ring-2 ring-teal-600' : 'text-slate-500 hover:text-slate-800'}`}>
                <input type="radio" name={id('packet')} value={value} checked={active} onChange={set('packet')} className="sr-only" />
                <span aria-hidden="true">{packet.icon}</span>
                <span>
                  <span className="block text-sm font-bold">{packet.label}</span>
                  <span className="block text-[10px] font-medium opacity-80">{packet.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Field label="Estimasi Jam" htmlFor={id('estimatedWorkhours')} error={errors.estimatedWorkhours} hint="Total, opsional.">
          <input id={id('estimatedWorkhours')} type="number" min="0" step="1" value={form.estimatedWorkhours} onChange={set('estimatedWorkhours')} className="input-control font-mono text-sm" />
        </Field>
        <Field label="Operator" htmlFor={id('operator')} hint="Opsional — operator yang ikut dengan unit.">
          <input id={id('operator')} value={form.operator} onChange={set('operator')} maxLength={100} className="input-control text-sm" placeholder="Contoh: Ahmad Suganda" />
        </Field>
      </div>
      <Field label="Catatan untuk Divisi Alat" htmlFor={id('extra')}>
        <input id={id('extra')} value={form.extra} onChange={set('extra')} maxLength={200} className="input-control text-sm" placeholder="Opsional" />
      </Field>
    </>
  );
}
