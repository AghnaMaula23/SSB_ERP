import { useCallback, useEffect, useState } from 'react';
import AlatHeader from '../../components/AlatHeader.jsx';
import AlatSidebar from '../../components/AlatSidebar.jsx';
import DamageLogTable from '../components/DamageLogTable.jsx';
import DamageLogModal from '../components/DamageLogModal.jsx';
import DamageLogActionModal from '../components/DamageLogActionModal.jsx';
import { getDamageLogs } from '../services/informationService.js';

const PAGE_SIZE = 10;
const initialFilters = { search: '', sparePartSource: 'all', mechanicTeam: 'all', status: 'all' };

export default function InformationPage({ onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [notice, setNotice] = useState('');
  const [actionLog, setActionLog] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [usingDummyData, setUsingDummyData] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await getDamageLogs({ ...filters, page, limit: PAGE_SIZE });
      setLogs(result.data || []);
      setTotal(result.total || 0);
      setUsingDummyData(Boolean(result.isDummy));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const request = window.setTimeout(() => { loadLogs(); }, 0);
    return () => window.clearTimeout(request);
  }, [loadLogs]);

  const updateFilter = (event) => {
    setFilters((current) => ({ ...current, [event.target.name]: event.target.value }));
    setPage(1);
  };

  const handleSaved = () => {
    setNotice(editingLog ? 'Damage log updated successfully.' : 'New damage log created.');
    setEditingLog(null);
    setModalOpen(false);
    setPage(1);
    loadLogs();
  };

  const openEdit = (log) => { setEditingLog(log); setModalOpen(true); };
  const openAction = (log, action) => {
    if (usingDummyData) {
      setLogs((current) => current.map((item) => item.id === log.id ? { ...item, status: action === 'resolve' ? 'resolved' : 'cancelled' } : item));
      setNotice(`${log.damageCode} ${action === 'resolve' ? 'resolved' : 'cancelled'} (demo mode).`);
      return;
    }
    setActionLog(log); setActionType(action);
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/information" onToggle={() => setCollapsed((value) => { const nextValue = !value; localStorage.setItem('alat-sidebar-collapsed', String(nextValue)); return nextValue; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <nav className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>Divisi Alat</span>
                <span>/</span>
                <span className="text-slate-900 font-semibold">Damage Logs</span>
              </nav>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Equipment Damage Logs</h1>
            </div>
            <button
              type="button"
              onClick={() => { setNotice(''); setModalOpen(true); }}
              className="btn btn-primary text-xs"
            >
              + Create Damage Log
            </button>
          </div>

          {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div>}
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <span>{error}</span>
              <button type="button" onClick={loadLogs} className="font-bold underline">Retry</button>
            </div>
          )}

          {/* Filters Bar */}
          <section className="card-panel mb-6 p-4" aria-label="Damage log filters">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(130px,0.6fr)_minmax(130px,0.6fr)_minmax(130px,0.6fr)_auto] md:items-end">
              <div>
                <label htmlFor="search-log" className="block text-xs font-semibold text-slate-600">Search</label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span>
                  <input id="search-log" name="search" value={filters.search} onChange={updateFilter} className="input-control pl-8 text-xs" placeholder="Search item code or description..." />
                </div>
              </div>
              <div>
                <label htmlFor="part-source" className="block text-xs font-semibold text-slate-600">Spare Part</label>
                <select id="part-source" name="sparePartSource" value={filters.sparePartSource} onChange={updateFilter} className="input-control mt-1 text-xs">
                  <option value="all">All Sources</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="supplier">Supplier</option>
                </select>
              </div>
              <div>
                <label htmlFor="mechanic-team" className="block text-xs font-semibold text-slate-600">Mechanic</label>
                <select id="mechanic-team" name="mechanicTeam" value={filters.mechanicTeam} onChange={updateFilter} className="input-control mt-1 text-xs">
                  <option value="all">All Teams</option>
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </div>
              <div>
                <label htmlFor="log-status" className="block text-xs font-semibold text-slate-600">Status</label>
                <select id="log-status" name="status" value={filters.status} onChange={updateFilter} className="input-control mt-1 text-xs">
                  <option value="all">All Statuses</option>
                  <option value="reported">Reported</option>
                  <option value="resolved">Resolved</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <button type="button" onClick={() => { setFilters(initialFilters); setPage(1); }} className="btn btn-secondary py-2 text-xs">
                Reset
              </button>
            </div>
          </section>

          {/* Table Container */}
          {loading ? (
            <div className="card-panel p-12 text-center text-sm text-slate-500">Loading damage logs...</div>
          ) : (
            <DamageLogTable
              logs={logs}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
              onEdit={openEdit}
              onResolve={(log) => openAction(log, 'resolve')}
              onCancel={(log) => openAction(log, 'cancel')}
            />
          )}

        </div>
      </main>

      <DamageLogModal isOpen={modalOpen} log={editingLog} onClose={() => { setModalOpen(false); setEditingLog(null); }} onSaved={handleSaved} />
      <DamageLogActionModal
        log={actionLog}
        action={actionType}
        onClose={() => { setActionLog(null); setActionType(null); }}
        onSaved={(action) => {
          setNotice(`Damage log ${action === 'resolve' ? 'resolved' : 'cancelled'}.`);
          setActionLog(null);
          setActionType(null);
          loadLogs();
        }}
      />
    </div>
  );
}

