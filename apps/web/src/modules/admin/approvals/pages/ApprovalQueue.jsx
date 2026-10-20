import { useEffect, useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { Notice } from '../../project/components/ProjectUi.jsx';
import { formatCurrency, formatDateTime } from '../../project/utils/projectFormat.js';
import { setProgressValidation } from '../../project/services/projectService.js';
import { timeAgo } from '../../files/utils/filesFormat.js';
import { DecisionButtons, FilterChips, Pager, RejectReasonForm, StatTile } from '../components/ApprovalUi.jsx';
import { getApprovalSummary, listApprovalQueue } from '../services/approvalService.js';
import { QUEUE_SOURCES, progressIds, queueDetailRoute } from '../utils/approvalFormat.js';

const PAGE_SIZE = 15;

/**
 * Approval Center Admin — antrean tahap Admin (GET /api/approval-queue). Tab sumber
 * ditentukan dari summary — antrean yang boleh diproses tetap tampil walau 0.
 * Dokumen milik sendiri sudah disaring backend.
 */
export default function ApprovalQueue({ initialNotice }) {
  const [sourceType, setSourceType] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('oldest');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState({ key: null, data: [], total: 0, totalPages: 1, error: '' });
  const [summary, setSummary] = useState({ key: null, total: 0, items: [], error: '' });
  const [busyKey, setBusyKey] = useState(null);
  const [rejectingKey, setRejectingKey] = useState(null);
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });
  const requestKey = `${sourceType}|${search}|${sort}|${page}|${reloadKey}`;
  const loading = result.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    getApprovalSummary()
      .then((response) => { if (!cancelled) setSummary({ key: reloadKey, total: response.total || 0, items: (response.items || []).filter((item) => item.stage === 'admin'), error: '' }); })
      .catch((error) => { if (!cancelled) setSummary({ key: reloadKey, total: 0, items: [], error: error.message }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      listApprovalQueue({ stage: 'admin', sourceType, search: search.trim(), sort, page, limit: PAGE_SIZE })
        .then((response) => { if (!cancelled) setResult({ key: requestKey, data: response.data || [], total: response.total || 0, totalPages: Math.max(1, response.totalPages || 1), error: '' }); })
        .catch((error) => { if (!cancelled) setResult({ key: requestKey, data: [], total: 0, totalPages: 1, error: error.message }); });
    }, search ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [page, requestKey, search, sort, sourceType]);

  const reload = () => setReloadKey((key) => key + 1);
  const rowKey = (row) => `${row.sourceType}:${row.sourceId}`;
  // 409 = sudah diputuskan user lain: tampilkan pesannya, lalu muat ulang antrean.
  const showError = (error) => {
    setNotice({ tone: 'error', text: error.message });
    if (error.status === 409) reload();
  };

  const validateProgress = async (row) => {
    const ids = progressIds(row);
    if (!ids || !window.confirm(`Validasi progress ${row.summary}? Volumenya menjadi dasar tagihan klien.`)) return;
    setBusyKey(rowKey(row));
    setNotice({ tone: 'success', text: '' });
    try {
      await setProgressValidation(ids.subProjectId, ids.logId, 'validated');
      setNotice({ tone: 'success', text: `Progress ${row.summary} divalidasi.` });
      reload();
    } catch (error) {
      showError(error);
    } finally {
      setBusyKey(null);
    }
  };

  const rejectProgress = async (row, notes) => {
    const ids = progressIds(row);
    try {
      await setProgressValidation(ids.subProjectId, ids.logId, 'rejected', notes);
      setNotice({ tone: 'success', text: `Progress ${row.summary} ditolak. Alasannya terlihat oleh Lapangan.` });
    } catch (error) {
      if (error.status !== 409) throw error;
      showError(error);
    }
    setRejectingKey(null);
    reload();
  };

  const changeFilter = (setter) => (value) => { setter(value); setPage(1); };
  const countFor = (type) => summary.items.filter((item) => item.sourceType === type).reduce((sum, item) => sum + item.count, 0);
  const tabs = [{ value: '', label: 'Semua', count: summary.items.reduce((sum, item) => sum + item.count, 0) },
    ...summary.items.map((item) => ({ value: item.sourceType, label: QUEUE_SOURCES[item.sourceType]?.label || item.sourceType, count: countFor(item.sourceType) }))];
  const oldest = summary.items.map((item) => item.oldestSubmittedAt).filter(Boolean).sort()[0];
  const summaryLoaded = summary.key === reloadKey;
  const noQueues = summaryLoaded && !summary.error && summary.items.length === 0;

  return (
    <>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatTile label="Menunggu Keputusan Admin" value={summaryLoaded ? tabs[0].count : '…'} hint={`${summary.items.length} jenis antrean`} icon="📥" tone="amber" />
        <StatTile label="Paling Lama Menunggu" value={oldest ? timeAgo(oldest) : '-'} hint={oldest ? `Masuk ${formatDateTime(oldest)}` : 'Antrean kosong'} icon="⏳" />
        <StatTile label="Progress Harian" value={summaryLoaded ? countFor('progress_log') : '…'} hint="Dasar tagihan klien" icon="📈" tone="teal" />
      </div>

      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      {summary.error && <Notice tone="error">Ringkasan antrean gagal dimuat: {summary.error}</Notice>}
      {noQueues && <Notice tone="warning">Akun ini tidak memegang wewenang approval Admin mana pun, jadi antreannya kosong.</Notice>}

      <section className="card-panel overflow-hidden" aria-label="Antrean approval">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Approval Center Admin</h2>
            <p className="text-xs text-slate-500">Semua dokumen yang menunggu keputusan Admin, lintas modul — terlama di atas.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={search} onChange={(event) => changeFilter(setSearch)(event.target.value)} className="input-control h-9 w-56 text-xs" placeholder="Cari kode atau project..." aria-label="Cari antrean" />
            <select value={sort} onChange={(event) => changeFilter(setSort)(event.target.value)} className="input-control h-9 w-36 text-xs" aria-label="Urutan">
              <option value="oldest">Terlama dulu</option>
              <option value="newest">Terbaru dulu</option>
            </select>
          </div>
        </div>
        {summary.items.length > 0 && (
          <div className="border-b border-slate-200 px-5 py-3">
            <FilterChips options={tabs} value={sourceType} onChange={changeFilter(setSourceType)} />
          </div>
        )}

        <ResponsiveTable
            columns={[
              {
                key: 'reference',
                label: 'Referensi',
                primary: true,
                render: (row) => (row.referenceCode
                  ? (queueDetailRoute(row) ? <a href={queueDetailRoute(row)} className="font-mono text-sm font-bold text-emerald-700 hover:underline">{row.referenceCode}</a> : <span className="font-mono text-sm font-bold">{row.referenceCode}</span>)
                  : <span className="text-xs text-slate-400">-</span>),
                sub: (row) => row.summary || '',
                badge: (row) => {
                  const source = QUEUE_SOURCES[row.sourceType] || { label: row.sourceType, icon: '•', className: '' };
                  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${source.className}`}><span aria-hidden="true">{source.icon}</span>{source.label}</span>;
                },
              },
              {
                key: 'submitted',
                label: 'Masuk',
                render: (row) => (
                  <span className="whitespace-nowrap text-xs">
                    <span className="block font-semibold text-slate-800">{timeAgo(row.submittedAt)}</span>
                    <span className="block text-[11px] text-slate-400">{formatDateTime(row.submittedAt)}</span>
                  </span>
                ),
              },
              {
                key: 'context',
                label: 'Konteks',
                render: (row) => (
                  <span className="block max-w-72 truncate text-xs font-medium text-slate-800" title={row.context}>
                    <span className="block truncate">{row.context}</span>
                    <span className="block truncate text-[11px] text-slate-500">{row.summary}</span>
                  </span>
                ),
              },
              {
                key: 'amount',
                label: 'Nominal',
                align: 'right',
                render: (row) => <span className="whitespace-nowrap font-mono text-sm font-semibold text-slate-900">{row.amount === null ? <span className="text-slate-400">-</span> : formatCurrency(row.amount)}</span>,
              },
              {
                key: 'requestedBy',
                label: 'Diajukan',
                render: (row) => <span className="text-xs text-slate-700">{row.requestedBy?.fullName || '-'}</span>,
              },
              {
                key: 'action',
                label: 'Aksi',
                align: 'right',
                render: (row) => {
                  const href = queueDetailRoute(row);
                  const key = rowKey(row);
                  if (row.sourceType === 'progress_log') {
                    return (
                      <div className="flex items-center justify-end gap-2">
                        {href && <a href={href} className="text-[11px] font-semibold text-teal-700 hover:underline" title="Lihat kondisi lapangan & dampak ke progress tahapan">Detail</a>}
                        <DecisionButtons
                          busy={busyKey === key}
                          disabled={busyKey !== null || rejectingKey !== null}
                          approveLabel="Validasi"
                          onApprove={() => validateProgress(row)}
                          onReject={() => setRejectingKey(key)}
                        />
                      </div>
                    );
                  }
                  if (href) {
                    return <a href={href} className="inline-block rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-800 hover:border-teal-600 hover:text-teal-700">Periksa →</a>;
                  }
                  return null;
                },
              },
            ]}
            rows={result.data}
            rowKey={rowKey}
            loading={loading}
            loadingText="Memuat antrean..."
            error={result.error}
            empty={search ? 'Tidak ada yang cocok dengan pencarian.' : 'Tidak ada yang menunggu keputusan Admin. 🎉'}
            expandedRow={(row) => (rejectingKey === rowKey(row) ? (
              <RejectReasonForm
                label={`Alasan menolak progress ${row.summary}`}
                submitLabel="Tolak Progress"
                placeholder="Contoh: Volume tidak sesuai foto lapangan"
                onSubmit={(notes) => rejectProgress(row, notes)}
                onCancel={() => setRejectingKey(null)}
              />
            ) : null)}
          />
        <Pager page={page} totalPages={result.totalPages} total={result.total} shown={result.data.length} onChange={setPage} label="dokumen" />
      </section>
    </>
  );
}
