import { useEffect, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, MockBanner, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../project/utils/projectFormat.js';
import { decideFieldCash, getFieldCash } from '../services/fieldCashMockService.js';
import { KAS_STATUS } from '../utils/approvalFormat.js';

/** Detail klaim kas lapangan + nota — DATA CONTOH. */
export default function FieldCashDetail({ recordId, onDone }) {
  const [row, setRow] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFieldCash(recordId)
      .then((data) => { if (!cancelled) setRow(data); })
      .catch((requestError) => { if (!cancelled) setLoadError(requestError.message); });
    return () => { cancelled = true; };
  }, [recordId]);

  if (loadError) return <EmptyPanel icon="🔎" title="Klaim tidak ditemukan" action={<a href="#/admin/approvals/kas" className="btn btn-secondary text-xs">← Kembali</a>}>{loadError}</EmptyPanel>;
  if (!row) return <LoadingPanel>Memuat klaim...</LoadingPanel>;

  const decide = async (status) => {
    if (status === 'rejected' && !notes.trim()) {
      setError('Alasan penolakan wajib diisi supaya lapangan tahu yang harus diperbaiki.');
      return;
    }
    if (status === 'approved' && !window.confirm(`Setujui klaim ${row.requestCode} senilai ${formatCurrency(row.amount)}?`)) return;
    setBusy(true);
    setError('');
    try {
      await decideFieldCash(row.id, status, notes);
      onDone(status === 'approved' ? `${row.requestCode} disetujui.` : `${row.requestCode} ditolak.`);
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Pusat Approval', href: '#/admin/approvals/kas' }, { label: 'Verifikasi Kas Lapangan' }, { label: row.requestCode }]} />
      <div className="mb-5 mt-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{row.description}</h1>
          <StatusBadge status={row.status} map={KAS_STATUS} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          <span className="font-mono font-semibold text-slate-700">{row.requestCode}</span> · {row.projectName} · {row.subProjectLabel} · {row.category} · diajukan {formatDate(row.requestDate)} oleh {row.requestedBy?.fullName}
        </p>
      </div>
      <MockBanner>Klaim kas lapangan masih data contoh — backend Finance Field belum tersedia.</MockBanner>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <section className="card-panel overflow-hidden" aria-label="Rincian klaim">
            <table className="table-modern">
              <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Harga Satuan</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {row.items.map((item) => (
                  <tr key={item.name}>
                    <td className="text-sm">{item.name}</td>
                    <td className="text-right text-xs">{formatNumber(item.quantity)} {item.unit}</td>
                    <td className="text-right font-mono text-xs">{formatCurrency(item.unitPrice)}</td>
                    <td className="text-right font-mono font-semibold">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between bg-slate-100 px-5 py-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-700">Total Klaim</span>
              <span className="font-mono text-xl font-bold text-slate-900">{formatCurrency(row.amount)}</span>
            </div>
          </section>

          <section className="card-panel p-5" aria-label="Nota">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">📎 Nota / Bukti ({row.attachments.length})</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {row.attachments.map((file) => (
                <figure key={file.id} className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(135deg,#f8fafc_0_10px,#f1f5f9_10px_20px)] text-slate-400">
                    <span className="text-3xl" aria-hidden="true">🧾</span>
                    <span className="text-[10px] font-semibold uppercase">Pratinjau contoh</span>
                  </div>
                  <figcaption className="truncate border-t border-slate-200 px-2 py-1.5 text-[11px] text-slate-600" title={file.name}>{file.label}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          {row.status === 'submitted' ? (
            <div className="card-panel p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Keputusan</p>
              <label htmlFor="decision-notes" className="mt-3 block text-[11px] font-semibold text-slate-600">Catatan / alasan penolakan</label>
              <textarea id="decision-notes" rows={3} value={notes} onChange={(event) => { setNotes(event.target.value); setError(''); }} className="input-control mt-1 h-auto resize-y text-sm" placeholder="Wajib bila menolak" />
              {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={() => decide('rejected')} className="btn btn-secondary text-xs text-red-600">Reject</button>
                <button type="button" disabled={busy} onClick={() => decide('approved')} className="btn bg-leaf-700 text-xs text-white hover:bg-leaf-800">Approve</button>
              </div>
            </div>
          ) : (
            <div className="card-panel p-4 text-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Keputusan</p>
              <p className="mt-2 text-slate-700"><b>{KAS_STATUS[row.status].label}</b> oleh {row.decidedBy?.fullName} · {formatDateTime(row.decidedAt)}</p>
              {row.decisionNotes && <p className="mt-2 rounded bg-slate-50 p-2 text-slate-600">{row.decisionNotes}</p>}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
