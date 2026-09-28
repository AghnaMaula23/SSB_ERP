import { useEffect, useMemo, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import StatCard from '../components/StatCard.jsx';
import { getMaintenanceOverview } from '../services/maintenanceService.js';
import { downloadCsv } from '../../../utils/csv.js';
import ActionButton from '../../../components/ActionButton.jsx';
import { hasPermission } from '../../../services/permissions.js';

const statusLabels = { normal: 'Normal', warning: 'Scheduled', due: 'Due Soon', overdue: 'Alert', inactive: 'Inactive' };
const statusStyles = {
  normal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  due: 'bg-orange-50 text-orange-700 border-orange-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200',
};
const statusDot = {
  normal: 'bg-emerald-500',
  warning: 'bg-amber-500',
  due: 'bg-orange-500',
  overdue: 'bg-red-500',
  inactive: 'bg-slate-400',
};
const statusAccent = {
  normal: 'bg-emerald-400',
  warning: 'bg-amber-400',
  due: 'bg-orange-400',
  overdue: 'bg-red-400',
  inactive: 'bg-slate-300',
};

export default function MaintenancePage({ onNavigateToReset, onNavigateToThresholds, onBackToModules, onSignOut, initialNotice = '' }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [metricNames, setMetricNames] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initialNotice);
  const canCreate = hasPermission('maintenance:create');

  useEffect(() => {
    if (!initialNotice) return undefined;
    const timeout = window.setTimeout(() => setNotice(initialNotice), 0);
    return () => window.clearTimeout(timeout);
  }, [initialNotice]);

  useEffect(() => {
    let cancelled = false;
    getMaintenanceOverview().then((result) => {
      if (cancelled) return;
      setRows(result.data);
      setMetricNames(result.metricNames || []);
    }).catch((requestError) => { if (!cancelled) setError(requestError.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return (!query || `${row.itemCode} ${row.itemName}`.toLowerCase().includes(query)) && (status === 'all' || row.status === status);
  }), [rows, search, status]);
  const alertCount = rows.filter((row) => row.status === 'overdue' || row.status === 'due').length;
  const scheduledCount = rows.filter((row) => row.status === 'warning').length;

  const handleExport = () => {
    downloadCsv('maintenance-overview.csv', filteredRows, [
      { label: 'Item Code', value: (row) => row.itemCode },
      { label: 'Equipment', value: (row) => row.itemName },
      { label: 'Status', value: (row) => row.status },
      ...metricNames.map((name) => ({ label: name, value: (row) => row.metrics[name] ? `${row.metrics[name].current} / ${row.metrics[name].threshold} hrs` : '' })),
    ]);
    setNotice('Maintenance data exported to CSV.');
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/maintenance" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><nav className="flex items-center gap-2 text-xs font-medium text-slate-500"><span>Divisi Alat</span><span>/</span><span className="text-slate-900 font-semibold">Maintenance Tracking</span></nav><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Maintenance Overview</h1></div><div className="flex items-center gap-2"><button type="button" onClick={() => onNavigateToThresholds?.()} className="btn btn-secondary text-xs">⚙️ Threshold per Type</button><button type="button" onClick={handleExport} className="btn btn-secondary text-xs">↓ Export Data</button></div></div>
          <div className="mb-6 grid gap-4 sm:grid-cols-3"><StatCard label="Total Monitored Units" value={rows.length} tone="blue" /><StatCard label="Service Alerts" value={alertCount} tone="amber" /><StatCard label="Scheduled Service" value={scheduledCount} tone="green" /></div>
          {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div>}
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          <section className="card-panel mb-6 p-4" aria-label="Maintenance filters"><div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(140px,0.6fr)_auto] md:items-end"><div><label htmlFor="search-maintenance" className="block text-xs font-semibold text-slate-600">Search Machine or Code</label><div className="relative mt-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span><input id="search-maintenance" value={search} onChange={(event) => setSearch(event.target.value)} className="input-control pl-8 text-xs" placeholder="Search item code..." /></div></div><div><label htmlFor="status-filter" className="block text-xs font-semibold text-slate-600">Status</label><select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value)} className="input-control mt-1 text-xs"><option value="all">All Statuses</option><option value="overdue">Alert</option><option value="warning">Scheduled</option><option value="due">Due Soon</option><option value="normal">Normal</option></select></div><button type="button" onClick={() => { setSearch(''); setStatus('all'); }} className="btn btn-secondary py-2 text-xs">Reset Filters</button></div></section>
          {loading ? <div className="card-panel p-12 text-center text-sm text-slate-500">Loading maintenance parameters...</div> : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">Daftar Unit Monitoring</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{filteredRows.length} unit</span>
                </div>
                <div className="hidden flex-wrap items-center gap-3 text-[11px] font-medium text-slate-500 md:flex">
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <span key={key} className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${statusDot[key]}`} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <table className="table-modern maintenance-table hidden md:table">
                <thead>
                  <tr>
                    <th className="col-index text-center">No</th>
                    <th>Equipment Unit</th>
                    <th className="col-status text-center">Status</th>
                    <th className="col-actions text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length ? filteredRows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="text-center font-mono text-xs font-semibold text-slate-400">{String(index + 1).padStart(2, '0')}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className={`h-9 w-1 shrink-0 rounded-full ${statusAccent[row.status] || statusAccent.normal}`} aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="truncate font-mono text-sm font-semibold text-slate-900">{row.itemCode}</p>
                            <p className="truncate text-xs text-slate-500">{row.itemName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[row.status] || statusStyles.normal}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusDot[row.status] || statusDot.normal}`} />
                          {statusLabels[row.status] || row.status}
                        </span>
                      </td>
                      <td className="text-center">
                        <ActionButton
                          kind="reset"
                          label={canCreate ? `Reset maintenance ${row.itemCode}` : 'Anda tidak memiliki izin membuat maintenance record'}
                          onClick={() => onNavigateToReset?.(row.id)}
                          disabled={!canCreate}
                        />
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="py-14 text-center text-sm text-slate-500">No equipment units match the selected maintenance filters.</td></tr>
                  )}
                </tbody>
              </table>
              <table className="table-modern w-full md:hidden">
                <thead>
                  <tr>
                    <th className="w-12 text-center">No</th>
                    <th>Equipment Unit</th>
                    <th className="w-20 text-center">Reset</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length ? filteredRows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="text-center font-mono text-xs font-semibold text-slate-400">{String(index + 1).padStart(2, '0')}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <span className={`h-8 w-1 shrink-0 rounded-full ${statusAccent[row.status] || statusAccent.normal}`} aria-hidden="true" title={statusLabels[row.status] || row.status} />
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs font-semibold text-slate-900">{row.itemCode}</p>
                            <p className="truncate text-[11px] text-slate-500">{row.itemName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center">
                        <ActionButton
                          kind="reset"
                          label={canCreate ? `Reset maintenance ${row.itemCode}` : 'Anda tidak memiliki izin membuat maintenance record'}
                          onClick={() => onNavigateToReset?.(row.id)}
                          disabled={!canCreate}
                        />
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3} className="py-10 text-center text-sm text-slate-500">No equipment units match the selected maintenance filters.</td></tr>
                  )}
                </tbody>
              </table>
              <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
                <span>Menampilkan {filteredRows.length} dari {rows.length} unit</span>
                <span className="hidden md:inline">Detail parameter, Purchase Order, dan log service tersedia di halaman Reset Maintenance.</span>
              </footer>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
