import { useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import { createPurchaseOrder, CATEGORY_OPTIONS } from '../services/purchaseOrderService.js';

export default function PurchaseOrderCreatePage({ onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: 'service_rutin',
    unitAlat: '',
    description: '',
    quantity: '',
    unitPrice: '',
    notes: '',
  });

  const navigate = (route) => { window.location.hash = `/${route}`; };

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!form.description.trim()) { setError('Item / deskripsi pekerjaan wajib diisi.'); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { setError('Jumlah harus lebih dari 0.'); return; }
    if (!form.unitPrice || Number(form.unitPrice) <= 0) { setError('Harga harus lebih dari 0.'); return; }

    setSaving(true);
    try {
      createPurchaseOrder(form);
      navigate('alat/purchase-orders');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
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
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">

          {/* Breadcrumb */}
          <nav className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Divisi Alat</span>
            <span>/</span>
            <a href="#/alat/purchase-orders" className="hover:text-teal-700 transition-colors">Purchase Order</a>
            <span>/</span>
            <span className="text-slate-900 font-semibold">Buat Pengajuan Baru</span>
          </nav>

          <div className="card-panel p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-teal-800">Input Purchase Order Baru</h1>
              <p className="mt-1 text-xs text-slate-500">Resource Management Workflow</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Date */}
              <div>
                <label htmlFor="po-date" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Tanggal</label>
                <input id="po-date" type="date" value={form.date} onChange={update('date')} className="input-control mt-1" />
              </div>

              {/* Category toggle */}
              <div>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  {CATEGORY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, category: opt.value }))}
                      className={`flex-1 px-4 py-2.5 text-sm font-semibold transition ${
                        form.category === opt.value
                          ? 'bg-teal-50 text-teal-800 border-b-2 border-teal-600'
                          : 'bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                      }`}
                    >
                      {opt.value === 'service_rutin' ? '🔧' : '📦'} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Item */}
              <div>
                <label htmlFor="po-item" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Item</label>
                <input
                  id="po-item"
                  value={form.description}
                  onChange={update('description')}
                  className="input-control mt-1"
                  placeholder="Contoh: Excavator PC200"
                />
              </div>

              {/* Unit Alat */}
              <div>
                <label htmlFor="po-unit" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Unit Alat</label>
                <input
                  id="po-unit"
                  value={form.unitAlat}
                  onChange={update('unitAlat')}
                  className="input-control mt-1"
                  placeholder="Contoh: Bulldozer-02"
                />
              </div>

              {/* Jumlah + Harga */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="po-qty" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Jumlah</label>
                  <input
                    id="po-qty"
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={update('quantity')}
                    className="input-control mt-1"
                    placeholder="Contoh: 2"
                  />
                </div>
                <div>
                  <label htmlFor="po-price" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Harga</label>
                  <input
                    id="po-price"
                    type="number"
                    min="0"
                    value={form.unitPrice}
                    onChange={update('unitPrice')}
                    className="input-control mt-1"
                    placeholder="Contoh: 200000"
                  />
                </div>
              </div>

              {/* Keterangan */}
              <div>
                <label htmlFor="po-notes" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Keterangan</label>
                <textarea
                  id="po-notes"
                  rows={4}
                  value={form.notes}
                  onChange={update('notes')}
                  className="input-control mt-1 resize-none"
                  style={{ height: 'auto' }}
                  placeholder="Deskripsikan detail kerusakan teknis..."
                />
              </div>

              {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => navigate('alat/purchase-orders')} className="btn btn-secondary">
                  Batal
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Mengirim...' : '▷ Kirim Permintaan PO'}
                </button>
              </div>
            </form>
          </div>

        </div>
      </main>
    </div>
  );
}
