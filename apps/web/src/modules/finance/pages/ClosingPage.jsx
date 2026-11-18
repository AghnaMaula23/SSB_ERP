import { useState } from 'react';
import { Breadcrumb, Notice, PageHeader, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { RejectReasonForm } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatDate, formatDateTime } from '../../admin/project/utils/projectFormat.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { hasPermission } from '../../../services/permissions.js';
import { closeAccountingPeriod, listAccountingPeriods, reopenAccountingPeriod } from '../services/financeService.js';

const STATUS = {
  open: { label: 'Terbuka', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  closed: { label: 'Ditutup', className: 'bg-slate-100 text-slate-700 border-slate-300' },
};
const monthName = (period) => formatDate(`${period}-01`, { month: 'long', year: 'numeric' });

/**
 * Tutup buku bulanan (F3b). Bulan yang ditutup terkunci: tidak ada jurnal maupun dokumen
 * bertanggal bulan itu yang bisa dibuat. Menutup berurutan; ditolak selama ada dokumen
 * menunggu keputusan bertanggal bulan itu. Buka kembali hanya bulan tertutup terakhir.
 */
export default function ClosingPage() {
  const { data: months, error, reload } = useRecord(() => listAccountingPeriods(), 'periods');
  const [notice, setNotice] = useState({ tone: 'success', text: '' });
  const [reopening, setReopening] = useState(null);
  const [busy, setBusy] = useState(false);
  const canClose = hasPermission('accounting-period:close');
  const lastClosed = (months || []).find((m) => m.status === 'closed')?.period;

  const close = async (month) => {
    if (!window.confirm(`Tutup buku ${monthName(month.period)}? Setelah ditutup, tidak ada transaksi bertanggal bulan itu yang bisa dicatat.`)) return;
    setBusy(true);
    try {
      await closeAccountingPeriod(month.period);
      setNotice({ tone: 'success', text: `Buku ${monthName(month.period)} ditutup.` });
      reload();
    } catch (requestError) {
      setNotice({ tone: 'error', text: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Finance' }, { label: 'Tutup Buku' }]} />
      <PageHeader title="Tutup Buku Bulanan" subtitle="Setelah laporan kas cocok dengan rekening koran, tutup bulan yang sudah lewat. Koreksi atas bulan tertutup masuk ke bulan berjalan." />
      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="table-container">
        <div className="table-scroll-mobile overflow-x-auto">
          <table className="table-modern">
            <thead><tr><th>Bulan</th><th className="text-center">Status</th><th>Keterangan</th><th className="text-right">Aksi</th></tr></thead>
            <tbody>
              {!months && !error && <tr><td colSpan={4} className="py-10 text-center text-sm text-slate-500">Memuat...</td></tr>}
              {(months || []).map((month) => (
                <tr key={month.period} className="align-top">
                  <td className="whitespace-nowrap text-sm font-semibold">{monthName(month.period)}{!month.isEnded && <span className="block text-[11px] font-normal text-slate-400">bulan berjalan</span>}</td>
                  <td className="text-center"><StatusBadge status={month.status} map={STATUS} /></td>
                  <td className="text-xs text-slate-600">
                    {month.closing && <p>Ditutup {month.closing.closedBy?.fullName} · {formatDateTime(month.closing.closedAt)}</p>}
                    {month.blockers.map((b) => <p key={b.key} className="text-amber-700">⚠ {b.count} {b.label}</p>)}
                    {month.history.map((h) => <p key={h.id} className="text-[11px] text-slate-400">Dibuka kembali {h.reopenedBy?.fullName} · {formatDateTime(h.reopenedAt)}: {h.reopenReason}</p>)}
                    {reopening === month.period && (
                      <div className="mt-2"><RejectReasonForm label="Alasan membuka kembali" submitLabel="Buka Kembali" requiredMessage="Alasan wajib diisi." onSubmit={async (reason) => { await reopenAccountingPeriod(month.period, reason); setReopening(null); setNotice({ tone: 'success', text: `Buku ${monthName(month.period)} dibuka kembali.` }); reload(); }} onCancel={() => setReopening(null)} /></div>
                    )}
                  </td>
                  <td className="text-right">
                    {canClose && month.status === 'open' && month.isEnded && <button type="button" disabled={busy || month.blockers.length > 0} title={month.blockers.length ? 'Selesaikan dokumen yang menunggu dulu' : ''} onClick={() => close(month)} className="btn btn-primary px-3 py-1 text-[11px]">Tutup Buku</button>}
                    {canClose && month.period === lastClosed && reopening !== month.period && <button type="button" onClick={() => setReopening(month.period)} className="btn btn-secondary px-3 py-1 text-[11px]">Buka Kembali</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
