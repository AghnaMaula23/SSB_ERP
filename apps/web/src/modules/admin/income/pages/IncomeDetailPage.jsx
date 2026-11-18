import { useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { RejectReasonForm } from '../../approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate, formatDateTime, formatNumber, unitLabel } from '../../project/utils/projectFormat.js';
import { useRecord } from '../../../lapangan/hooks/useFieldData.js';
import { currentUserId } from '../../../lapangan/utils/fieldFormat.js';
import { hasPermission } from '../../../../services/permissions.js';
import { INCOME_STATUS, PAYMENT_METHODS, PAYMENT_STATUS, SOURCES, contextLabel } from '../utils/incomeFormat.js';
import { cancelIncomeRecord, getIncomeRecord } from '../services/incomeService.js';

/** Rincian tagihan: progress (konstruksi) atau baris jam kerja / penerimaan. */
export function IncomeBreakdown({ record }) {
  if (record.progress) {
    const p = record.progress;
    return (
      <table className="table-modern">
        <tbody>
          <tr><td>Volume kumulatif</td><td className="text-right text-xs">{formatNumber(p.volumeFrom)} → {formatNumber(p.volumeTo)} {unitLabel(p.volumeUnit)}</td></tr>
          <tr><td>Progress</td><td className="text-right text-xs">{formatNumber(p.percentFrom)}% → {formatNumber(p.percentTo)}% dari target {formatNumber(p.targetVolume)} {unitLabel(p.volumeUnit)}</td></tr>
          <tr><td>Volume ditagih</td><td className="text-right text-xs font-semibold">{formatNumber(p.billedVolume)} {unitLabel(p.volumeUnit)}</td></tr>
          <tr><td>Nilai kontrak tahapan</td><td className="text-right font-mono text-xs">{formatCurrency(p.contractValue)}</td></tr>
        </tbody>
      </table>
    );
  }
  return (
    <table className="table-modern">
      <thead><tr><th>{record.contextType === 'rental' ? 'Tanggal · Unit' : 'Penerimaan · Material'}</th><th className="text-right">Jumlah × Tarif</th><th className="text-right">Subtotal</th></tr></thead>
      <tbody>
        {record.items.map((item) => (
          <tr key={item.id}>
            <td>
              {item.equipmentItem
                ? <><p className="text-sm font-medium text-slate-900">{item.equipmentItem.typeName} · {item.equipmentItem.assetCode}</p><p className="text-[11px] text-slate-400">{formatDate(item.workDate)}{item.workSession ? ` · ${item.workSession}` : ''}</p></>
                : <><p className="text-sm font-medium text-slate-900">{item.material.materialName}</p><p className="text-[11px] text-slate-400">{item.receiptCode} · {item.deliveryCode} · {formatDate(item.receivedAt)}</p></>}
              {item.rateNotes && <p className="text-[11px] text-amber-700">Tarif: {item.rateNotes}</p>}
            </td>
            <td className="whitespace-nowrap text-right text-xs text-slate-600">{formatNumber(item.quantity)} {unitLabel(item.unit)} × {formatCurrency(item.unitRate)}</td>
            <td className="w-36 text-right font-mono font-semibold text-slate-900">{formatCurrency(item.subtotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Detail tagihan klien: rincian, pembayaran (dicatat Finance), jurnal, dan pembatalan pembuat. */
export default function IncomeDetailPage({ recordId, initialNotice }) {
  const { data: record, error, reload } = useRecord(() => getIncomeRecord(recordId), recordId);
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });
  const [cancelling, setCancelling] = useState(false);

  if (error && !record) return <EmptyPanel icon="🔎" title="Tagihan tidak ditemukan" action={<a href="#/admin/income" className="btn btn-secondary text-xs">← Kembali</a>}>{error}</EmptyPanel>;
  if (!record) return <LoadingPanel>Memuat tagihan...</LoadingPanel>;

  const source = SOURCES[record.contextType];
  const canCancel = record.status === 'submitted' && hasPermission('income:create') && record.createdBy?.id === currentUserId();
  const cancel = async (reason) => {
    await cancelIncomeRecord(record.id, reason);
    setCancelling(false);
    setNotice({ tone: 'success', text: `${record.incomeCode} dibatalkan.` });
    reload();
  };

  const decided = ['verified', 'rejected', 'voided'].includes(record.status);
  const timeline = [
    { label: 'Diajukan Admin', at: record.createdAt, by: record.createdBy?.fullName, done: true },
    record.status === 'cancelled'
      ? { label: 'Dibatalkan pembuat', at: record.cancelledAt, by: record.cancelledBy?.fullName, done: true, tone: 'red', note: record.cancelReason }
      : { label: record.status === 'rejected' ? 'Ditolak Finance' : 'Verifikasi Finance', at: record.verifiedAt, by: record.verifiedBy?.fullName, done: decided, tone: record.status === 'rejected' ? 'red' : 'teal', note: record.financeNotes },
    ...(record.status === 'voided' ? [{ label: 'Dibatalkan setelah sah', at: record.voidedAt, by: record.voidedBy?.fullName, done: true, tone: 'red', note: record.voidReason }] : []),
    ...(record.status === 'verified' ? [{ label: 'Lunas', done: record.paymentStatus === 'paid' }] : []),
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={[{ label: 'Income', href: '#/admin/income' }, { label: record.incomeCode }]} />

      <section className="mt-3 rounded-2xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-100">{source.icon} Tagihan {source.label}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{formatCurrency(record.totalAmount)}</p>
            <p className="mt-1 text-sm text-brand-50">{record.context.clientName || '-'} · {contextLabel(record.context)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-lg bg-white/10 px-2.5 py-1 font-mono text-[11px]">{record.incomeCode}</span>
            <StatusBadge status={record.status} map={INCOME_STATUS} className="bg-white!" />
            {record.paymentStatus && <StatusBadge status={record.paymentStatus} map={PAYMENT_STATUS} className="bg-white!" />}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-white/20 pt-3 text-xs text-brand-50">
          <span>Periode {formatDate(record.periodStart)} – {formatDate(record.periodEnd)}</span>
          {record.status === 'verified' && <span>Terbayar {formatCurrency(record.paidAmount)} · sisa {formatCurrency(record.outstandingAmount)}</span>}
        </div>
      </section>

      <div className="mt-5">
        <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-5">
          <section className="card-panel overflow-hidden" aria-label="Rincian tagihan">
            <p className="bg-slate-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">Rincian</p>
            <IncomeBreakdown record={record} />
            <div className="flex items-center justify-between bg-slate-100 px-5 py-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-700">Total</span>
              <span className="font-mono text-xl font-bold text-slate-900">{formatCurrency(record.totalAmount)}</span>
            </div>
          </section>

          {record.payments.length > 0 && (
            <section className="card-panel overflow-hidden" aria-label="Pembayaran">
              <p className="bg-slate-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">Pembayaran klien (dicatat Finance)</p>
              <table className="table-modern">
                <tbody>
                  {record.payments.map((payment) => (
                    <tr key={payment.id} className={payment.isVoided ? 'text-slate-400 line-through' : ''}>
                      <td className="font-mono text-xs">{payment.paymentCode}</td>
                      <td className="text-xs">{formatDate(payment.paymentDate)} · {PAYMENT_METHODS[payment.paymentMethod] || '-'}{payment.referenceNumber ? ` · ${payment.referenceNumber}` : ''}</td>
                      <td className="text-right font-mono text-xs font-semibold">{formatCurrency(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card-panel p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Alur</p>
            <ol className="mt-3 space-y-3">
              {timeline.map((step) => (
                <li key={step.label} className="flex gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${step.done ? (step.tone === 'red' ? 'bg-red-500' : 'bg-brand-600') : 'bg-slate-300'}`}>{step.done ? (step.tone === 'red' ? '✕' : '✓') : ''}</span>
                  <div className="min-w-0 text-xs">
                    <p className={`font-semibold ${step.done ? 'text-slate-900' : 'text-slate-400'}`}>{step.label}</p>
                    {step.at && <p className="text-[11px] text-slate-500">{formatDateTime(step.at)}{step.by ? ` · ${step.by}` : ''}</p>}
                    {step.note && <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700">{step.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {record.notes && (
            <div className="card-panel p-4 text-xs text-slate-600">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Catatan Admin</p>
              <p className="mt-2 whitespace-pre-line">{record.notes}</p>
            </div>
          )}
          {record.journalEntries.length > 0 && (
            <div className="card-panel p-4 text-xs text-slate-600">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Jurnal</p>
              <ul className="mt-2 space-y-1">{record.journalEntries.map((j) => <li key={j.id} className="font-mono">{j.journalCode} · {formatDate(j.journalDate)}{j.isReversal ? ' (balik)' : ''}</li>)}</ul>
            </div>
          )}
          {canCancel && (cancelling
            ? <div className="card-panel p-4"><RejectReasonForm label="Alasan pembatalan" submitLabel="Batalkan" requiredMessage="Alasan pembatalan wajib diisi." onSubmit={cancel} onCancel={() => setCancelling(false)} /></div>
            : <button type="button" onClick={() => setCancelling(true)} className="btn btn-secondary w-full text-xs text-red-600">Batalkan Tagihan</button>)}
          {['rejected', 'cancelled', 'voided'].includes(record.status) && hasPermission('income:create') && (
            <a href={`#/admin/income/new/${record.contextType}`} className="btn btn-primary w-full text-xs">Buat Tagihan Baru</a>
          )}
        </aside>
      </div>
    </div>
  );
}
