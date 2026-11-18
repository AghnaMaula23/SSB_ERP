import { useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ActionButton from '../../../components/ActionButton.jsx';
import ClaimContexts from '../../finance/components/ClaimContexts.jsx';
import { RejectReasonForm } from '../../admin/approvals/components/ApprovalUi.jsx';
import { StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { formatCurrency, formatDate, formatNumber, subProjectTypeLabel, todayIso } from '../../admin/project/utils/projectFormat.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { hasPermission } from '../../../services/permissions.js';
import { recordActivity } from '../../../services/activityLogService.js';
import { cancelIncomeClaim, createIncomeClaim, getEligibleClaim, listIncomeClaims } from '../services/incomeClaimService.js';

const CLAIM_STATUS = {
  submitted: { label: 'Menunggu Finance', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Disetujui', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  rejected: { label: 'Ditolak', className: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Dibatalkan', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/**
 * Klaim pendapatan alat: pilih rentang tanggal → sistem menghitung semua jam kerja
 * yang tagihan kliennya sudah LUNAS (rental: tarif tagihan; konstruksi: tarif default
 * unit). Disetujui Finance = saldo Kas Alat bertambah otomatis.
 */
export default function KasClaimPendapatanPage({ onBackToModules, onBackToKas, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [period, setPeriod] = useState({ start: `${todayIso().slice(0, 4)}-01-01`, end: todayIso() });
  const [preview, setPreview] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const canCreate = hasPermission('equipment-claim:create');
  const { data: claims, reload } = useRecord(() => listIncomeClaims(), 'claims');

  const pull = async () => {
    setBusy(true);
    setError('');
    try { setPreview(await getEligibleClaim(period.start, period.end)); } catch (requestError) { setPreview(null); setError(requestError.message); } finally { setBusy(false); }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!preview?.contexts.length) { setError('Tidak ada jam kerja yang layak diklaim pada rentang ini.'); return; }
    setBusy(true);
    setError('');
    try {
      const claim = await createIncomeClaim({ periodStart: preview.periodStart, periodEnd: preview.periodEnd, ...(notes.trim() && { notes: notes.trim() }) });
      recordActivity({ module: 'Kas', action: 'Klaim pendapatan diajukan', description: `${claim.claimCode} · ${formatCurrency(claim.totalAmount)} · menunggu Finance`, ref: 'alat/kas' });
      sessionStorage.setItem('kas-notice', `${claim.claimCode} (${formatCurrency(claim.totalAmount)}) diajukan ke Finance. Saldo Kas Alat bertambah setelah disetujui.`);
      onBackToKas();
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/kas" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <nav className="flex items-center gap-2 text-xs font-medium text-slate-500"><button type="button" onClick={onBackToKas} className="hover:text-slate-800">Kas</button><span>/</span><span className="font-semibold text-slate-900">Klaim Pendapatan</span></nav>
              <h1 className="mt-1 break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Klaim Pendapatan Alat</h1>
              <p className="mt-1 text-xs text-slate-500">Jam kerja alat yang tagihan kliennya sudah lunas bisa diklaim ke Finance. Semua jam layak dalam rentang ikut sekaligus.</p>
            </div>
            <ActionButton kind="back" className="shrink-0" label="Kembali ke Kas" onClick={onBackToKas} />
          </header>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}
          {notice && <div className="rounded-lg border border-leaf-200 bg-leaf-50 p-3 text-xs text-leaf-700" role="status">{notice}</div>}

          {canCreate && (
            <form onSubmit={submit} className="card-panel space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Dari<input type="date" value={period.start} max={period.end} onChange={(e) => { setPeriod((p) => ({ ...p, start: e.target.value })); setPreview(null); }} className="input-control mt-1 text-sm" /></label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Sampai<input type="date" value={period.end} min={period.start} max={todayIso()} onChange={(e) => { setPeriod((p) => ({ ...p, end: e.target.value })); setPreview(null); }} className="input-control mt-1 text-sm" /></label>
                <button type="button" disabled={busy} onClick={pull} className="btn btn-secondary text-xs">⟳ Hitung jam layak</button>
              </div>

              {preview && (
                <>
                  <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-900">
                    <b>{formatNumber(preview.totalHours)} jam · {formatCurrency(preview.totalAmount)}</b> layak diklaim ({formatDate(preview.periodStart)} – {formatDate(preview.periodEnd)})
                  </div>
                  <ClaimContexts contexts={preview.contexts} />
                  {preview.missingRate.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <p className="font-semibold">Unit tanpa tarif default (jam konstruksinya belum bisa diklaim):</p>
                      <p className="mt-1">{preview.missingRate.map((u) => u.assetCode).join(', ')} — isi tarif per jam di master alat.</p>
                    </div>
                  )}
                  {preview.pending.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <p className="font-semibold">Belum layak (menunggu tagihan klien lunas):</p>
                      <ul className="mt-1 space-y-0.5">{preview.pending.map((p) => <li key={`${p.contextType}-${p.code}-${p.subProjectType}`}>{p.code} {p.name}{p.subProjectType ? ` · ${subProjectTypeLabel(p.subProjectType)}` : ''} — {formatNumber(p.hours)} jam ({p.logCount} catatan)</li>)}</ul>
                    </div>
                  )}
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Catatan untuk Finance<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} className="input-control mt-1 h-auto resize-y text-sm" /></label>
                </>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
                <ActionButton kind="cancel" label="Batal" tone="danger" onClick={onBackToKas} />
                <button type="submit" disabled={busy || !preview?.contexts.length} className="btn btn-primary">💰 {busy ? 'Memproses...' : 'Ajukan Klaim'}</button>
              </div>
            </form>
          )}

          <section className="card-panel overflow-hidden" aria-label="Riwayat klaim">
            <p className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900">Riwayat Klaim</p>
            <ul>
              {(claims?.data || []).map((claim) => (
                <li key={claim.id} className="border-t border-slate-100 px-4 py-3 text-xs first:border-t-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><b className="font-mono">{claim.claimCode}</b> · {formatDate(claim.periodStart)} – {formatDate(claim.periodEnd)} · {formatNumber(claim.totalHours)} jam</span>
                    <span className="flex items-center gap-2">
                      <b className="font-mono">{formatCurrency(claim.totalAmount)}</b>
                      <StatusBadge status={claim.status} map={CLAIM_STATUS} />
                      {claim.status === 'submitted' && canCreate && cancelling !== claim.id && <button type="button" onClick={() => setCancelling(claim.id)} className="text-[11px] font-semibold text-red-600 hover:underline">Batalkan</button>}
                    </span>
                  </div>
                  {cancelling === claim.id && <div className="mt-2"><RejectReasonForm label={`Alasan membatalkan ${claim.claimCode}`} submitLabel="Batalkan Klaim" requiredMessage="Alasan wajib diisi." onSubmit={async (reason) => { await cancelIncomeClaim(claim.id, reason); setCancelling(null); setNotice(`${claim.claimCode} dibatalkan.`); reload(); }} onCancel={() => setCancelling(null)} /></div>}
                </li>
              ))}
              {claims && !claims.data.length && <li className="px-4 py-6 text-center text-sm text-slate-500">Belum ada klaim.</li>}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
