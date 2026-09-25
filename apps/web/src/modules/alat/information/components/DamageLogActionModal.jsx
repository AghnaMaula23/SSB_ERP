import { useState } from 'react';
import { cancelDamageLog, resolveDamageLog } from '../services/informationService.js';

const initialResolve = { maintenanceType: 'repair', actionDescription: '', performedBy: '' };

function todayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

export default function DamageLogActionModal({ log, action, onClose, onSaved }) {
  const [form, setForm] = useState(initialResolve);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!log || !action) return null;

  const isResolve = action === 'resolve';
  const update = (event) => { const { name, value } = event.target; setForm((current) => ({ ...current, [name]: value })); setError(''); };
  const submit = async (event) => {
    event.preventDefault();
    if (isResolve && !form.actionDescription.trim()) {
      setError('Deskripsi tindakan wajib diisi.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (isResolve) await resolveDamageLog(log.id, { ...form, actionDescription: form.actionDescription.trim(), maintenanceDate: todayDate() });
      else await cancelDamageLog(log.id, notes.trim());
      onSaved(action); onClose();
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  };

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !loading && onClose()}
    >
      <div className="modal-content max-w-md" role="dialog" aria-modal="true" aria-labelledby="damage-action-title">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold ${isResolve ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {isResolve ? '✓' : '✕'}
            </div>
            <div>
              <h2 id="damage-action-title" className="text-base font-bold text-slate-900">
                {isResolve ? 'Resolve Damage Log' : 'Cancel Damage Log'}
              </h2>
              <p className="text-xs text-slate-500 font-mono">{log.damageCode}</p>
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

          {isResolve ? (
            <>
              <div>
                <label htmlFor="maintenanceType" className="block text-xs font-semibold text-slate-600">Action Category</label>
                <select id="maintenanceType" name="maintenanceType" value={form.maintenanceType} onChange={update} className="input-control mt-1 text-xs">
                  <option value="repair">Repair</option>
                  <option value="replacement">Replacement</option>
                  <option value="inspection">Inspection</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="routine">Routine</option>
                </select>
              </div>

              <div>
                <label htmlFor="actionDescription" className="block text-xs font-semibold text-slate-600">Action Taken</label>
                <textarea
                  id="actionDescription"
                  name="actionDescription"
                  value={form.actionDescription}
                  onChange={update}
                  required
                  rows="3"
                  className="input-control mt-1 text-xs py-2 h-auto"
                  placeholder="Describe maintenance or repair performed..."
                />
              </div>

              <div>
                <label htmlFor="performedBy" className="block text-xs font-semibold text-slate-600">Performed By (Mechanic)</label>
                <input
                  id="performedBy"
                  name="performedBy"
                  value={form.performedBy}
                  onChange={update}
                  className="input-control mt-1 text-xs"
                  placeholder="Mechanic or technician name (optional)"
                />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="cancel-notes" className="block text-xs font-semibold text-slate-600">Cancellation Reason</label>
              <textarea
                id="cancel-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows="3"
                className="input-control mt-1 text-xs py-2 h-auto"
                placeholder="Reason for cancelling log (optional)..."
              />
            </div>
          )}

          <footer className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button type="button" onClick={onClose} disabled={loading} className="btn btn-secondary text-xs">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`btn text-xs ${isResolve ? 'btn-primary' : 'btn-danger'}`}
            >
              {loading ? 'Processing...' : isResolve ? 'Confirm Resolution' : 'Confirm Cancellation'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

