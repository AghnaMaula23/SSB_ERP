import { useEffect, useMemo, useState } from 'react';
import { Field } from '../../project/components/FormPage.jsx';
import { getEquipmentTypes, getItems } from '../../../alat/services/alatService.js';
import { PACKETS } from '../utils/rentalFormat.js';

/**
 * Isian unit sewa. Jenis alat dari master Divisi Alat; merek & model
 * disarankan dari unit yang terdaftar untuk jenis itu. Merek/model hanya
 * PREFERENSI — unit fisiknya tetap ditentukan Divisi Alat saat approval.
 */
export default function UnitFields({ form, errors = {}, onChange, idPrefix = 'unit' }) {
  const [types, setTypes] = useState(null);
  const [typeError, setTypeError] = useState('');
  const [units, setUnits] = useState({ typeId: '', rows: [] });

  useEffect(() => {
    let cancelled = false;
    getEquipmentTypes()
      .then((rows) => { if (!cancelled) setTypes(rows || []); })
      .catch((error) => { if (!cancelled) { setTypes([]); setTypeError(error.message); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!form.equipmentTypeId) return undefined;
    let cancelled = false;
    getItems({ typeId: form.equipmentTypeId, limit: 100 })
      .then((result) => { if (!cancelled) setUnits({ typeId: form.equipmentTypeId, rows: result.data || [] }); })
      .catch(() => { if (!cancelled) setUnits({ typeId: form.equipmentTypeId, rows: [] }); });
    return () => { cancelled = true; };
  }, [form.equipmentTypeId]);

  const rows = useMemo(() => (units.typeId === form.equipmentTypeId ? units.rows : []), [form.equipmentTypeId, units]);
  const brands = useMemo(() => [...new Set(rows.map((row) => row.brand).filter(Boolean))].sort(), [rows]);
  const models = useMemo(() => [...new Set(rows.filter((row) => !form.brand || row.brand === form.brand).map((row) => row.model).filter(Boolean))].sort(), [form.brand, rows]);

  const set = (name) => (event) => onChange({
    [name]: event.target.value,
    ...(name === 'equipmentTypeId' && { brand: '', model: '', typeName: (types || []).find((type) => String(type.id) === event.target.value)?.typeName || '' }),
    ...(name === 'brand' && { model: '' }),
  });
  const id = (name) => `${idPrefix}-${name}`;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Periode Mulai" htmlFor={id('periodStart')} error={errors.periodStart}>
          <input id={id('periodStart')} type="date" value={form.periodStart} onChange={set('periodStart')} className="input-control text-sm" />
        </Field>
        <Field label="Periode Akhir" htmlFor={id('periodEnd')} error={errors.periodEnd}>
          <input id={id('periodEnd')} type="date" value={form.periodEnd} min={form.periodStart || undefined} onChange={set('periodEnd')} className="input-control text-sm" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Operator" htmlFor={id('operator')} hint="Nama operator yang ikut dengan unit.">
          <input id={id('operator')} value={form.operator} onChange={set('operator')} maxLength={100} className="input-control text-sm" placeholder="Contoh: Ahmad Suganda" />
        </Field>
        <Field label="Jenis Item" htmlFor={id('equipmentTypeId')} required error={errors.equipmentTypeId || typeError}>
          <select id={id('equipmentTypeId')} value={form.equipmentTypeId} onChange={set('equipmentTypeId')} disabled={!types} className="input-control text-sm disabled:bg-slate-100">
            <option value="">{types ? '- Pilih jenis alat -' : 'Memuat jenis alat...'}</option>
            {(types || []).map((type) => <option key={type.id} value={type.id}>{type.typeName}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
        <Field label="Merek" htmlFor={id('brand')} hint={form.equipmentTypeId && !brands.length ? 'Belum ada unit terdaftar untuk jenis ini.' : undefined}>
          <input id={id('brand')} list={id('brand-options')} value={form.brand} onChange={set('brand')} disabled={!form.equipmentTypeId} maxLength={60} className="input-control text-sm disabled:bg-slate-100" placeholder={form.equipmentTypeId ? 'Bebas / pilih' : 'Pilih jenis dulu'} />
          <datalist id={id('brand-options')}>{brands.map((value) => <option key={value} value={value} />)}</datalist>
        </Field>
        <Field label="Model" htmlFor={id('model')}>
          <input id={id('model')} list={id('model-options')} value={form.model} onChange={set('model')} disabled={!form.equipmentTypeId} maxLength={60} className="input-control text-sm disabled:bg-slate-100" placeholder={form.equipmentTypeId ? 'Bebas / pilih' : ''} />
          <datalist id={id('model-options')}>{models.map((value) => <option key={value} value={value} />)}</datalist>
        </Field>
        <Field label="Jumlah" htmlFor={id('quantity')} required error={errors.quantity}>
          <input id={id('quantity')} type="number" min="1" max="100" step="1" value={form.quantity} onChange={set('quantity')} className="input-control font-mono text-sm" />
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
        <Field label="Catatan untuk Divisi Alat" htmlFor={id('extra')}>
          <input id={id('extra')} value={form.extra} onChange={set('extra')} maxLength={200} className="input-control text-sm" placeholder="Opsional" />
        </Field>
      </div>
    </>
  );
}
