import { useCallback, useEffect, useMemo, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import { downloadCsv } from '../../../utils/csv.js';
import {
  MANUAL_SOURCE_TYPES,
  TRANSACTION_TYPES,
  createCashTransaction,
  getCashCategories,
  getCashSummary,
  getCashTransactions,
  sourceLabel,
  voidCashTransaction,
} from '../services/cashService.js';
import { recordActivity } from '../../../services/activityLogService.js';
import { hasPermission } from '../../../services/permissions.js';

const PAGE_SIZE = 8;

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value || 0));
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  transactionType: 'cash_out',
  categoryId: '',
  sourceType: 'manual_expense',
  nominal: '',
  description: '',
});

export default function KasPage({ onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [summary, setSummary] = useState({ balance: 0, totalIn: 0, totalOut: 0, period: { totalIn: 0, totalOut: 0, net: 0 } });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchJournal, setSearchJournal] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(() => sessionStorage.getItem('kas-notice') || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [form, setForm] = useState(emptyForm);
  const canCreate = hasPermission('cash:create');
  const canUpdate = hasPermission('cash:update');

  const navigate = (route) => { window.location.hash = `/${route}`; };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryResult, transactionResult, categoryRows] = await Promise.all([
        getCashSummary(),
        getCashTransactions({
          page,
          limit: PAGE_SIZE,
          transactionType: filterType === 'all' ? '' : filterType,
          categoryId: filterCategory === 'all' ? '' : filterCategory,
          search: searchJournal || '',
          includeVoided: true,
        }),
        getCashCategories(),
      ]);
      setSummary(summaryResult);
      setRows(transactionResult.data);
      setTotal(transactionResult.total);
      setCategories(categoryRows);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterType, page, searchJournal]);

  useEffect(() => {
    const timeout = window.setTimeout(loadData, 300);
    return () => window.clearTimeout(timeout);
  }, [loadData]);

  useEffect(() => { sessionStorage.removeItem('kas-notice'); }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formCategories = useMemo(
    () => categories.filter((category) => category.isActive && category.transactionType === form.transactionType),
    [categories, form.transactionType],
  );

  const updateForm = (field) => (event) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, [field]: value, ...(field === 'transactionType' ? { categoryId: '' } : {}) }));
    setError('');
  };

  const handleSaveTransaction = async (event) => {
    event.preventDefault();
    if (!canCreate) { setError('Anda tidak memiliki izin cash:create.'); return; }
    if (!form.categoryId) { setError('Pilih kategori kas.'); return; }
    if (!form.nominal || Number(form.nominal) <= 0) { setError('Nominal harus lebih dari 0.'); return; }
    if (!form.description.trim()) { setError('Keterangan wajib diisi — tanpa itu baris kas tidak bisa ditelusuri.'); return; }

    setSaving(true);
    setError('');
    try {
      const created = await createCashTransaction(form);
      recordActivity({
        module: 'Kas',
        action: form.transactionType === 'cash_in' ? 'Kas masuk dicatat' : 'Kas keluar dicatat',
        description: `${created.transactionCode} · ${created.category} · Rp ${formatRupiah(created.nominal)}`,
        ref: 'alat/kas',
      });
      setNotice(`${created.transactionCode} berhasil disimpan.`);
      setForm(emptyForm());
      setPage(1);
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async (event) => {
    event.preventDefault();
    if (!voidReason.trim()) { setError('Alasan pembatalan wajib diisi.'); return; }
    try {
      await voidCashTransaction(voidTarget.id, voidReason.trim());
      setNotice(`${voidTarget.transactionCode} dibatalkan (void). Barisnya tetap tersimpan sebagai riwayat.`);
      setVoidTarget(null);
      setVoidReason('');
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleExport = () => {
    downloadCsv('kas-journal.csv', rows, [
      { label: 'Transaction Code', value: (row) => row.transactionCode },
      { label: 'Date', value: (row) => row.date },
      { label: 'Tipe', value: (row) => row.transactionType },
      { label: 'Kategori', value: (row) => row.category },
      { label: 'Sumber', value: (row) => sourceLabel(row.source) },
      { label: 'Source ID', value: (row) => row.sourceId || '' },
      { label: 'Keterangan', value: (row) => row.description },
      { label: 'Nominal', value: (row) => row.nominal },
      { label: 'Voided', value: (row) => (row.isVoided ? 'ya' : 'tidak') },
    ]);
    setNotice('Data jurnal berhasil di-export.');
  };

  const journalRows = (variant) => rows.map((row, idx) => (variant === 'mobile' ? (
    <tr key={row.id} className={row.isVoided ? 'opacity-50' : ''}>
      <td className="text-center font-mono text-xs font-semibold text-slate-400">{String((page - 1) * PAGE_SIZE + idx + 1).padStart(2, '0')}</td>
      <td>
        <div className="flex items-start gap-2.5">
          <span className={`mt-0.5 h-8 w-1 shrink-0 rounded-full ${row.type === 'masuk' ? 'bg-emerald-400' : 'bg-orange-400'}`} aria-hidden="true" />
          <div className="min-w-0 max-w-[13rem]">
            <p className="truncate text-xs font-semibold text-slate-900">{row.description}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{formatDate(row.date)} · {row.category}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{row.transactionCode} · {sourceLabel(row.source)}</p>
            {row.isVoided && <span className="mt-0.5 inline-block rounded bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-600">VOID</span>}
          </div>
        </div>
      </td>
      <td className={`whitespace-nowrap text-right text-xs font-semibold ${row.type === 'masuk' ? 'text-emerald-600' : 'text-red-600'}`}>
        {row.type === 'masuk' ? '+' : '-'} {formatRupiah(row.nominal)}
      </td>
      <td className="text-center">
        {!row.isSystemGenerated && !row.isVoided ? (
          <button type="button" onClick={() => setVoidTarget(row)} aria-label={`Batalkan transaksi ${row.transactionCode}`} title="Batalkan transaksi (void)" className="flex h-7 w-7 items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-600">🗑</button>
        ) : <span className="text-[11px] text-slate-400">—</span>}
      </td>
    </tr>
  ) : (
    <tr key={row.id} className={row.isVoided ? 'opacity-50' : ''}>
      <td className="text-center text-xs font-medium text-slate-500">{String((page - 1) * PAGE_SIZE + idx + 1).padStart(2, '0')}</td>
      <td className="font-mono text-[11px] whitespace-nowrap text-slate-600">{row.transactionCode}</td>
      <td className="text-xs whitespace-nowrap">{formatDate(row.date)}</td>
      <td className="text-xs">
        <span className="font-medium">{sourceLabel(row.source)}</span>
        {row.sourceId && <span className="block font-mono text-[10px] text-slate-400">{row.sourceId}</span>}
        {row.isSystemGenerated && <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500">otomatis</span>}
      </td>
      <td className="text-center">
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${row.type === 'masuk' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
          {row.type === 'masuk' ? 'MASUK' : 'KELUAR'}
        </span>
      </td>
      <td className="text-xs">{row.category}</td>
      <td className="text-xs">
        {row.description}
        {row.isVoided && <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">VOID — {row.voidReason}</span>}
      </td>
      <td className={`text-right text-xs font-semibold ${row.type === 'masuk' ? 'text-emerald-600' : 'text-red-600'}`}>
        {row.type === 'masuk' ? '+' : '-'} {formatRupiah(row.nominal)}
      </td>
      <td className="text-center">
        {!row.isSystemGenerated && !row.isVoided ? (
          <button
            type="button"
            onClick={() => setVoidTarget(row)}
            disabled={!canUpdate}
            aria-label={`Batalkan transaksi ${row.transactionCode}`}
            title={canUpdate ? 'Batalkan transaksi (void)' : 'Anda tidak memiliki izin cash:update'}
            className="flex h-7 w-7 items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
          >🗑</button>
        ) : <span className="text-[11px] text-slate-400">—</span>}
      </td>
    </tr>
  )));

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar
        collapsed={collapsed}
        mobileOpen={mobileSidebarOpen}
        activeRoute="alat/kas"
        onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })}
        onClose={() => setMobileSidebarOpen(false)}
        onBackToModules={onBackToModules}
        onSignOut={onSignOut}
      />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />

      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6">
            <nav className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>Divisi Alat</span><span>/</span><span className="text-slate-900 font-semibold">Kas</span>
            </nav>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Kas Alat</h1>
            <p className="mt-1 text-xs text-slate-500">Cash-in dari klaim pendapatan, cash-out dari purchase request yang disetujui Finance.</p>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <article className="flex items-center justify-between rounded-xl bg-gradient-to-br from-teal-800 to-teal-900 p-5 text-white shadow-md">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-200">Saldo Kas Alat</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight">Rp {formatRupiah(summary.balance)}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-lg">💰</div>
            </article>
            <article className="card-panel flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-semibold text-slate-500">Total Pemasukan</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-emerald-600">+ Rp {formatRupiah(summary.totalIn)}</p>
                <div className="mt-2 h-1 w-16 rounded-full bg-emerald-500" />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-lg">📈</div>
            </article>
            <article className="card-panel flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-semibold text-slate-500">Total Pengeluaran</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-red-600">- Rp {formatRupiah(summary.totalOut)}</p>
                <div className="mt-2 h-1 w-16 rounded-full bg-red-500" />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-lg">📉</div>
            </article>
          </div>

          {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div>}
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}

          <section className="card-panel mb-6 p-5" aria-label="Input Kas Manual">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Input Kas Manual</h2>
                <p className="mt-1 text-xs text-slate-500">Kategori dan sumber mengikuti master kategori kas dari server.</p>
              </div>
              <button type="button" onClick={() => navigate('alat/kas/claim-pendapatan')} className="btn btn-primary text-xs">Claim Pendapatan ⊕</button>
            </div>

            <form onSubmit={handleSaveTransaction}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label htmlFor="kas-date" className="block text-xs font-semibold text-slate-600">Tanggal Transaksi</label>
                  <input id="kas-date" type="date" value={form.date} onChange={updateForm('date')} className="input-control mt-1 text-xs" />
                </div>
                <div>
                  <label htmlFor="kas-type" className="block text-xs font-semibold text-slate-600">Jenis Transaksi</label>
                  <select id="kas-type" value={form.transactionType} onChange={updateForm('transactionType')} className="input-control mt-1 text-xs">
                    {TRANSACTION_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="kas-category" className="block text-xs font-semibold text-slate-600">Kategori Kas</label>
                  <select id="kas-category" value={form.categoryId} onChange={updateForm('categoryId')} required className="input-control mt-1 text-xs">
                    <option value="">Pilih kategori...</option>
                    {formCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="kas-source" className="block text-xs font-semibold text-slate-600">Sumber</label>
                  <select id="kas-source" value={form.sourceType} onChange={updateForm('sourceType')} className="input-control mt-1 text-xs">
                    {MANUAL_SOURCE_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">Transaksi dari purchase request &amp; klaim pendapatan dibuat sistem.</p>
                </div>
                <div>
                  <label htmlFor="kas-nominal" className="block text-xs font-semibold text-slate-600">Nominal (Rp)</label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                    <input id="kas-nominal" type="number" min="1" value={form.nominal} onChange={updateForm('nominal')} className="input-control pl-8 text-xs" placeholder="0" />
                  </div>
                </div>
                <div>
                  <label htmlFor="kas-desc" className="block text-xs font-semibold text-slate-600">Keterangan</label>
                  <input id="kas-desc" value={form.description} onChange={updateForm('description')} className="input-control mt-1 text-xs" placeholder="Keterangan transaksi..." />
                </div>
              </div>
              <button type="submit" disabled={saving || !canCreate} className="btn btn-primary mt-4 w-full text-sm">
                {saving ? 'Menyimpan...' : '💾 Simpan Transaksi Kas'}
              </button>
              {!canCreate && <p className="mt-2 text-xs text-amber-700">Anda tidak memiliki izin cash:create.</p>}
            </form>
          </section>

          {voidTarget && (
            <form onSubmit={handleVoid} className="card-panel mb-6 border-red-200 p-5">
              <h2 className="text-sm font-bold text-slate-900">Batalkan transaksi {voidTarget.transactionCode}</h2>
              <p className="mt-1 text-xs text-slate-500">Transaksi tidak dihapus, tapi ditandai void agar saldo dan jejaknya tetap terbaca.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label htmlFor="void-reason" className="block text-xs font-semibold text-slate-600">Alasan Pembatalan *</label>
                  <input id="void-reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} className="input-control mt-1 text-xs" placeholder="Contoh: salah input nominal" />
                </div>
                <button type="submit" className="btn btn-primary text-xs">Simpan Pembatalan</button>
                <button type="button" onClick={() => { setVoidTarget(null); setVoidReason(''); }} className="btn btn-secondary text-xs">Batal</button>
              </div>
            </form>
          )}

          <section aria-label="Jurnal Mutasi Kas">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-bold text-slate-900">Jurnal Mutasi Kas Alat</h2>
              <div className="grid w-full grid-cols-[1fr_1fr_auto] items-center gap-2 sm:flex sm:w-auto sm:flex-nowrap">
                <div className="relative col-span-3 sm:col-span-1 sm:w-72">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span>
                  <input value={searchJournal} onChange={(event) => { setSearchJournal(event.target.value); setPage(1); }} className="input-control w-full pl-8 text-xs" placeholder="Search journal..." />
                </div>
                <select value={filterType} onChange={(event) => { setFilterType(event.target.value); setPage(1); }} className="input-control w-full text-xs sm:w-28">
                  <option value="all">Semua Jenis</option>
                  {TRANSACTION_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select value={filterCategory} onChange={(event) => { setFilterCategory(event.target.value); setPage(1); }} className="input-control w-full text-xs sm:w-40">
                  <option value="all">Semua Kategori</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <button type="button" onClick={handleExport} className="btn btn-ghost px-2.5 py-1 text-xs" title="Export">↓</button>
              </div>
            </div>

            <div className="table-container">
              <table className="table-modern hidden md:table">
                <thead>
                  <tr>
                    <th className="w-12 text-center">No</th>
                    <th>Kode</th>
                    <th>Tanggal</th>
                    <th>Sumber</th>
                    <th className="text-center">Jenis</th>
                    <th>Kategori</th>
                    <th>Keterangan</th>
                    <th className="text-right">Nominal (Rp)</th>
                    <th className="w-20 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 ? journalRows('desktop') : <tr><td colSpan={9} className="py-12 text-center text-sm text-slate-500">{loading ? 'Memuat jurnal...' : 'Tidak ada transaksi kas yang cocok dengan filter.'}</td></tr>}
                </tbody>
              </table>

              <table className="table-modern w-full table-fixed md:hidden">
                <thead>
                  <tr>
                    <th className="w-12 text-center">No</th>
                    <th>Transaksi</th>
                    <th className="w-28 text-right">Nominal</th>
                    <th className="w-14 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 ? journalRows('mobile') : <tr><td colSpan={4} className="py-10 text-center text-sm text-slate-500">{loading ? 'Memuat jurnal...' : 'Tidak ada transaksi kas yang cocok dengan filter.'}</td></tr>}
                </tbody>
              </table>

              <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <span>Menampilkan {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} dari {total} transaksi</span>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn btn-ghost px-2 py-1 text-xs">← Prev</button>
                  <span className="font-medium">{page} / {totalPages}</span>
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn btn-ghost px-2 py-1 text-xs">Next →</button>
                </div>
              </footer>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
