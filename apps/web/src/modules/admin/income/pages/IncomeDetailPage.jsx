import { useEffect, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, MockBanner, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../project/utils/projectFormat.js';
import { COMPONENTS, INCOME_STATUS, RATE_SOURCES, SOURCES, slugOf } from '../utils/incomeFormat.js';
import { getIncomeRecord, withdrawIncomeRecord } from '../services/incomeService.js';

const UNIT_LABEL = { jam: 'jam', m3: 'm³', m2: 'm²', '%': '%' };

/** Detail satu pengajuan pendapatan: rincian per komponen dan status Finance. */
export default function IncomeDetailPage({ recordId, initialNotice, onNavigate }) {
  const [record, setRecord] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });

  useEffect(() => {
    let cancelled = false;
    getIncomeRecord(recordId)
      .then((row) => { if (!cancelled) setRecord(row); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [recordId]);

  if (loadError) return <EmptyPanel icon="🔎" title="Pengajuan tidak ditemukan" action={<a href="#/admin/income" className="btn btn-secondary text-xs">← Kembali</a>}>{loadError}</EmptyPanel>;
  if (!record) return <LoadingPanel>Memuat pengajuan...</LoadingPanel>;

  const source = SOURCES[record.projectSourceType];
  const groups = Object.keys(COMPONENTS).map((key) => ({ key, rows: record.items.filter((row) => row.incomeComponentType === key) })).filter((group) => group.rows.length);

  const withdraw = async () => {
    if (!window.confirm(`Tarik kembali pengajuan ${record.referenceCode}? Data akan dihapus.`)) return;
    try {
      await withdrawIncomeRecord(record.id);
      onNavigate('admin/income');
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    }
  };

  const timeline = [
    { label: 'Diajukan Admin', at: record.createdAt, by: record.createdBy?.fullName || record.createdBy?.username, done: true },
    { label: record.status === 'rejected' ? 'Ditolak Finance' : 'Verifikasi Finance', done: record.status !== 'submitted', tone: record.status === 'rejected' ? 'red' : 'teal', note: record.financeNotes },
    { label: 'Pembayaran Klien', done: ['partially_paid', 'paid'].includes(record.status) },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={[{ label: 'Income', href: '#/admin/income' }, { label: `#${record.referenceCode}` }]} />

      <section className="mt-3 rounded-2xl bg-gradient-to-br from-teal-800 via-teal-700 to-teal-600 p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-100">{source.icon} Pendapatan {source.label}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{formatCurrency(record.totalAmount)}</p>
            <p className="mt-1 text-sm text-teal-50">{record.partyName} · {record.projectName}{record.subProjectLabel ? ` · ${record.subProjectLabel}` : ''}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-lg bg-white/10 px-2.5 py-1 font-mono text-[11px]">#{record.referenceCode}</span>
            <StatusBadge status={record.status} map={INCOME_STATUS} className="bg-white!" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-white/20 pt-3 text-xs text-teal-50">
          <span>Periode {formatDate(record.billingPeriodStart)} – {formatDate(record.billingPeriodEnd)}</span>
          <span>{record.items.length} baris tagihan</span>
          {record.isDemo && <span className="rounded bg-violet-200/90 px-1.5 font-bold uppercase text-violet-900">Contoh</span>}
        </div>
      </section>

      <div className="mt-5">
        <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
        <MockBanner>Disimpan di browser ini sampai backend Income tersedia. Verifikasi dan pembayaran dilakukan Finance.</MockBanner>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section className="card-panel overflow-hidden" aria-label="Rincian tagihan">
          {groups.map((group) => (
            <div key={group.key} className="border-b border-slate-200 last:border-b-0">
              <p className="bg-slate-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">{COMPONENTS[group.key].icon} {COMPONENTS[group.key].label}</p>
              <table className="table-modern">
                <tbody>
                  {group.rows.map((row, index) => (
                    <tr key={`${group.key}-${index}`}>
                      <td>
                        <p className="font-medium text-slate-900">{row.description}</p>
                        <p className="text-[11px] text-slate-400">{RATE_SOURCES[row.rateSource]}{row.rateNotes ? ` · ${row.rateNotes}` : ''}</p>
                      </td>
                      <td className="whitespace-nowrap text-right text-xs text-slate-600">{formatNumber(row.quantity)} {UNIT_LABEL[row.unit] || row.unit} × {formatCurrency(row.rateSnapshot)}</td>
                      <td className="w-40 text-right font-mono font-bold text-slate-900">{formatCurrency(row.subtotalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <div className="flex items-center justify-between bg-slate-100 px-5 py-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-700">Total</span>
            <span className="font-mono text-xl font-bold text-slate-900">{formatCurrency(record.totalAmount)}</span>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="card-panel p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Alur</p>
            <ol className="mt-3 space-y-3">
              {timeline.map((step) => (
                <li key={step.label} className="flex gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${step.done ? (step.tone === 'red' ? 'bg-red-500' : 'bg-teal-600') : 'bg-slate-300'}`}>{step.done ? (step.tone === 'red' ? '✕' : '✓') : ''}</span>
                  <div className="min-w-0 text-xs">
                    <p className={`font-semibold ${step.done ? 'text-slate-900' : 'text-slate-400'}`}>{step.label}</p>
                    {step.at && <p className="text-[11px] text-slate-500">{formatDateTime(step.at)}{step.by ? ` · ${step.by}` : ''}</p>}
                    {step.note && <p className="mt-1 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">{step.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {record.adminNotes && (
            <div className="card-panel p-4 text-xs text-slate-600">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Catatan Admin</p>
              <p className="mt-2">{record.adminNotes}</p>
            </div>
          )}
          {record.status === 'submitted' && (
            <button type="button" onClick={withdraw} className="btn btn-secondary w-full text-xs text-red-600">Tarik Kembali Pengajuan</button>
          )}
          {record.status === 'rejected' && (
            <a href={`#/admin/income/new/${slugOf(record.projectSourceType)}`} className="btn btn-primary w-full text-xs">Ajukan Ulang</a>
          )}
        </aside>
      </div>
    </div>
  );
}
