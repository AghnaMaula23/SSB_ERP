import { useEffect, useMemo, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ItemTable from '../components/ItemTable.jsx';
import FilterItemModal from '../components/FilterItemModal.jsx';
import RegisterItemModal from '../components/RegisterItemModal.jsx';
import StatCard from '../components/StatCard.jsx';
import { archiveItem, equipmentStatusLabel, getAllItems } from '../services/alatService.js';
import { hasPermission } from '../../../services/permissions.js';

const PAGE_SIZE = 8;

export default function ItemsPage({ onBackToModules, onSignOut, onViewDetails }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(() => sessionStorage.getItem('equipment-search') || '');
  const [advancedFilters, setAdvancedFilters] = useState({ statuses: [], jenis: [], manufacturers: [], capacity: '' });
  const [page, setPage] = useState(1);
  const canCreate = hasPermission('equipment:create');
  const canDelete = hasPermission('equipment:delete');

  useEffect(() => {
    const handleGlobalSearch = (event) => {
      const value = event.detail || sessionStorage.getItem('equipment-search') || '';
      setSearchTerm(value);
      setPage(1);
    };
    sessionStorage.removeItem('equipment-search');
    window.addEventListener('equipment-search-submit', handleGlobalSearch);
    return () => window.removeEventListener('equipment-search-submit', handleGlobalSearch);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAllItems()
      .then((result) => {
        if (!cancelled) setItems(result.data || []);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const jenisOptions = [...new Set(items.map((item) => item.jenis).filter(Boolean))];
  const statusOptions = [...new Set(items.map((item) => item.status).filter(Boolean))];
  const manufacturerOptions = [...new Set(items.map((item) => item.merk).filter((value) => value && value !== '-'))];

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !normalizedSearch || [item.itemCode, item.jenis, item.merk, item.typeModel, item.status].some((value) => value.toLowerCase().includes(normalizedSearch));
      const matchesJenis = advancedFilters.jenis.length === 0 || advancedFilters.jenis.includes(item.jenis);
      const matchesStatus = advancedFilters.statuses.length === 0 || advancedFilters.statuses.includes(item.status);
      const matchesManufacturer = advancedFilters.manufacturers.length === 0 || advancedFilters.manufacturers.includes(item.merk);
      const matchesCapacity = !advancedFilters.capacity || item.capacityClass === advancedFilters.capacity;
      return matchesSearch && matchesJenis && matchesStatus && matchesManufacturer && matchesCapacity;
    });
  }, [items, searchTerm, advancedFilters]);

  const visibleItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const updateFilter = (field) => (event) => {
    const value = event.target.value;
    setAdvancedFilters((current) => ({ ...current, [field]: value === 'All' ? [] : [value] }));
    setPage(1);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setAdvancedFilters({ statuses: [], jenis: [], manufacturers: [], capacity: '' });
    setPage(1);
  };

  const handleAdvancedFilter = (nextFilters, apply) => {
    setAdvancedFilters(nextFilters);
    if (apply) {
      setPage(1);
      setIsFilterModalOpen(false);
    }
  };

  const handleItemSaved = (item) => {
    setItems((currentItems) => [item, ...currentItems]);
    setPage(1);
    setSuccessMessage('Equipment unit registered successfully.');
  };

  const handleArchive = async (item) => {
    if (!window.confirm(`Archive unit ${item.itemCode}?`)) return;
    setLoadError('');
    try {
      await archiveItem(item.id);
      setItems((currentItems) => currentItems.filter((currentItem) => currentItem.id !== item.id));
      setSuccessMessage(`Unit ${item.itemCode} archived.`);
    } catch (error) {
      setLoadError(error.message);
    }
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        activeRoute="alat/items"
        onToggle={() => setSidebarCollapsed((value) => { const nextValue = !value; localStorage.setItem('alat-sidebar-collapsed', String(nextValue)); return nextValue; })}
        onClose={() => setMobileSidebarOpen(false)}
        onBackToModules={onBackToModules}
        onSignOut={onSignOut}
      />
      <AlatHeader collapsed={sidebarCollapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          
          {/* Header section */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <nav className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>Divisi Alat</span>
                <span>/</span>
                <span className="text-slate-900 font-semibold">Items Inventory</span>
              </nav>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Equipment Inventory</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(true)}
                className="btn btn-secondary text-xs"
              >
                ⚙️ Filter Options
              </button>
              <button
                type="button"
                onClick={() => { setSuccessMessage(''); setIsRegisterModalOpen(true); }}
                 disabled={!canCreate}
                 title={canCreate ? 'Register new equipment' : 'Anda tidak memiliki izin membuat equipment'}
                className="btn btn-primary text-xs"
              >
                + Register New Item
              </button>
            </div>
          </div>

          {/* Stats section */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Total Equipment Units" value={items.length} tone="blue" />
            <StatCard label="Maintenance Due" value={items.filter((item) => item.status === 'maintenance').length} tone="amber" />
            <StatCard label="Available for Dispatch" value={items.filter((item) => item.status === 'operational').length} tone="green" />
          </div>

          {successMessage && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{successMessage}</div>}
          {loadError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{loadError}</div>}

          {/* Filter Bar */}
          <section className="card-panel mb-6 p-4" aria-label="Inventory Filters">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(140px,0.6fr)_minmax(140px,0.6fr)_auto] md:items-end">
              <div>
                <label htmlFor="search-input" className="block text-xs font-semibold text-slate-600">Search</label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span>
                  <input
                    id="search-input"
                    value={searchTerm}
                    onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }}
                    className="input-control pl-8 text-xs"
                    placeholder="Search Code, Name, Model..."
                  />
                </div>
              </div>
              <div>
                <label htmlFor="jenis-select" className="block text-xs font-semibold text-slate-600">Type</label>
                <select id="jenis-select" value={advancedFilters.jenis[0] || 'All'} onChange={updateFilter('jenis')} className="input-control mt-1 text-xs">
                  <option value="All">All Types</option>
                  {jenisOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="status-select" className="block text-xs font-semibold text-slate-600">Status</label>
                <select id="status-select" value={advancedFilters.statuses[0] || 'All'} onChange={updateFilter('statuses')} className="input-control mt-1 text-xs">
                  <option value="All">All Statuses</option>
                  {statusOptions.map((option) => <option key={option} value={option}>{equipmentStatusLabel(option)}</option>)}
                </select>
              </div>
              <button type="button" onClick={resetFilters} className="btn btn-secondary py-2 text-xs">
                Reset
              </button>
            </div>
          </section>

          {/* Table Container */}
          {loading ? (
            <div className="card-panel p-12 text-center text-sm text-slate-500">Loading equipment inventory...</div>
          ) : (
            <ItemTable
              items={visibleItems}
              totalItems={filteredItems.length}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE)))))}
              onViewDetails={onViewDetails}
              onDelete={handleArchive}
               canDelete={canDelete}
            />
          )}

        </div>
      </main>

      <RegisterItemModal isOpen={isRegisterModalOpen} onClose={() => setIsRegisterModalOpen(false)} onSaved={handleItemSaved} />
      <FilterItemModal
        key={`${isFilterModalOpen}-${JSON.stringify(advancedFilters)}`}
        isOpen={isFilterModalOpen}
        options={{ statuses: statusOptions, jenis: jenisOptions, manufacturers: manufacturerOptions }}
        value={advancedFilters}
        onApply={handleAdvancedFilter}
        onReset={() => { resetFilters(); setIsFilterModalOpen(false); }}
        onClose={() => setIsFilterModalOpen(false)}
      />
    </div>
  );
}

