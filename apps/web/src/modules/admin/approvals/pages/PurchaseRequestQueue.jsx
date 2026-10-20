import { useEffect, useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { formatCurrency, formatDate, formatDateTime } from '../../project/utils/projectFormat.js';
import { DecisionButtons, FilterChips, Pager, RejectReasonForm, StatTile } from '../components/ApprovalUi.jsx';
import { listPurchaseRequests, rejectPurchaseRequest, sumPurchaseRequests, validatePurchaseRequest } from '../services/approvalService.js';
import { PRIORITY, PR_CATEGORY, PR_STATUS, prPermissions, prPriority, prSummary } from '../utils/approvalFormat.js';

const PAGE_SIZE = 10;
const STATUS_TABS = [
  { value: 'submitted', label: 'Antrean Admin' },
  { value: 'waiting_finance_approval', label: 'Menunggu Finance' },
  { value: 'rejected_by_admin', label: 'Ditolak Admin' },
  { value: 'approved', label: 'Disetujui' },
  { value: '', label: 'Semua' },
];

/** Antrean purchase request Divisi Alat yang menunggu validasi Admin (API). */
export default function PurchaseRequestQueue({ initialNotice }) {
  const [status, setStatus] = useState('submitted');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState({ key: null, data: [], total: 0, totalPages: 1, error: '' });
  const [stats, setStats] = useState({ count: null, total: null, at: null });
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });
  const perms = prPermissions();
  const isOwnRequest = (pr) => Boolean(pr.requestedBy?.id && pr.requestedBy.id === perms.userId);
  const priorityClass = (pr) => PRIORITY[prPriority(pr)].className;
  const priorityLabel = (pr) => PRIORITY[prPriority(pr)].label;
  const requestKey = `${status}|${category}|${search}|${page}|${reloadKey}`;
  const loading = result.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    // Pencarian ditunda sedikit supaya tidak memanggil API setiap ketukan.
    const timer = window.setTimeout(() => {
      listPurchaseRequests({ page, limit: PAGE_SIZE, status, orderCategory: category, search: search.trim() })
        .then((response) => { if (!cancelled) setResult({ key: requestKey, data: response.data || [], total: response.total || 0, totalPages: Math.max(1, response.totalPages || 1), error: '' }); })
        .catch((error) => { if (!cancelled) setResult({ key: requestKey, data: [], total: 0, totalPages: 1, error: error.message }); });
    }, search ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [category, page, requestKey, search, status]);

  useEffect(() => {
    let cancelled = false;
    sumPurchaseRequests('submitted')
      .then((sum) => { if (!cancelled) setStats({ ...sum, at: new Date().toISOString() }); })
      .catch(() => { if (!cancelled) setStats({ count: null, total: null, at: new Date().toISOString() }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // 409 = order sudah diproses user lain: tampilkan pesannya lalu muat ulang antrean.
  const handleConflict = (error) => {
    setNotice({ tone: 'error', text: error.message });
    if (error.status === 409) setReloadKey((key) => key + 1);
  };

  const approve = async (pr) => {
    if (!window.confirm(`Validasi ${pr.requestCode} senilai ${formatCurrency(pr.totalEstimatedAmount)}? Order diteruskan ke Finance untuk pencairan.`)) return;
    setBusyId(pr.id);
    setNotice({ tone: 'success', text: '' });
    try {
      await validatePurchaseRequest(pr.id);
      setNotice({ tone: 'success', text: `${pr.requestCode} divalidasi dan diteruskan ke Finance.` });
      setReloadKey((key) => key + 1);
    } catch (error) {
      handleConflict(error);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (pr, notes) => {
    try {
      await rejectPurchaseRequest(pr.id, notes);
    } catch (error) {
      if (error.status !== 409) throw error;
      setRejectingId(null);
      handleConflict(error);
      return;
    }
    setRejectingId(null);
    setNotice({ tone: 'success', text: `${pr.requestCode} ditolak. Alasannya terlihat oleh Divisi Alat.` });
    setReloadKey((key) => key + 1);
  };

  const changeFilter = (setter) => (value) => { setter(value); setPage(1); };

  return (
    <>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatTile label="Total Antrean PO Pending" value={stats.count ?? '…'} hint="Membutuhkan validasi Admin" icon="📋" tone="amber" />
        <StatTile label="Nilai Estimasi Antrean" value={stats.total === null ? '…' : formatCurrency(stats.total)} hint="Akumulasi order menunggu Admin" icon="💰" />
        <StatTile label="Update Terakhir" value={stats.at ? formatDateTime(stats.at) : '…'} hint="Data langsung dari Divisi Alat" icon="🕘" />
      </div>

      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      {!perms.canValidate && (
        <Notice tone="warning">Akun ini tidak memegang <b>purchase-request:validate</b>, jadi tombol Approve/Reject nonaktif. Validasi PO butuh wewenang Admin — super_admin hanya memantau.</Notice>
      )}

      <section className="card-panel overflow-hidden" aria-label="Antrean purchase request">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Data Antrean PO</h2>
          <div className="flex flex-wrap gap-2">
            <input value={search} onChange={(event) => changeFilter(setSearch)(event.target.value)} className="input-control h-9 w-48 text-xs" placeholder="Cari order code..." aria-label="Cari order code" />
            <select value={category} onChange={(event) => changeFilter(setCategory)(event.target.value)} className="input-control h-9 w-40 text-xs" aria-label="Filter kategori">
              <option value="">Semua kategori</option>
              {Object.entries(PR_CATEGORY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
        <div className="border-b border-slate-200 px-5 py-3">
          <FilterChips options={STATUS_TABS} value={status} onChange={changeFilter(setStatus)} />
        </div>

        <ResponsiveTable
          columns={[
            {
              key: 'orderCode',
              label: 'Order Code',
              primary: true,
              render: (pr) => <a href={`#/admin/approvals/po/${pr.id}`} className="font-mono text-sm font-bold text-emerald-700 hover:underline">{pr.requestCode}</a>,
              sub: (pr) => `${formatDate(pr.requestDate)} · ${PR_CATEGORY[pr.orderCategory]}`,
              badge: (pr) => <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${priorityClass(pr)}`}>{priorityLabel(pr)}</span>,
            },
            { key: 'unit', label: 'Unit Alat', render: (pr) => <span className="text-xs text-slate-700">{prSummary(pr).units.join(', ') || '-'}</span> },
            {
              key: 'items',
              label: 'Deskripsi Item',
              render: (pr) => {
                const summary = prSummary(pr);
                return (
                  <span className="block max-w-56 truncate text-xs text-slate-700" title={summary.lines.join(', ')}>
                    {summary.lines[0] || '-'}{summary.lines.length > 1 ? ` +${summary.lines.length - 1}` : ''}
                  </span>
                );
              },
            },
            { key: 'total', label: 'Nominal Estimasi', align: 'right', render: (pr) => <span className="font-mono font-semibold text-slate-900">{formatCurrency(pr.totalEstimatedAmount)}</span> },
            {
              key: 'action',
              label: 'Aksi',
              align: 'right',
              render: (pr) => (pr.status === 'submitted' ? (
                <DecisionButtons
                  busy={busyId === pr.id}
                  disabled={busyId !== null || rejectingId === pr.id || isOwnRequest(pr)}
                  onApprove={perms.canValidate ? () => approve(pr) : null}
                  onReject={perms.canReject ? () => setRejectingId(pr.id) : null}
                  approveTitle={isOwnRequest(pr) ? 'Tidak bisa memvalidasi order sendiri' : 'Validasi & teruskan ke Finance'}
                  rejectTitle={isOwnRequest(pr) ? 'Tidak bisa menolak order sendiri' : 'Tolak order'}
                />
              ) : <StatusBadge status={pr.status} map={PR_STATUS} />),
            },
          ]}
          rows={result.data}
          rowKey={(pr) => pr.id}
          loading={loading}
          loadingText="Memuat antrean PO..."
          error={result.error}
          empty={status === 'submitted' ? 'Tidak ada PO yang menunggu validasi. 🎉' : 'Tidak ada data.'}
          expandedRow={(pr) => (rejectingId === pr.id ? (
            <RejectReasonForm
              label={`Alasan penolakan ${pr.requestCode}`}
              submitLabel="Tolak Order"
              placeholder="Contoh: Harga sparepart terlalu tinggi, minta pembanding"
              onSubmit={(notes) => reject(pr, notes)}
              onCancel={() => setRejectingId(null)}
            />
          ) : null)}
        />
        <Pager page={page} totalPages={result.totalPages} total={result.total} shown={result.data.length} onChange={setPage} label="purchase request" />
      </section>
    </>
  );
}
