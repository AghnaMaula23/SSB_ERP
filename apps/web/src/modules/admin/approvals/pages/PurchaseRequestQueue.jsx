import { useEffect, useState } from 'react';
import { Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { formatCurrency, formatDate, formatDateTime } from '../../project/utils/projectFormat.js';
import { DecisionButtons, FilterChips, Pager, StatTile } from '../components/ApprovalUi.jsx';
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
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });
  const perms = prPermissions();
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

  const decide = async (pr, action) => {
    const confirmText = action === 'validate'
      ? `Validasi ${pr.requestCode} senilai ${formatCurrency(pr.totalEstimatedAmount)}? Order diteruskan ke Finance untuk pencairan.`
      : `Tolak ${pr.requestCode}? Status final. Sampaikan alasannya ke Divisi Alat di luar sistem — alasan belum bisa disimpan.`;
    if (!window.confirm(confirmText)) return;
    setBusyId(pr.id);
    setNotice({ tone: 'success', text: '' });
    try {
      if (action === 'validate') await validatePurchaseRequest(pr.id); else await rejectPurchaseRequest(pr.id);
      setNotice({ tone: 'success', text: action === 'validate' ? `${pr.requestCode} divalidasi dan diteruskan ke Finance.` : `${pr.requestCode} ditolak.` });
      setReloadKey((key) => key + 1);
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
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
        <Notice tone="warning">Akun ini tidak memegang <b>purchase-request:validate</b>, jadi tombol Approve/Reject nonaktif. Validasi PO hanya untuk role Admin — super_admin pun tidak di-bypass (keputusan 27 Sep 2026).</Notice>
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

        <div className="overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th className="w-12">No</th>
                <th>Tanggal</th>
                <th>Order Code</th>
                <th>Kategori</th>
                <th>Unit Alat</th>
                <th>Deskripsi Item</th>
                <th className="text-right">Nominal Estimasi</th>
                <th className="text-right">{status === 'submitted' ? 'Aksi' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">Memuat antrean PO...</td></tr>
              ) : result.error ? (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-red-600">{result.error}</td></tr>
              ) : result.data.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">{status === 'submitted' ? 'Tidak ada PO yang menunggu validasi. 🎉' : 'Tidak ada data.'}</td></tr>
              ) : result.data.map((pr, index) => {
                const summary = prSummary(pr);
                const priority = PRIORITY[prPriority(pr)];
                const own = pr.requestedBy?.id && pr.requestedBy.id === perms.userId;
                return (
                  <tr key={pr.id}>
                    <td className="text-xs text-slate-500">{String((page - 1) * PAGE_SIZE + index + 1).padStart(2, '0')}</td>
                    <td className="whitespace-nowrap text-xs">{formatDate(pr.requestDate)}</td>
                    <td><a href={`#/admin/approvals/po/${pr.id}`} className="font-mono text-sm font-bold text-emerald-700 hover:underline">{pr.requestCode}</a></td>
                    <td className="text-xs">{PR_CATEGORY[pr.orderCategory]}</td>
                    <td className="text-xs text-slate-700">{summary.units.join(', ') || '-'}</td>
                    <td className="max-w-56">
                      <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${priority.className}`}>{priority.label}</span>
                      <p className="mt-0.5 truncate text-xs text-slate-700" title={summary.lines.join(', ')}>{summary.lines[0] || '-'}{summary.lines.length > 1 ? ` +${summary.lines.length - 1}` : ''}</p>
                    </td>
                    <td className="text-right font-mono font-semibold text-slate-900">{formatCurrency(pr.totalEstimatedAmount)}</td>
                    <td className="text-right">
                      {pr.status === 'submitted' ? (
                        <DecisionButtons
                          busy={busyId === pr.id}
                          disabled={busyId !== null || own}
                          onApprove={perms.canValidate ? () => decide(pr, 'validate') : null}
                          onReject={perms.canReject ? () => decide(pr, 'reject') : null}
                          approveTitle={own ? 'Tidak bisa memvalidasi order sendiri' : 'Validasi & teruskan ke Finance'}
                          rejectTitle={own ? 'Tidak bisa menolak order sendiri' : 'Tolak order'}
                        />
                      ) : <StatusBadge status={pr.status} map={PR_STATUS} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={result.totalPages} total={result.total} shown={result.data.length} onChange={setPage} label="purchase request" />
      </section>
    </>
  );
}
