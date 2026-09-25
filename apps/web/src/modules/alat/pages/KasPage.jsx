import { useCallback, useEffect, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import { downloadCsv } from '../../../utils/csv.js';
import {
  getEquipmentUnitOptions,
  getKasSummary,
  getKasTransactions,
  createKasTransaction,
  deleteKasTransaction,
  TYPE_OPTIONS,
  CATEGORY_OPTIONS,
  UNIT_OPTIONS,
  categoryLabel,
  sourceLabel,
  formatRupiah,
} from '../services/kasService.js';

const PAGE_SIZE = 8;

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function KasPage({ onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [summary, setSummary] = useState({ saldo: 0, monthlyIncome: 0, monthlyExpense: 0 });
  const [rows, setRows] = useState([]);
  const [unitOptions, setUnitOptions] = useState(UNIT_OPTIONS);
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchJournal, setSearchJournal] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(() => sessionStorage.getItem('kas-notice') || '');
  const [error, setError] = useState('');

  // Inline form state
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'masuk',
    category: 'other',
    unitAlat: '',
    nominal: '',
    description: '',
  });

  const navigate = (route) => { window.location.hash = `/${route}`; };

  const loadData = useCallback(() => {
    try {
      setSummary(getKasSummary());
      setRows(getKasTransactions({ search: searchJournal, type: filterType, category: filterCategory }));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [filterCategory, filterType, searchJournal]);

  useEffect(() => {
    const timeout = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timeout);
  }, [loadData]);

  useEffect(() => {
    sessionStorage.removeItem('kas-notice');
  }, []);

  useEffect(() => {
    getEquipmentUnitOptions().then(setUnitOptions);
  }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const updateForm = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSaveTransaction = (e) => {
    e.preventDefault();
    setError('');
    if (!form.nominal || Number(form.nominal) <= 0) { setError('Nominal harus lebih dari 0.'); return; }
    if (!form.description.trim()) { setError('Catatan/keterangan wajib diisi.'); return; }

    try {
      createKasTransaction(form);
      setNotice('Transaksi kas berhasil disimpan.');
      setForm({ date: new Date().toISOString().slice(0, 10), type: 'masuk', category: 'other', unitAlat: '', nominal: '', description: '' });
      loadData();
      setPage(1);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = (item) => {
    if (!window.confirm(`Hapus transaksi ${item.transactionCode}?`)) return;
    try {
      deleteKasTransaction(item.id);
      setNotice(`${item.transactionCode} berhasil dihapus.`);
      loadData();
      if (page > 1 && visibleRows.length === 1) setPage(page - 1);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleExport = () => {
    downloadCsv('kas-journal-demo.csv', rows, [
      { label: 'Transaction Code', value: (row) => row.transactionCode },
      { label: 'Date', value: (row) => row.date },
      { label: 'Type', value: (row) => row.type },
      { label: 'Category', value: (row) => categoryLabel(row.category) },
      { label: 'Source', value: (row) => sourceLabel(row.source) },
      { label: 'Source ID', value: (row) => row.sourceId },
      { label: 'Unit', value: (row) => row.unitAlat },
      { label: 'Description', value: (row) => row.description },
      { label: 'Amount', value: (row) => row.nominal },
    ]);
    setNotice('Data jurnal berhasil di-export.');
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar
        collapsed={collapsed}
        mobileOpen={mobileSidebarOpen}
        activeRoute="alat/kas"
        onToggle={() => setCollapsed((v) => { const n = !v; localStorage.setItem('alat-sidebar-collapsed', String(n)); return n; })}
        onClose={() => setMobileSidebarOpen(false)}
        onBackToModules={onBackToModules}
        onSignOut={onSignOut}
      />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((v) => !v)} />

      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

          {/* Breadcrumb + title */}
          <div className="mb-6">
            <nav className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>Divisi Alat</span>
              <span>/</span>
              <span className="text-slate-900 font-semibold">Kas</span>
            </nav>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Kas Alat</h1>
             <p className="mt-1 text-xs text-amber-700">Mode demo: modul cash backend belum tersedia, sehingga jurnal ini belum tersimpan di database.</p>
             <p className="mt-1 text-xs text-slate-500">Cash-in otomatis berasal dari claim pendapatan; cash-out otomatis berasal dari purchase request. Input manual hanya untuk category Other.</p>
          </div>

          {/* Summary cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            {/* Saldo card – dark teal */}
            <article className="flex items-center justify-between rounded-xl bg-gradient-to-br from-teal-800 to-teal-900 p-5 text-white shadow-md">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-200">Sisa Saldo Kas Alat</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight">Rp {formatRupiah(summary.saldo)}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-lg">💰</div>
            </article>

            {/* Monthly income */}
            <article className="card-panel flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-semibold text-slate-500">Total Pemasukan Bulan Ini</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-emerald-600">+ Rp {formatRupiah(summary.monthlyIncome)}</p>
                <div className="mt-2 h-1 w-16 rounded-full bg-emerald-500" />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-lg">📈</div>
            </article>

            {/* Monthly expense */}
            <article className="card-panel flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-semibold text-slate-500">Total Pengeluaran Bulan Ini</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-red-600">- Rp {formatRupiah(summary.monthlyExpense)}</p>
                <div className="mt-2 h-1 w-16 rounded-full bg-red-500" />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-lg">📉</div>
            </article>
          </div>

          {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div>}
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

          {/* Kelola Kas Operasional */}
          <section className="card-panel mb-6 p-5" aria-label="Input Kas Operasional">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Kelola Kas Operasional</h2>
              <button type="button" onClick={() => navigate('alat/kas/claim-pendapatan')} className="btn btn-primary text-xs">
                Claim Pendapatan ⊕
              </button>
            </div>

            <form onSubmit={handleSaveTransaction}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label htmlFor="kas-date" className="block text-xs font-semibold text-slate-600">Tanggal Transaksi</label>
                  <input id="kas-date" type="date" value={form.date} onChange={updateForm('date')} className="input-control mt-1 text-xs" />
                </div>
                <div>
                  <label htmlFor="kas-type" className="block text-xs font-semibold text-slate-600">Jenis Transaksi</label>
                  <select id="kas-type" value={form.type} onChange={updateForm('type')} className="input-control mt-1 text-xs">
                    {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="kas-category" className="block text-xs font-semibold text-slate-600">Kategori</label>
                  <select id="kas-category" value="other" disabled className="input-control mt-1 text-xs bg-slate-100">
                    <option value="other">Other (input manual)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="kas-unit" className="block text-xs font-semibold text-slate-600">Unit Terkait</label>
                  <select id="kas-unit" value={form.unitAlat} onChange={updateForm('unitAlat')} className="input-control mt-1 text-xs">
                    <option value="">— Pilih unit —</option>
                    <option value="-">Tidak ada</option>
                    {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="kas-nominal" className="block text-xs font-semibold text-slate-600">Nominal (Rp)</label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                    <input
                      id="kas-nominal"
                      type="number"
                      min="0"
                      value={form.nominal}
                      onChange={updateForm('nominal')}
                      className="input-control pl-8 text-xs"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="kas-desc" className="block text-xs font-semibold text-slate-600">Catatan</label>
                  <input id="kas-desc" value={form.description} onChange={updateForm('description')} className="input-control mt-1 text-xs" placeholder="Masukkan keterangan transaksi..." />
                </div>
              </div>
              <button type="submit" className="btn btn-primary mt-4 w-full text-sm">
                💾 Simpan Transaksi Kas
              </button>
            </form>
          </section>

          {/* Journal table */}
          <section aria-label="Jurnal Mutasi Kas">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-bold text-slate-900">Jurnal Mutasi Kas Alat</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span>
                  <input
                    value={searchJournal}
                    onChange={(e) => { setSearchJournal(e.target.value); setPage(1); }}
                    className="input-control pl-8 text-xs"
                    placeholder="Search journal..."
                    style={{ width: 180 }}
                  />
                </div>
                <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }} className="input-control text-xs" style={{ width: 120 }}>
                  <option value="all">All Types</option>
                  {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }} className="input-control text-xs" style={{ width: 130 }}>
                  <option value="all">All Categories</option>
                  {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button type="button" onClick={handleExport} className="btn btn-ghost px-2 py-1 text-xs" title="Export">↓</button>
              </div>
            </div>

            <div className="table-container">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th className="w-12 text-center">No</th>
                    <th>Tanggal</th>
                    <th>Sumber</th>
                    <th>Unit Alat</th>
                    <th className="text-center">Jenis</th>
                    <th>Kategori</th>
                    <th>Keterangan</th>
                    <th className="text-right">Nominal (Rp)</th>
                    <th className="w-20 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length > 0 ? (
                    visibleRows.map((row, idx) => (
                      <tr key={row.id}>
                        <td className="text-center text-xs font-medium text-slate-500">
                          {String((page - 1) * PAGE_SIZE + idx + 1).padStart(2, '0')}
                        </td>
                        <td className="text-xs whitespace-nowrap">{formatDate(row.date)}</td>
                        <td className="text-xs">
                          <span className="font-medium">{sourceLabel(row.source)}</span>
                          {row.sourceId && <span className="block font-mono text-[10px] text-slate-400">{row.sourceId}</span>}
                        </td>
                        <td className="text-xs font-medium">{row.unitAlat}</td>
                        <td className="text-center">
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            row.type === 'masuk'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}>
                            {row.type === 'masuk' ? 'MASUK' : 'KELUAR'}
                          </span>
                        </td>
                        <td className="text-xs">{categoryLabel(row.category)}</td>
                        <td className="text-xs">{row.description}</td>
                        <td className={`text-right text-xs font-semibold ${row.type === 'masuk' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {row.type === 'masuk' ? '+' : '-'} {formatRupiah(row.nominal)}
                        </td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(row)}
                               disabled={row.source === 'income_claim' || row.source === 'purchase_request'}
                               title={row.source === 'manual' ? 'Delete manual transaction' : 'Transaksi otomatis tidak dapat dihapus'}
                              title={row.source === 'income_claim' || row.source === 'purchase_request' ? 'Transaksi otomatis tidak dapat dihapus' : 'Delete transaksi manual'}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-600"
                            >🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-sm text-slate-500">
                        Tidak ada transaksi kas yang cocok dengan filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <span>Showing {visibleRows.length} of {rows.length} transactions</span>
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
