import { useEffect, useState } from 'react';
import { createDamageLog, getInformationItems, updateDamageLog } from '../services/informationService.js';

const emptyForm = { equipmentItemId: '', description: '', sparePartSource: 'warehouse', mechanicTeam: 'internal', stopsOperation: false };
const formFromLog = (log) => ({ equipmentItemId: String(log?.equipmentItemId || ''), description: log?.description || '', sparePartSource: log?.sparePartSource || 'warehouse', mechanicTeam: log?.mechanicTeam || 'internal', stopsOperation: Boolean(log?.stopsOperation) });

export default function DamageLogModal({ isOpen, onClose, onSaved, log = null }) {
  const isEdit = Boolean(log);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const request = window.setTimeout(() => {
      setForm(isEdit ? formFromLog(log) : emptyForm);
      setError('');
      getInformationItems().then(setItems).catch((requestError) => setError(requestError.message));
    }, 0);
    return () => window.clearTimeout(request);
  }, [isOpen, isEdit, log]);

  if (!isOpen) return null;

  const update = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.equipmentItemId || !form.description.trim()) {
      setError('Please select an equipment unit and enter a description.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        description: form.description.trim(),
        sparePartSource: form.sparePartSource,
        mechanicTeam: form.mechanicTeam,
        stopsOperation: form.stopsOperation,
      };
      const saved = isEdit
        ? await updateDamageLog(log.id, payload)
        : await createDamageLog({ ...payload, equipmentItemId: Number(form.equipmentItemId), damageDate: new Date().toISOString().slice(0, 10) });
      onSaved(saved);
      setForm(emptyForm);
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
      <div className="modal-content max-w-lg" role="dialog" aria-modal="true" aria-labelledby="damage-log-title">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700 font-bold">
              📋
            </div>
            <div>
              <h2 id="damage-log-title" className="text-base font-bold text-slate-900">
                {isEdit ? 'Edit Damage Log' : 'Create Damage Log'}
              </h2>
              <p className="text-xs text-slate-500">Record equipment damage issue details.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="btn btn-ghost px-2 py-1 text-slate-400 hover:text-slate-600"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </header>

        <form onSubmit={submit} className="p-6 space-y-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}

          <div>
            <label htmlFor="equipmentItemId" className="block text-xs font-semibold text-slate-600">Equipment Unit</label>
            <select
              id="equipmentItemId"
              name="equipmentItemId"
              value={form.equipmentItemId}
              onChange={update}
              disabled={loading || isEdit}
              required
              className="input-control mt-1 text-xs"
            >
              <option value="">Select Equipment Code...</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.assetCode} {item.brand ? `· ${item.brand}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="description" className="block text-xs font-semibold text-slate-600">Damage Description</label>
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={update}
              disabled={loading}
              required
              rows="3"
              maxLength="1000"
              className="input-control mt-1 text-xs py-2 h-auto"
              placeholder="e.g. Hydraulic oil leakage on main boom cylinder seal..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1">Spare Part Source</span>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex cursor-pointer items-center justify-center rounded-lg border p-2 text-xs font-semibold transition ${form.sparePartSource === 'warehouse' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>
                  <input type="radio" name="sparePartSource" value="warehouse" checked={form.sparePartSource === 'warehouse'} onChange={update} className="sr-only" />
                  Warehouse
                </label>
                <label className={`flex cursor-pointer items-center justify-center rounded-lg border p-2 text-xs font-semibold transition ${form.sparePartSource === 'supplier' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>
                  <input type="radio" name="sparePartSource" value="supplier" checked={form.sparePartSource === 'supplier'} onChange={update} className="sr-only" />
                  Supplier
                </label>
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1">Mechanic Team</span>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex cursor-pointer items-center justify-center rounded-lg border p-2 text-xs font-semibold transition ${form.mechanicTeam === 'internal' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>
                  <input type="radio" name="mechanicTeam" value="internal" checked={form.mechanicTeam === 'internal'} onChange={update} className="sr-only" />
                  Internal
                </label>
                <label className={`flex cursor-pointer items-center justify-center rounded-lg border p-2 text-xs font-semibold transition ${form.mechanicTeam === 'external' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>
                  <input type="radio" name="mechanicTeam" value="external" checked={form.mechanicTeam === 'external'} onChange={update} className="sr-only" />
                  External
                </label>
              </div>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 pt-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              name="stopsOperation"
              checked={form.stopsOperation}
              onChange={update}
              disabled={loading}
              className="rounded border-slate-300 accent-teal-700"
            />
            <span>Critical issue: Machine operation halted</span>
          </label>

          <footer className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button type="button" onClick={onClose} disabled={loading} className="btn btn-secondary text-xs">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary text-xs">
              {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Damage Log'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
