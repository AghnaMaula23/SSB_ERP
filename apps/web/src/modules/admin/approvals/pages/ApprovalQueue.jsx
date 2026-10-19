import { Fragment, useEffect, useState } from 'react';
import { Notice } from '../../project/components/ProjectUi.jsx';
import { formatCurrency, formatDateTime } from '../../project/utils/projectFormat.js';
import { setProgressValidation } from '../../project/services/projectService.js';
import { timeAgo } from '../../files/utils/filesFormat.js';
import { DecisionButtons, FilterChips, Pager, RejectReasonForm, StatTile } from '../components/ApprovalUi.jsx';
import { getApprovalSummary, listApprovalQueue } from '../services/approvalService.js';
import { QUEUE_SOURCES, queueDetailRoute } from '../utils/approvalFormat.js';

const PAGE_SIZE = 15;

// detailPath progress: /api/projects/sub-projects/:subId/progress-logs/:logId
const progressIds = (row) => {
  const match = /sub-projects\/(\d+)\/progress-logs\/(\d+)/.exec(row.detailPath || '');
  return match ? { subProjectId: Number(match[1]), logId: Number(match[2]) } : null;
};

/**
 * Antrean Approval Center tahap Admin (GET /api/approval-queue). Tab sumber
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
          <h2 className="text-lg font-bold text-slate-900">Antrean Approval Admin</h2>
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

        <div className="overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Masuk</th>
                <th>Sumber</th>
                <th>Referensi</th>
                <th>Konteks</th>
                <th className="text-right">Nominal</th>
                <th>Diajukan</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-500">Memuat antrean...</td></tr>
              ) : result.error ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-red-600">{result.error}</td></tr>
              ) : result.data.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-500">{search ? 'Tidak ada yang cocok dengan pencarian.' : 'Tidak ada yang menunggu keputusan Admin. 🎉'}</td></tr>
              ) : result.data.map((row) => {
                const source = QUEUE_SOURCES[row.sourceType] || { label: row.sourceType, icon: '•', className: '' };
                const href = queueDetailRoute(row);
                const key = rowKey(row);
                return (
                  <Fragment key={key}>
                    <tr>
                      <td className="whitespace-nowrap text-xs">
                        <p className="font-semibold text-slate-800">{timeAgo(row.submittedAt)}</p>
                        <p className="text-[11px] text-slate-400">{formatDateTime(row.submittedAt)}</p>
                      </td>
                      <td><span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${source.className}`}><span aria-hidden="true">{source.icon}</span>{source.label}</span></td>
                      <td>
                        {row.referenceCode
                          ? (href ? <a href={href} className="font-mono text-sm font-bold text-emerald-700 hover:underline">{row.referenceCode}</a> : <span className="font-mono text-sm font-bold">{row.referenceCode}</span>)
                          : <span className="text-xs text-slate-400">-</span>}
                      </td>
                      <td className="max-w-72">
                        <p className="truncate text-xs font-medium text-slate-800" title={row.context}>{row.context}</p>
                        <p className="truncate text-[11px] text-slate-500" title={row.summary}>{row.summary}</p>
                      </td>
                      <td className="whitespace-nowrap text-right font-mono text-sm font-semibold text-slate-900">{row.amount === null ? <span className="text-slate-400">-</span> : formatCurrency(row.amount)}</td>
                      <td className="text-xs text-slate-700">{row.requestedBy?.fullName || '-'}</td>
                      <td className="text-right">
                        {row.sourceType === 'progress_log' ? (
                          <DecisionButtons
                            busy={busyKey === key}
                            disabled={busyKey !== null || rejectingKey !== null}
                            approveLabel="Validasi"
                            onApprove={() => validateProgress(row)}
                            onReject={() => setRejectingKey(key)}
                          />
                        ) : href ? (
                          <a href={href} className="inline-block rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-800 hover:border-teal-600 hover:text-teal-700">Periksa →</a>
                        ) : null}
                      </td>
                    </tr>
                    {rejectingKey === key && (
                      <tr className="bg-red-50/60">
                        <td colSpan={7}>
                          <RejectReasonForm
                            label={`Alasan menolak progress ${row.summary}`}
                            submitLabel="Tolak Progress"
                            placeholder="Contoh: Volume tidak sesuai foto lapangan"
                            onSubmit={(notes) => rejectProgress(row, notes)}
                            onCancel={() => setRejectingKey(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={result.totalPages} total={result.total} shown={result.data.length} onChange={setPage} label="dokumen" />
      </section>
    </>
  );
}
