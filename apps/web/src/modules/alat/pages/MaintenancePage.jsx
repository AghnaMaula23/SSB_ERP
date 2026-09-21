import { useEffect, useMemo, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ResetMaintenanceModal from '../components/ResetMaintenanceModal.jsx';
import { getMaintenanceOverview, maintenanceMetricNames } from '../services/maintenanceService.js';

const statusLabels = { normal: 'Normal', warning: 'Scheduled', due: 'Due', overdue: 'Alert', inactive: 'Inactive' };
const statusStyles = {
  normal: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  due: 'bg-orange-50 text-orange-700',
  overdue: 'bg-red-50 text-red-700',
  inactive: 'bg-slate-100 text-slate-500',
};

function MetricCell({ metric }) {
  if (!metric) return <span className="text-slate-400">-</span>;
  const isAlert = metric.status === 'overdue' || metric.status === 'due' || metric.current >= metric.threshold;
  return <span className={isAlert ? 'font-bold text-red-600' : 'text-slate-600'}>{metric.current.toLocaleString('id-ID')} Jam</span>;
}

export default function MaintenancePage({ onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [usingDummyData, setUsingDummyData] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetRowTarget, setResetRowTarget] = useState(null);
  const [selectedResetNames, setSelectedResetNames] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getMaintenanceOverview().then((result) => {
      if (cancelled) return;
      setRows(result.data);
      setUsingDummyData(result.isDummy);
    }).catch((requestError) => {
      if (!cancelled) setError(requestError.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${row.itemCode} ${row.itemName}`.toLowerCase().includes(query);
    return matchesSearch && (status === 'all' || row.status === status);
  }), [rows, search, status]);

  const alertCount = rows.filter((row) => row.status === 'overdue' || row.status === 'due').length;
  const scheduledCount = rows.filter((row) => row.status === 'warning').length;

  const openResetModal = (row) => {
    setResetRowTarget(row);
    setSelectedResetNames([]);
    setNotice('');
  };

  const closeResetModal = () => {
    setResetRowTarget(null);
    setSelectedResetNames([]);
  };

  const submitResets = () => {
    if (!resetRowTarget || !selectedResetNames.length) return;
    setRows((current) => current.map((item) => {
      if (item.id !== resetRowTarget.id) return item;
      const metrics = Object.fromEntries(Object.entries(item.metrics).map(([name, metric]) => selectedResetNames.includes(name)
        ? [name, { ...metric, current: 0, status: 'normal' }]
        : [name, metric]));
      const nextStatus = Object.values(metrics).reduce((highest, metric) => {
        const priority = { overdue: 4, due: 3, warning: 2, normal: 1, inactive: 0 };
        return (priority[metric.status] || 0) > (priority[highest] || 0) ? metric.status : highest;
      }, 'normal');
      return { ...item, metrics, status: nextStatus };
    }));
    setNotice(`${resetRowTarget.itemCode}: ${selectedResetNames.length} parameter berhasil di-reset (data demo).`);
    closeResetModal();
  };

  return <div className="min-h-screen bg-[#edf2f8] text-[#1e293b]">
    <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/maintenance" onToggle={() => setCollapsed((value) => !value)} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
    <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
    <main className={`min-h-screen pt-9 transition-[padding] duration-200 ${collapsed ? 'lg:pl-16' : 'lg:pl-40'}`}>
      <div className="mx-auto max-w-330 px-4 py-5 sm:px-5 lg:px-4">
        <header className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="text-[10px] font-semibold text-slate-500">Divisi Alat <span className="px-1 text-slate-400">&gt;</span> <span className="text-[#08729a]">Maintenance Tracking</span></p><h1 className="mt-1 text-2xl font-bold tracking-tight">Maintenance Overview</h1></div>
          <button type="button" onClick={() => setNotice('Data maintenance siap di-export.')} className="self-start border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-[#08729a] sm:self-auto">↓ Export Data</button>
        </header>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="border border-slate-300 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Total Items</p><p className="mt-1 text-2xl font-bold">{rows.length}</p></div>
          <div className="border border-slate-300 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Oil Alerts</p><p className="mt-1 text-2xl font-bold text-red-600">{alertCount}</p></div>
          <div className="border border-slate-300 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Scheduled Service</p><p className="mt-1 text-2xl font-bold text-amber-600">{scheduledCount}</p></div>
        </div>

        {usingDummyData && <div className="mb-3 border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700" role="status">Menampilkan data demo karena data maintenance dari server belum tersedia.</div>}
        {notice && <div className="mb-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700" role="status">{notice}</div>}
        {error && <div className="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</div>}

        <section className="mb-4 border border-slate-300 bg-[#f3f7fb] p-3" aria-label="Search and filter maintenance">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(150px,.7fr)_auto] md:items-end">
            <label className="block text-[10px] font-bold text-slate-700">Search Information<div className="relative mt-1.5"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-slate-500">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-full border border-slate-300 bg-white pl-9 pr-3 text-xs outline-none focus:border-[#08729a]" placeholder="Cari item atau kode..." /></div></label>
            <label className="block text-[10px] font-bold text-slate-700">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1.5 h-9 w-full border border-slate-300 bg-white px-2 text-xs outline-none focus:border-[#08729a]"><option value="all">All Status</option><option value="overdue">Alert</option><option value="warning">Scheduled</option><option value="due">Due</option><option value="normal">Normal</option></select></label>
            <button type="button" onClick={() => { setSearch(''); setStatus('all'); }} className="h-9 border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-600 hover:border-[#08729a]">↻ Reset</button>
          </div>
        </section>

        {loading ? <div className="border border-slate-300 bg-white px-4 py-16 text-center text-sm text-slate-500">Memuat data maintenance...</div> : <section className="border border-slate-300 bg-white" aria-label="Maintenance table"><div className="overflow-x-auto"><table className="w-full min-w-260 border-collapse text-[10px]"><thead className="bg-[#e8eef5] text-left font-bold text-slate-600"><tr><th className="border-b border-slate-300 px-3 py-3">No</th><th className="border-b border-slate-300 px-3 py-3">Item Code</th>{maintenanceMetricNames.map((name) => <th key={name} className="border-b border-slate-300 px-3 py-3">{name}</th>)}<th className="border-b border-slate-300 px-3 py-3">Status</th><th className="border-b border-slate-300 px-3 py-3">Actions</th></tr></thead><tbody>{filteredRows.length ? filteredRows.map((row, index) => <tr key={row.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50"><td className="px-3 py-3 text-slate-500">{String(index + 1).padStart(2, '0')}</td><td className="px-3 py-3 font-bold text-slate-700">{row.itemCode}<span className="mt-1 block font-normal text-slate-400">{row.itemName}</span></td>{maintenanceMetricNames.map((name) => <td key={name} className="px-3 py-3"><MetricCell metric={row.metrics[name]} /></td>)}<td className="px-3 py-3"><span className={`inline-block px-2 py-1 text-[9px] font-bold ${statusStyles[row.status]}`}>{statusLabels[row.status] || row.status}</span></td><td className="px-3 py-3"><button type="button" onClick={() => openResetModal(row)} className="border border-[#08729a] px-2 py-1 text-[9px] font-semibold text-[#08729a] hover:bg-sky-50">Reset</button></td></tr>) : <tr><td colSpan="12" className="px-4 py-12 text-center text-slate-500">Tidak ada data maintenance yang cocok.</td></tr>}</tbody></table></div><div className="border-t border-slate-200 px-3 py-3 text-xs text-slate-500">Menampilkan {filteredRows.length} dari {rows.length} machines</div></section>}
      </div>
    </main>
    <ResetMaintenanceModal row={resetRowTarget} metricNames={maintenanceMetricNames} selectedNames={selectedResetNames} onToggle={(name) => setSelectedResetNames((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])} onSubmit={submitResets} onClose={closeResetModal} />
  </div>;
}
