import { useState } from 'react';
import { cancelDamageLog, resolveDamageLog } from '../services/informationService.js';
import { saveResolvePurchaseReference } from '../services/damageLogActionService.js';

const initialResolve = { maintenanceType: 'repair', actionDescription: '', performedBy: '' };

function todayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * purchaseOrders: PO Perbaikan Alat approved yang merujuk damage log ini.
 * Resolve wajib memilih minimal satu PO tersebut.
 */
export default function DamageLogActionModal({ log, action, purchaseOrders = [], onClose, onSaved }) {
  const [form, setForm] = useState(initialResolve);
  const [notes, setNotes] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState(() => purchaseOrders.length === 1 ? [String(purchaseOrders[0].id)] : []);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!log || !action) return null;

  const isResolve = action === 'resolve';
  const update = (event) => { const { name, value } = event.target; setForm((current) => ({ ...current, [name]: value })); setError(''); };
  const toggleOrder = (id) => { setSelectedOrderIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); setError(''); };
  const submit = async (event) => {
    event.preventDefault();
    if (isResolve && !selectedOrderIds.length) {
      setError('Pilih minimal satu purchase order Perbaikan Alat yang sudah approved.');
      return;
    }
    if (isResolve && !form.actionDescription.trim()) {
      setError('Deskripsi tindakan wajib diisi.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (isResolve) {
        const selectedOrders = purchaseOrders.filter((order) => selectedOrderIds.includes(String(order.id)));
        await resolveDamageLog(log.id, { ...form, actionDescription: form.actionDescription.trim(), maintenanceDate: todayDate() });
        saveResolvePurchaseReference({ damageLogId: log.id, purchaseOrderIds: selectedOrders.map((order) => order.id), purchaseOrderCodes: selectedOrders.map((order) => order.orderCode) });
      }
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
                <p className="text-xs font-semibold text-slate-600">Purchase Order Perbaikan Alat (Approved) *</p>
                {purchaseOrders.length === 0 ? (
                  <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">Belum ada purchase order Perbaikan Alat approved untuk damage log ini. Ajukan purchase order terlebih dahulu dan tunggu sampai di-approve.</p>
                ) : (
                  <div className="mt-1 space-y-2">
                    {purchaseOrders.map((order) => {
                      const id = String(order.id);
                      const checked = selectedOrderIds.includes(id);
                      const items = (order.items || []).filter((item) => item.relatedType === 'damage' && String(item.relatedId) === String(log.id));
                      return (
                        <label key={id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-[11px] transition ${checked ? 'border-teal-500 bg-teal-50/40 ring-1 ring-teal-500' : 'border-slate-200 hover:border-slate-300'}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleOrder(id)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600" />
                          <span className="min-w-0 text-slate-600">
                            <span className="block text-xs font-bold text-slate-900">{order.orderCode}</span>
                            <span className="mt-0.5 block">{items.map((item) => `${item.itemName} (${item.quantity} ${item.unit})`).join(', ') || order.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

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
              disabled={loading || (isResolve && !purchaseOrders.length)}
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

