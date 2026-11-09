import { useState } from 'react';
import { Notice } from '../../admin/project/components/ProjectUi.jsx';

/**
 * Panel keputusan Finance. `blockedReason` diisi bila user ini tidak boleh
 * memutuskan (dokumen sendiri, sudah memeriksa sebagai Admin, tanpa izin, atau
 * bukan antrean Finance). Alasan WAJIB saat menolak — backend membalas 400 tanpa itu.
 * `onApprove`/`onReject` boleh melempar; 409 berarti sudah diproses orang lain.
 */
export default function DecisionPanel({ approveLabel = 'Setujui', approveConfirm, blockedReason, onApprove, onReject, onConflict, children }) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (blockedReason) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{blockedReason}</div>;
  }

  const run = async (action) => {
    if (action === 'reject' && !notes.trim()) { setError('Alasan penolakan wajib diisi supaya pengaju tahu yang harus diperbaiki.'); return; }
    if (action === 'approve' && approveConfirm && !window.confirm(approveConfirm)) return;
    setBusy(true);
    setError('');
    try {
      await (action === 'approve' ? onApprove(notes) : onReject(notes));
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
      if (requestError.status === 409) onConflict?.();
    }
  };

  return (
    <div className="card-panel p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Keputusan Finance</p>
      {children}
      <label htmlFor="finance-notes" className="mt-3 block text-[11px] font-semibold text-slate-600">Catatan / alasan penolakan</label>
      <textarea id="finance-notes" rows={3} value={notes} onChange={(event) => { setNotes(event.target.value); setError(''); }} className="input-control mt-1 h-auto resize-y text-sm" placeholder="Wajib bila menolak" />
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => run('reject')} className="btn btn-secondary text-xs text-red-600">Tolak</button>
        <button type="button" disabled={busy} onClick={() => run('approve')} className="btn bg-leaf-700 text-xs text-white hover:bg-leaf-800">{busy ? 'Menyimpan...' : approveLabel}</button>
      </div>
    </div>
  );
}
