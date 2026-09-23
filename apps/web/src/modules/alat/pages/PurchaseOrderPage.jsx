import { useEffect, useMemo, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import StatCard from '../components/StatCard.jsx';
import {
  getPurchaseOrders,
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
  categoryLabel,
  statusLabel,
  STATUS_OPTIONS,
} from '../services/purchaseOrderService.js';

const PAGE_SIZE = 8;

const statusStyles = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

function formatRupiah(num) {
  return new Intl.NumberFormat('id-ID').format(num);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PurchaseOrderPage({ onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadData = () => {
    try {
      const data = getPurchaseOrders({ search, status: statusFilter, startDate, endDate });
      setRows(data);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { loadData(); }, [search, statusFilter, startDate, endDate]);

  const navigate = (route) => { window.location.hash = `/${route}`; };

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pendingCount = useMemo(() => rows.filter((r) => r.status === 'pending').length, [rows]);
  const approvedCount = useMemo(() => rows.filter((r) => r.status === 'approved').length, [rows]);

  const handleDelete = (item) => {
    if (!window.confirm(`Hapus purchase order ${item.orderCode}?`)) return;
    try {
      deletePurchaseOrder(item.id);
      setNotice(`${item.orderCode} berhasil dihapus.`);
      loadData();
      if (page > 1 && visibleRows.length === 1) setPage(page - 1);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStatusChange = (item, newStatus) => {
    try {
      updatePurchaseOrderStatus(item.id, newStatus);
      setNotice(`${item.orderCode} status diubah ke ${statusLabel(newStatus)}.`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar
        collapsed={collapsed}
        mobileOpen={mobileSidebarOpen}
        activeRoute="alat/purchase-orders"
        onToggle={() => setCollapsed((v) => { const n = !v; localStorage.setItem('alat-sidebar-collapsed', String(n)); return n; })}
        onClose={() => setMobileSidebarOpen(false)}
        onBackToModules={onBackToModules}
        onSignOut={onSignOut}
      />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((v) => !v)} />

      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

          {/* Page header */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <nav className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>Divisi Alat</span>
                <span>/</span>
                <span className="text-slate-900 font-semibold">Purchase Order</span>
              </nav>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Purchase Orders</h1>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setNotice('Data PO berhasil di-export.')} className="btn btn-secondary text-xs">
                ↓ Export
              </button>
              <button type="button" onClick={() => navigate('alat/purchase-orders/create')} className="btn btn-primary text-xs">
                + Buat Pengajuan Baru
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Total Purchase Orders" value={rows.length} tone="blue" />
            <StatCard label="Pending Approval" value={pendingCount} tone="amber" />
            <StatCard label="Approved" value={approvedCount} tone="green" />
          </div>

          {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div>}
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

          {/* Filters */}
          <section className="card-panel mb-6 p-4" aria-label="Purchase Order Filters">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(130px,0.5fr)_minmax(130px,0.5fr)_minmax(130px,0.5fr)_auto] md:items-end">
              <div>
                <label htmlFor="po-search" className="block text-xs font-semibold text-slate-600">Search</label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span>
                  <input
                    id="po-search"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="input-control pl-8 text-xs"
                    placeholder="Search orders..."
                  />
                </div>
              </div>
              <div>
                <label htmlFor="po-start" className="block text-xs font-semibold text-slate-600">Start Date</label>
                <input id="po-start" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="input-control mt-1 text-xs" />
              </div>
              <div>
                <label htmlFor="po-end" className="block text-xs font-semibold text-slate-600">End Date</label>
                <input id="po-end" type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="input-control mt-1 text-xs" />
              </div>
              <div>
                <label htmlFor="po-status" className="block text-xs font-semibold text-slate-600">Status</label>
                <select id="po-status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="input-control mt-1 text-xs">
                  <option value="all">All Status</option>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <button type="button" onClick={resetFilters} className="btn btn-secondary py-2 text-xs">Reset</button>
            </div>
          </section>

          {/* Table */}
          <div className="table-container">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Order Code</th>
                  <th>Tanggal</th>
                  <th>Kategori Transaksi</th>
                  <th>Unit Alat</th>
                  <th>Deskripsi Item / Pekerjaan</th>
                  <th className="text-center">Qty</th>
                  <th className="text-right">Total Biaya (Rp)</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length > 0 ? (
                  visibleRows.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">{row.orderCode}</td>
                      <td className="text-xs whitespace-nowrap">{formatDate(row.date)}</td>
                      <td className="text-xs">{categoryLabel(row.category)}</td>
                      <td className="text-xs font-medium">{row.unitAlat}</td>
                      <td className="text-xs">{row.description}</td>
                      <td className="text-center text-xs">{row.quantity || '-'}</td>
                      <td className="text-right text-xs font-medium">{formatRupiah(row.totalPrice)}</td>
                      <td className="text-center">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase ${statusStyles[row.status] || ''}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {row.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(row, 'approved')}
                                title="Approve"
                                className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50"
                              >✓</button>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(row, 'rejected')}
                                title="Reject"
                                className="flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:bg-red-50"
                              >✕</button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => navigate(`alat/purchase-orders/${row.id}/edit`)}
                            title="Edit"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          >✏️</button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            title="Delete"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-600"
                          >🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-slate-500">
                      Tidak ada purchase order yang cocok dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <span>Showing {visibleRows.length} of {rows.length} orders</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn btn-ghost px-2 py-1 text-xs">← Prev</button>
                <span className="font-medium">{page} / {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn btn-ghost px-2 py-1 text-xs">Next →</button>
              </div>
            </footer>
          </div>

        </div>
      </main>
    </div>
  );
}
