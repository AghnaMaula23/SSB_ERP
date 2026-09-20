import { useState } from 'react';
import { cancelDamageLog, resolveDamageLog } from '../services/informationService.js';

const initialResolve = { maintenanceType: 'repair', actionDescription: '', performedBy: '' };

export default function DamageLogActionModal({ log, action, onClose, onSaved }) {
  const [form, setForm] = useState(initialResolve);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  if (!log || !action) return null;

  const isResolve = action === 'resolve';
  const update = (event) => { const { name, value } = event.target; setForm((current) => ({ ...current, [name]: value })); setError(''); };
  const submit = async (event) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      if (isResolve) await resolveDamageLog(log.id, { ...form, actionDescription: form.actionDescription.trim(), maintenanceDate: new Date().toISOString().slice(0, 10) });
      else await cancelDamageLog(log.id, notes.trim());
      onSaved(action); onClose();
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !loading && onClose()}>
    <section className="w-full max-w-lg border border-[#cbd5e1] bg-[#f8fafc] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="damage-action-title">
      <header className="flex items-start justify-between border-b border-[#cbd5e1] px-5 py-4"><div><h2 id="damage-action-title" className="text-lg font-bold text-[#1e293b]">{isResolve ? 'Resolve Log Kerusakan' : 'Cancel Log Kerusakan'}</h2><p className="mt-1 text-xs text-[#64748b]">{log.damageCode} · {log.description}</p></div><button type="button" onClick={onClose} disabled={loading} className="text-2xl text-[#475569]" aria-label="Close action dialog">×</button></header>
      <form onSubmit={submit} className="space-y-4 px-5 py-5">
        {error && <div className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</div>}
        {isResolve ? <><label className="block text-xs font-bold uppercase tracking-wide text-[#475569]">Jenis tindakan<select name="maintenanceType" value={form.maintenanceType} onChange={update} className="mt-1.5 h-10 w-full border border-[#cbd5e1] bg-white px-3 text-sm font-normal normal-case text-[#1e293b] outline-none focus:border-[#08729a]"><option value="repair">Repair</option><option value="replacement">Replacement</option><option value="inspection">Inspection</option><option value="adjustment">Adjustment</option><option value="routine">Routine</option></select></label><label className="block text-xs font-bold uppercase tracking-wide text-[#475569]">Deskripsi tindakan<textarea name="actionDescription" value={form.actionDescription} onChange={update} required rows="3" className="mt-1.5 block w-full border border-[#cbd5e1] bg-white px-3 py-2 text-sm font-normal normal-case outline-none focus:border-[#08729a]" placeholder="Jelaskan tindakan yang telah dilakukan..." /></label><label className="block text-xs font-bold uppercase tracking-wide text-[#475569]">Pelaksana<input name="performedBy" value={form.performedBy} onChange={update} className="mt-1.5 h-10 w-full border border-[#cbd5e1] bg-white px-3 text-sm font-normal normal-case outline-none focus:border-[#08729a]" placeholder="Nama mekanik (opsional)" /></label></> : <label className="block text-xs font-bold uppercase tracking-wide text-[#475569]">Catatan pembatalan<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="3" className="mt-1.5 block w-full border border-[#cbd5e1] bg-white px-3 py-2 text-sm font-normal normal-case outline-none focus:border-[#08729a]" placeholder="Alasan pembatalan (opsional)" /></label>}
        <footer className="flex justify-end gap-2 border-t border-[#e2e8f0] pt-4"><button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-xs font-bold text-[#475569]">Batal</button><button type="submit" disabled={loading} className={`px-4 py-2 text-xs font-bold text-white ${isResolve ? 'bg-emerald-700' : 'bg-red-700'} disabled:opacity-60`}>{loading ? 'Memproses...' : isResolve ? 'Resolve' : 'Cancel'}</button></footer>
      </form>
    </section>
  </div>;
}
