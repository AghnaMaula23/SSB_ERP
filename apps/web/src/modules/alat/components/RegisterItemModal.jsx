import { useEffect, useState } from 'react';
import { getEquipmentTypes, normalizeItem, registerItem } from '../services/alatService.js';

const initialForm = { equipmentTypeId: '', brand: '', model: '', plateNumber: '' };
const dummyEquipmentTypes = [
  { id: 1, typeName: 'Truck Tronton' },
  { id: 2, typeName: 'Dump Truck' },
  { id: 3, typeName: 'Excavator' },
  { id: 4, typeName: 'Bulldozer' },
  { id: 5, typeName: 'Crane' },
];
const isTruckType = (typeName) => /truck|truk/i.test(typeName);

function CloseIcon() {
  return <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>;
}

export default function RegisterItemModal({ isOpen, onClose, onSaved, useDummyData = true }) {
  const [form, setForm] = useState(initialForm);
  const [equipmentTypes, setEquipmentTypes] = useState(useDummyData ? dummyEquipmentTypes : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedType = equipmentTypes.find((type) => String(type.id) === form.equipmentTypeId);
  const showPlateNumber = selectedType ? isTruckType(selectedType.typeName) : false;
  const loadingTypes = isOpen && equipmentTypes.length === 0 && !error;

  useEffect(() => {
    if (!isOpen || useDummyData) return undefined;

    const loadEquipmentTypes = async () => {
      try {
        const types = await getEquipmentTypes();
        setEquipmentTypes(types.map((type) => ({ id: type.id, typeName: type.typeName })));
      } catch (requestError) {
        setError(requestError.message);
      }
    };

    loadEquipmentTypes();
    return undefined;
  }, [isOpen, useDummyData]);

  if (!isOpen) return null;

  const updateField = (event) => {
    const { name, value } = event.target;
    if (name === 'equipmentTypeId') {
      const nextType = equipmentTypes.find((type) => String(type.id) === value);
      setForm((currentForm) => ({ ...currentForm, equipmentTypeId: value, plateNumber: nextType && isTruckType(nextType.typeName) ? currentForm.plateNumber : '' }));
    } else {
      setForm((currentForm) => ({ ...currentForm, [name]: value }));
    }
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.equipmentTypeId) {
      setError('Jenis alat belum tersedia dari server. Muat ulang dan coba lagi.');
      return;
    }

    setLoading(true);
    const payload = {
      equipmentTypeId: Number(form.equipmentTypeId),
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      plateNumber: showPlateNumber ? form.plateNumber.trim() || null : null,
    };

    try {
      if (useDummyData) {
        const typeName = selectedType?.typeName || 'Equipment';
        onSaved(normalizeItem({
          id: `dummy-${Date.now()}`,
          assetCode: `DUM-${String(Date.now()).slice(-6)}`,
          equipmentType: { id: selectedType.id, typeName },
          brand: form.brand.trim() || '-',
          model: form.model.trim() || '-',
          plateNumber: showPlateNumber ? form.plateNumber.trim() || null : null,
          currentStatus: 'available',
        }));
        setForm(initialForm);
        onClose();
        return;
      }
      const savedItem = await registerItem(payload);
      onSaved(normalizeItem(savedItem));
      setForm(initialForm);
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !loading && onClose()}>
      <section className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="register-item-title">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-700">Equipment Inventory</p><h2 id="register-item-title" className="mt-1 text-lg font-bold text-slate-800">Register New Item</h2></div>
          <button type="button" onClick={onClose} disabled={loading} className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Close register item modal"><CloseIcon /></button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700" role="alert">{error}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:col-span-2">Jenis Item
              <select name="equipmentTypeId" value={form.equipmentTypeId} onChange={updateField} disabled={loading || loadingTypes} required className="mt-1.5 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none transition focus:border-[#005580] focus:ring-4 focus:ring-[#005580]/10 disabled:bg-slate-50">
                <option value="">{loadingTypes ? 'Memuat jenis alat...' : 'Pilih jenis item'}</option>
                {equipmentTypes.map((type) => <option key={`${type.id}-${type.typeName}`} value={type.id}>{type.typeName}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Merek
              <input name="brand" value={form.brand} onChange={updateField} disabled={loading} maxLength="100" className="mt-1.5 block h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-[#005580] focus:ring-4 focus:ring-[#005580]/10" placeholder="Contoh: Komatsu" />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Model
              <input name="model" value={form.model} onChange={updateField} disabled={loading} maxLength="100" className="mt-1.5 block h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-[#005580] focus:ring-4 focus:ring-[#005580]/10" placeholder="Contoh: D65PX" />
            </label>
            {showPlateNumber && <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:col-span-2">Nomor Polisi
              <input name="plateNumber" value={form.plateNumber} onChange={updateField} disabled={loading} maxLength="30" className="mt-1.5 block h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal uppercase tracking-wide text-slate-700 outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-300 focus:border-[#005580] focus:ring-4 focus:ring-[#005580]/10" placeholder="Contoh: B 1234 XYZ" />
            </label>}
          </div>

          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-slate-300 px-5 py-2.5 text-xs font-bold tracking-wide text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">BATAL</button>
            <button type="submit" disabled={loading || loadingTypes} className="rounded-lg bg-[#005580] px-5 py-2.5 text-xs font-bold tracking-wide text-white shadow-sm transition hover:bg-[#004266] disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'MENYIMPAN...' : 'SIMPAN'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
