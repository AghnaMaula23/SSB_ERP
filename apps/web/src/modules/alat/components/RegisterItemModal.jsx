import { useEffect, useState } from 'react';
import { getEquipmentTypes, normalizeItem, registerItem } from '../services/alatService.js';

const initialForm = { equipmentTypeId: '', brand: '', model: '', plateNumber: '' };
const isTruckType = (typeName) => /truck|truk/i.test(typeName);

export default function RegisterItemModal({ isOpen, onClose, onSaved }) {
  const [form, setForm] = useState(initialForm);
  const [equipmentTypes, setEquipmentTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedType = equipmentTypes.find((type) => String(type.id) === form.equipmentTypeId);
  const showPlateNumber = selectedType ? isTruckType(selectedType.typeName) : false;
  const loadingTypes = isOpen && equipmentTypes.length === 0 && !error;

  useEffect(() => {
    if (!isOpen) return undefined;

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
  }, [isOpen]);

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
      setError('Equipment type is required.');
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
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !loading && onClose()}
    >
      <div className="modal-content max-w-md" role="dialog" aria-modal="true" aria-labelledby="register-item-title">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 font-bold">
              📦
            </div>
            <div>
              <h2 id="register-item-title" className="text-base font-bold text-slate-900">Register New Equipment</h2>
              <p className="text-xs text-slate-500">Add a new unit to the fleet inventory.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="btn btn-ghost px-2 py-1 text-slate-400 hover:text-slate-600"
            aria-label="Close modal"
          >
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}
          
          <div>
            <label htmlFor="equipmentTypeId" className="block text-xs font-semibold text-slate-600">Equipment Type</label>
            <select
              id="equipmentTypeId"
              name="equipmentTypeId"
              value={form.equipmentTypeId}
              onChange={updateField}
              disabled={loading || loadingTypes}
              required
              className="input-control mt-1 text-xs"
            >
              <option value="">{loadingTypes ? 'Loading types...' : 'Select equipment category'}</option>
              {equipmentTypes.map((type) => <option key={`${type.id}-${type.typeName}`} value={type.id}>{type.typeName}</option>)}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="brand" className="block text-xs font-semibold text-slate-600">Brand / Merek</label>
              <input
                id="brand"
                name="brand"
                value={form.brand}
                onChange={updateField}
                disabled={loading}
                maxLength="100"
                className="input-control mt-1 text-xs"
                placeholder="e.g. Komatsu"
              />
            </div>

            <div>
              <label htmlFor="model" className="block text-xs font-semibold text-slate-600">Model / Type</label>
              <input
                id="model"
                name="model"
                value={form.model}
                onChange={updateField}
                disabled={loading}
                maxLength="100"
                className="input-control mt-1 text-xs"
                placeholder="e.g. D65PX"
              />
            </div>
          </div>

          {showPlateNumber && (
            <div>
              <label htmlFor="plateNumber" className="block text-xs font-semibold text-slate-600">License Plate Number</label>
              <input
                id="plateNumber"
                name="plateNumber"
                value={form.plateNumber}
                onChange={updateField}
                disabled={loading}
                maxLength="30"
                className="input-control mt-1 text-xs uppercase"
                placeholder="e.g. B 1234 XYZ"
              />
            </div>
          )}

          <footer className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button type="button" onClick={onClose} disabled={loading} className="btn btn-secondary text-xs">
              Cancel
            </button>
            <button type="submit" disabled={loading || loadingTypes} className="btn btn-primary text-xs">
              {loading ? 'Saving...' : 'Register Item'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

