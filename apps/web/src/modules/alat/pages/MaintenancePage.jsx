import { useEffect, useMemo, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import StatCard from '../components/StatCard.jsx';
import { getMaintenanceOverview, maintenanceMetricNames } from '../services/maintenanceService.js';

const statusLabels = { normal: 'Normal', warning: 'Scheduled', due: 'Due Soon', overdue: 'Alert', inactive: 'Inactive' };
const statusStyles = {
  normal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  due: 'bg-orange-50 text-orange-700 border-orange-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200',
};

function MetricCell({ metric }) {
  if (!metric) return <span className="text-slate-400">-</span>;
  const isAlert = metric.status === 'overdue' || metric.status === 'due' || metric.current >= metric.threshold;
  return (
    <span className={isAlert ? 'font-bold text-red-600' : 'text-slate-700 font-medium'}>
      {metric.current.toLocaleString('id-ID')} hrs
    </span>
  );
}

export default function MaintenancePage({ onNavigateToReset, onBackToModules, onSignOut, initialNotice = '' }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initialNotice);

  useEffect(() => {
    let cancelled = false;
    getMaintenanceOverview().then((result) => {
      if (cancelled) return;
      setRows(result.data);
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

  const handleResetClick = (row) => {
    if (onNavigateToReset) {
      onNavigateToReset(row.id);
    } else {
      window.location.hash = `/#/alat/maintenance/reset/${row.id}`;
    }
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/maintenance" onToggle={() => setCollapsed((value) => { const nextValue = !value; localStorage.setItem('alat-sidebar-collapsed', String(nextValue)); return nextValue; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <nav className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>Divisi Alat</span>
                <span>/</span>
                <span className="text-slate-900 font-semibold">Maintenance Tracking</span>
              </nav>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Maintenance Overview</h1>
            </div>
            <button type="button" onClick={() => setNotice('Maintenance data exported to CSV.')} className="btn btn-secondary text-xs">
              ↓ Export Data
            </button>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Total Monitored Units" value={rows.length} tone="blue" />
            <StatCard label="Service Alerts" value={alertCount} tone="amber" />
            <StatCard label="Scheduled Service" value={scheduledCount} tone="green" />
          </div>

          {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div>}
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

          {/* Filters */}
          <section className="card-panel mb-6 p-4" aria-label="Maintenance filters">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(140px,0.6fr)_auto] md:items-end">
              <div>
                <label htmlFor="search-maintenance" className="block text-xs font-semibold text-slate-600">Search Machine or Code</label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span>
                  <input id="search-maintenance" value={search} onChange={(event) => setSearch(event.target.value)} className="input-control pl-8 text-xs" placeholder="Search item code..." />
                </div>
              </div>
              <div>
                <label htmlFor="status-filter" className="block text-xs font-semibold text-slate-600">Status</label>
                <select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value)} className="input-control mt-1 text-xs">
                  <option value="all">All Statuses</option>
                  <option value="overdue">Alert</option>
                  <option value="warning">Scheduled</option>
                  <option value="due">Due Soon</option>
                  <option value="normal">Normal</option>
                </select>
              </div>
              <button type="button" onClick={() => { setSearch(''); setStatus('all'); }} className="btn btn-secondary py-2 text-xs">
                Reset Filters
              </button>
            </div>
          </section>

          {/* Table */}
          {loading ? (
            <div className="card-panel p-12 text-center text-sm text-slate-500">Loading maintenance parameters...</div>
          ) : (
            <div className="table-container">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th className="w-12 text-center">No</th>
                    <th>Equipment Unit</th>
                    {maintenanceMetricNames.map((name) => (
                      <th key={name}>{name}</th>
                    ))}
                    <th className="text-center">Status</th>
                    <th className="w-20 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length > 0 ? (
                    filteredRows.map((row, index) => (
                      <tr key={row.id}>
                        <td className="text-center text-xs font-medium text-slate-500">
                          {String(index + 1).padStart(2, '0')}
                        </td>
                        <td>
                          <p className="font-mono text-xs font-semibold text-slate-900">{row.itemCode}</p>
                          <p className="text-xs text-slate-500">{row.itemName}</p>
                        </td>
                        {maintenanceMetricNames.map((name) => (
                          <td key={name}>
                            <MetricCell metric={row.metrics[name]} />
                          </td>
                        ))}
                        <td className="text-center">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyles[row.status] || statusStyles.normal}`}>
                            {statusLabels[row.status] || row.status}
                          </span>
                        </td>
                        <td className="text-center">
                          <button type="button" onClick={() => handleResetClick(row)} className="btn btn-secondary px-2.5 py-1 text-xs">
                            Reset
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-sm text-slate-500">
                        No equipment units match the selected maintenance filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <footer className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                Showing {filteredRows.length} of {rows.length} units
              </footer>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

