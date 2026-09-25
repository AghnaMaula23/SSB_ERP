import { useEffect, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import { formatRupiah, getEquipmentUnitOptions, UNIT_OPTIONS } from '../services/kasService.js';
import { createIncomeClaim } from '../services/incomeClaimService.js';

function todayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

export default function KasClaimPendapatanPage({ onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [project, setProject] = useState('Project Nickel Mining Morowali');
  const [subProject, setSubProject] = useState('Land Clearing Pit Alpha');
  const [clientName, setClientName] = useState('PT Halmahera Utama');
  const [date, setDate] = useState(todayDate);
  const [unitOptions, setUnitOptions] = useState(UNIT_OPTIONS);

  const [equipments, setEquipments] = useState([
    { id: 1, unitAlat: 'Bulldozer01', hours: 45, rate: 350000 },
    { id: 2, unitAlat: 'Excavator-PC200', hours: 60, rate: 400000 },
  ]);

  const [materials, setMaterials] = useState([
    { id: 1, name: 'Solar HSD (Operasional)', qty: 500, unit: 'Liter', rate: 17000 },
  ]);

  useEffect(() => {
    getEquipmentUnitOptions().then((options) => {
      setUnitOptions(options);
      setEquipments((current) => current.map((item) => (
        options.includes(item.unitAlat) ? item : { ...item, unitAlat: options[0] || item.unitAlat }
      )));
    });
  }, []);

  const navigate = (route) => { window.location.hash = `/${route}`; };

  // Equipment helpers
  const addEquipmentRow = () => {
    setEquipments((prev) => [
      ...prev,
      { id: Date.now(), unitAlat: unitOptions[0] || 'Bulldozer01', hours: 0, rate: 0 },
    ]);
  };

  const removeEquipmentRow = (id) => {
    setEquipments((prev) => prev.filter((item) => item.id !== id));
  };

  const updateEquipment = (id, field, value) => {
    setEquipments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // Material helpers
  const addMaterialRow = () => {
    setMaterials((prev) => [
      ...prev,
      { id: Date.now(), name: '', qty: 0, unit: 'Pcs', rate: 0 },
    ]);
  };

  const removeMaterialRow = (id) => {
    setMaterials((prev) => prev.filter((item) => item.id !== id));
  };

  const updateMaterial = (id, field, value) => {
    setMaterials((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // Calculations
  const equipmentTotal = equipments.reduce(
    (sum, eq) => sum + (Number(eq.hours) || 0) * (Number(eq.rate) || 0),
    0
  );
  const materialTotal = materials.reduce(
    (sum, mat) => sum + (Number(mat.qty) || 0) * (Number(mat.rate) || 0),
    0
  );
  const grandTotal = equipmentTotal + materialTotal;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (grandTotal <= 0) {
      setError('Total estimasi pendapatan harus lebih besar dari 0.');
      return;
    }

    setSaving(true);
    try {
      const claim = createIncomeClaim({
        date,
        project,
        subProject,
        clientName,
        equipment: equipments,
        materials,
        totalAmount: grandTotal,
      });
      sessionStorage.setItem('kas-notice', `${claim.claimCode} tersimpan sebagai claim pending. Cash-in menunggu approval modul finance.`);
      navigate('alat/kas');
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
        activeRoute="alat/kas"
        onToggle={() => setCollapsed((v) => { const n = !v; localStorage.setItem('alat-sidebar-collapsed', String(n)); return n; })}
        onClose={() => setMobileSidebarOpen(false)}
        onBackToModules={onBackToModules}
        onSignOut={onSignOut}
      />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((v) => !v)} />

      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">

          {/* Breadcrumb */}
          <nav className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Divisi Alat</span>
            <span>/</span>
            <a href="#/alat/kas" className="hover:text-teal-700 transition-colors">Kas</a>
            <span>/</span>
            <span className="text-slate-900 font-semibold">Claim Pendapatan</span>
          </nav>

          {/* Header & Estimasi Summary Card */}
          <div className="mb-6 grid gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Claim Pendapatan Project</h1>
              <p className="mt-1 text-xs text-slate-500">Form klaim pendapatan sewa unit & operasional untuk Kas Alat</p>
               <p className="mt-1 text-xs text-amber-700">Mode demo: endpoint income claim belum tersedia, sehingga claim ini belum menjadi transaksi cash-in database.</p>
            </div>
            <div className="flex items-center rounded-xl bg-amber-500 p-4 text-white shadow-sm min-w-[260px]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-100">Estimasi Total Pendapatan</p>
                <p className="mt-1 text-2xl font-extrabold">Rp {formatRupiah(grandTotal)}</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Detail Pekerjaan */}
            <div className="card-panel p-6">
              <h2 className="mb-4 text-sm font-bold text-teal-800">Detail Pekerjaan & Client</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="req-project" className="block text-xs font-semibold text-slate-600">Project / Site</label>
                  <input id="req-project" value={project} onChange={(e) => setProject(e.target.value)} className="input-control mt-1 text-xs" />
                </div>
                <div>
                  <label htmlFor="req-subproject" className="block text-xs font-semibold text-slate-600">Sub-Project / Activity</label>
                  <input id="req-subproject" value={subProject} onChange={(e) => setSubProject(e.target.value)} className="input-control mt-1 text-xs" />
                </div>
                <div>
                  <label htmlFor="req-client" className="block text-xs font-semibold text-slate-600">Nama Client / Vendor</label>
                  <input id="req-client" value={clientName} onChange={(e) => setClientName(e.target.value)} className="input-control mt-1 text-xs" />
                </div>
                <div>
                  <label htmlFor="req-date" className="block text-xs font-semibold text-slate-600">Tanggal Pengajuan</label>
                  <input id="req-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-control mt-1 text-xs" />
                </div>
              </div>
            </div>

            {/* Sewa Unit Alat */}
            <div className="card-panel p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-teal-800">Rincian Sewa Unit Alat</h2>
                <button type="button" onClick={addEquipmentRow} className="btn btn-secondary text-xs">
                  + Tambah Baris Alat
                </button>
              </div>

              <div className="space-y-3">
                {equipments.map((eq) => {
                  const sub = (Number(eq.hours) || 0) * (Number(eq.rate) || 0);
                  return (
                    <div key={eq.id} className="grid items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1.5fr_1fr_1.2fr_1.2fr_auto]">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">Unit Alat</label>
                        <select
                          value={eq.unitAlat}
                          onChange={(e) => updateEquipment(eq.id, 'unitAlat', e.target.value)}
                          className="input-control mt-1 text-xs"
                        >
                          {unitOptions.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">Jam Kerja (Jam)</label>
                        <input
                          type="number"
                          min="0"
                          value={eq.hours}
                          onChange={(e) => updateEquipment(eq.id, 'hours', e.target.value)}
                          className="input-control mt-1 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">Tarif/Jam (Rp)</label>
                        <input
                          type="number"
                          min="0"
                          value={eq.rate}
                          onChange={(e) => updateEquipment(eq.id, 'rate', e.target.value)}
                          className="input-control mt-1 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">Subtotal</label>
                        <div className="mt-2 text-xs font-bold text-slate-800">Rp {formatRupiah(sub)}</div>
                      </div>
                      {equipments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEquipmentRow(eq.id)}
                          className="mt-4 flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:bg-red-100"
                          title="Hapus baris"
                        >🗑️</button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-right text-xs font-semibold text-slate-600">
                Subtotal Sewa Alat: <span className="font-bold text-teal-800">Rp {formatRupiah(equipmentTotal)}</span>
              </div>
            </div>

            {/* Material & Operasional */}
            <div className="card-panel p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-teal-800">Rincian Material & Operasional</h2>
                <button type="button" onClick={addMaterialRow} className="btn btn-secondary text-xs">
                  + Tambah Baris Material
                </button>
              </div>

              <div className="space-y-3">
                {materials.map((mat) => {
                  const sub = (Number(mat.qty) || 0) * (Number(mat.rate) || 0);
                  return (
                    <div key={mat.id} className="grid items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1.5fr_0.8fr_0.8fr_1.2fr_1.2fr_auto]">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">Item Material</label>
                        <input
                          value={mat.name}
                          onChange={(e) => updateMaterial(mat.id, 'name', e.target.value)}
                          className="input-control mt-1 text-xs"
                          placeholder="Nama item"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">Jumlah</label>
                        <input
                          type="number"
                          min="0"
                          value={mat.qty}
                          onChange={(e) => updateMaterial(mat.id, 'qty', e.target.value)}
                          className="input-control mt-1 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">Satuan</label>
                        <input
                          value={mat.unit}
                          onChange={(e) => updateMaterial(mat.id, 'unit', e.target.value)}
                          className="input-control mt-1 text-xs"
                          placeholder="Liter, Pcs, dll"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">Harga Satuan (Rp)</label>
                        <input
                          type="number"
                          min="0"
                          value={mat.rate}
                          onChange={(e) => updateMaterial(mat.id, 'rate', e.target.value)}
                          className="input-control mt-1 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">Subtotal</label>
                        <div className="mt-2 text-xs font-bold text-slate-800">Rp {formatRupiah(sub)}</div>
                      </div>
                      {materials.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMaterialRow(mat.id)}
                          className="mt-4 flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:bg-red-100"
                          title="Hapus baris"
                        >🗑️</button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-right text-xs font-semibold text-slate-600">
                Subtotal Material: <span className="font-bold text-teal-800">Rp {formatRupiah(materialTotal)}</span>
              </div>
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => navigate('alat/kas')} className="btn btn-secondary">
                Batal
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? 'Mengajukan...' : '▷ Submit Claim Pendapatan'}
              </button>
            </div>

          </form>

        </div>
      </main>
    </div>
  );
}
