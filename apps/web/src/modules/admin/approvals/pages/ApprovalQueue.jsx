import { useEffect, useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { Notice } from '../../project/components/ProjectUi.jsx';
import { formatCurrency, formatDateTime } from '../../project/utils/projectFormat.js';
import { setProgressValidation } from '../../project/services/projectService.js';
import { timeAgo } from '../../files/utils/filesFormat.js';
import { DecisionButtons, Pager, RejectReasonForm, StatTile } from '../components/ApprovalUi.jsx';
import { getApprovalSummary, listApprovalQueue } from '../services/approvalService.js';
import { QUEUE_SOURCES, progressIds, queueDetailRoute } from '../utils/approvalFormat.js';

const PAGE_SIZE = 15;

// Teks per antrean. Kunci = sourceType dari /api/approval-queue.
const COPY = {
  material_request: {
    title: 'Request Material',
    description: 'Sesuaikan kuantitas (hanya boleh turun), susun rincian biaya, lalu teruskan ke Finance — atau tolak.',
    empty: 'Tidak ada request material yang menunggu Admin.',
    permission: 'material-request:validate',
  },
  equipment_request: {
    title: 'Request Alat (Internal)',
    description: 'Teruskan ke Divisi Alat untuk dipenuhi, atau tolak dengan alasan.',
    empty: 'Tidak ada request alat yang menunggu Admin.',
    permission: 'equipment-request:review',
  },
  progress_log: {
    title: 'Validasi Progress Harian',
    description: 'Progress tervalidasi menjadi dasar tagihan klien. Validasi atau tolak di sini; cabut validasi dari layar detail progress.',
    empty: 'Tidak ada progress harian yang menunggu validasi.',
    permission: 'progress:validate',
  },
};

/**
 * Antrean tahap Admin untuk SATU sumber (GET /api/approval-queue?sourceType=…).
 * Dokumen milik sendiri sudah disaring backend; aksinya tetap di endpoint
 * modul sumber (lewat layar detail, atau langsung di baris untuk progress).
 */
export default function ApprovalQueue({ sourceType, initialNotice }) {
  const copy = COPY[sourceType] || { title: QUEUE_SOURCES[sourceType]?.label || sourceType, description: '', empty: 'Antrean kosong.' };
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
  const mine = summary.items.find((item) => item.sourceType === sourceType);
  const summaryLoaded = summary.key === reloadKey;
  // Summary hanya memuat antrean yang boleh diproses user ini.
  const noAccess = summaryLoaded && !summary.error && !mine;
  const oldest = mine?.oldestSubmittedAt;

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
        <StatTile label="Menunggu Keputusan Admin" value={summaryLoaded ? (mine?.count ?? 0) : '…'} hint={copy.title} icon={QUEUE_SOURCES[sourceType]?.icon || '📥'} tone="amber" />
        <StatTile label="Paling Lama Menunggu" value={oldest ? timeAgo(oldest) : '-'} hint={oldest ? `Masuk ${formatDateTime(oldest)}` : 'Antrean kosong'} icon="⏳" />
      </div>

      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      {summary.error && <Notice tone="error">Ringkasan antrean gagal dimuat: {summary.error}</Notice>}
      {noAccess && <Notice tone="warning">Akun ini tidak memegang wewenang {copy.permission ? <code>{copy.permission}</code> : 'untuk antrean ini'}, jadi antreannya kosong.</Notice>}

      <section className="card-panel overflow-hidden" aria-label={`Antrean ${copy.title}`}>
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{copy.title}</h2>
            <p className="text-xs leading-relaxed text-slate-500">{copy.description}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto md:shrink-0">
            <input value={search} onChange={(event) => changeFilter(setSearch)(event.target.value)} className="input-control h-9 text-xs sm:w-56" placeholder="Cari kode atau project..." aria-label="Cari antrean" />
            <select value={sort} onChange={(event) => changeFilter(setSort)(event.target.value)} className="input-control h-9 text-xs sm:w-36" aria-label="Urutan">
              <option value="oldest">Terlama dulu</option>
              <option value="newest">Terbaru dulu</option>
            </select>
          </div>
        </div>

        <ResponsiveTable
            columns={[
              {
                key: 'reference',
                label: 'Referensi',
                primary: true,
                render: (row) => (row.referenceCode
                  ? (queueDetailRoute(row) ? <a href={queueDetailRoute(row)} className="font-mono text-sm font-bold text-leaf-700 hover:underline">{row.referenceCode}</a> : <span className="font-mono text-sm font-bold">{row.referenceCode}</span>)
                  : <span className="text-xs text-slate-400">-</span>),
                sub: (row) => row.summary || '',
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
                        {href && <a href={href} className="text-[11px] font-semibold text-brand-700 hover:underline" title="Lihat kondisi lapangan & dampak ke progress tahapan">Detail</a>}
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
                    return <a href={href} className="inline-block rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-800 hover:border-brand-600 hover:text-brand-700">Periksa →</a>;
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
            empty={search ? 'Tidak ada yang cocok dengan pencarian.' : `${copy.empty} 🎉`}
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
