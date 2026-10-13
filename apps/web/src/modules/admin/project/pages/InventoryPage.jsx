import { useEffect, useMemo, useState } from 'react';
import { Breadcrumb, MetricCard, MockBanner, Notice, PageHeader } from '../components/ProjectUi.jsx';
import { INVENTORY_CATEGORIES, listInventory } from '../services/fieldMockService.js';
import { formatDateTime, formatNumber, stageCrumbs } from '../utils/projectFormat.js';

const PAGE_SIZE = 8;

/** Stok material per tahapan — DATA CONTOH, menunggu modul Request Material. */
export default function InventoryPage({ project, stage, initialNotice }) {
  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(initialNotice || '');

  useEffect(() => {
    let cancelled = false;
    listInventory(stage.id).then((rows) => { if (!cancelled) setItems(rows); });
    return () => { cancelled = true; };
  }, [stage.id]);

  const rows = useMemo(() => items || [], [items]);
  const isLow = (item) => item.minStock > 0 && item.stock <= item.minStock;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((item) => (!query || `${item.itemName} ${item.category}`.toLowerCase().includes(query))
      && (!category || item.category === category)
      && (!lowOnly || isLow(item)));
  }, [category, lowOnly, rows, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const movementsToday = rows.reduce((sum, item) => sum + item.movements.filter((move) => move.createdAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length, 0);
  const base = `#/admin/projects/${project.id}/sub/${stage.id}/inventory`;

  return (
    <>
      <Breadcrumb items={stageCrumbs(project, stage, { label: 'Inventory' })} />
      <PageHeader
        title="Inventory Logistik"
        subtitle="Stok material dan bahan habis pakai di lokasi tahapan."
        actions={<a href={`${base}/new`} className="btn btn-primary text-xs">+ Tambah Barang</a>}
      />
      <MockBanner>Inventory belum punya API — tersimpan hanya di browser ini dan terhapus saat sign out. Akan disambungkan ke modul Request Material.</MockBanner>
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Items" value={rows.length} />
        <MetricCard label="Low Stock" value={String(rows.filter(isLow).length).padStart(2, '0')} tone={rows.some(isLow) ? 'red' : 'slate'} hint="Di bawah stok minimum" />
        <MetricCard label="Mutasi Hari Ini" value={movementsToday} tone="teal" accent />
        <MetricCard label="Kategori" value={new Set(rows.map((item) => item.category)).size} />
      </div>

      <section className="card-panel mb-4 p-4" aria-label="Filter inventory">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true">🔍</span>
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="input-control pl-8 text-xs" placeholder="Cari nama barang..." aria-label="Cari barang" />
          </div>
          <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className="input-control text-xs" aria-label="Filter kategori">
            <option value="">Semua kategori</option>
            {INVENTORY_CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <label className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-slate-600">
            <input type="checkbox" checked={lowOnly} onChange={(event) => { setLowOnly(event.target.checked); setPage(1); }} className="accent-teal-700" />
            Hanya stok rendah
          </label>
        </div>
      </section>

      <div className="table-container">
        <table className="table-modern">
          <thead>
            <tr>
              <th className="w-12 text-center">No</th>
              <th>Item Name</th>
              <th className="text-right">Stock</th>
              <th>Satuan</th>
              <th>Last Updated</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {!items ? (
              <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-500">Memuat inventory...</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-500">Tidak ada barang yang cocok.</td></tr>
            ) : visible.map((item, index) => (
              <tr key={item.id}>
                <td className="text-center text-xs text-slate-500">{String((currentPage - 1) * PAGE_SIZE + index + 1).padStart(2, '0')}</td>
                <td>
                  <p className="font-semibold text-slate-900">{item.itemName}</p>
                  <p className="text-[11px] uppercase text-slate-400">Cat: {item.category}</p>
                </td>
                <td className="text-right">
                  <span className={`font-mono font-semibold ${isLow(item) ? 'text-red-600' : 'text-slate-900'}`}>{formatNumber(item.stock)}</span>
                  {isLow(item) && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">LOW</span>}
                  {item.minStock > 0 && <p className="text-[10px] text-slate-400">min {formatNumber(item.minStock)}</p>}
                </td>
                <td className="text-xs text-slate-600">{item.unit}</td>
                <td className="text-xs text-slate-600">{formatDateTime(item.updatedAt)}</td>
                <td className="text-right">
                  <a href={`${base}/${item.id}/mutasi`} className="text-xs font-semibold text-teal-700 hover:underline">Catat Mutasi / Log</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <span>Menampilkan {visible.length} dari {filtered.length} item</span>
          <div className="flex items-center gap-1">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="btn btn-secondary px-2.5 py-1 text-xs" aria-label="Halaman sebelumnya">‹</button>
            <span className="px-2 font-medium">Hal {currentPage} / {pageCount}</span>
            <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="btn btn-secondary px-2.5 py-1 text-xs" aria-label="Halaman berikutnya">›</button>
          </div>
        </footer>
      </div>
    </>
  );
}
