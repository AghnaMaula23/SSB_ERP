import { useMemo, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ItemTable from '../components/ItemTable.jsx';
import FilterItemModal from '../components/FilterItemModal.jsx';
import RegisterItemModal from '../components/RegisterItemModal.jsx';
import StatCard from '../components/StatCard.jsx';
import { alatItems } from '../data/dummyAlat.js';

const PAGE_SIZE = 8;

export default function ItemsPage({ onBackToModules, onSignOut, onViewDetails }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [items, setItems] = useState(alatItems);
  const [loadError, setLoadError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState({ statuses: [], jenis: [], manufacturers: [], capacity: '' });
  const [page, setPage] = useState(1);

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
    setSuccessMessage('Unit alat berhasil didaftarkan.');
  };

  const handleArchive = async (item) => {
    if (!window.confirm(`Arsipkan unit ${item.itemCode}?`)) return;
    setLoadError('');
    try {
      setItems((currentItems) => currentItems.filter((currentItem) => currentItem.id !== item.id));
      setSuccessMessage(`Unit ${item.itemCode} berhasil diarsipkan.`);
    } catch (error) {
      setLoadError(error.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#edf2f8] text-[#1e293b]">
      <AlatSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
      <main className={`min-h-screen pt-9 transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-40'}`}>
        <div className="mx-auto max-w-[1320px] px-4 py-4 sm:px-5 lg:px-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-semibold text-[#475569]">Resource Management <span className="px-1 text-[#94a3b8]">&gt;</span> <span className="text-[#08729a]">Items Inventory</span></p>
              <h2 className="mt-1 text-[19px] font-bold tracking-tight text-[#1e293b]">Items List</h2>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setIsFilterModalOpen(true)} className="flex items-center gap-2 border border-[#cbd5e1] bg-[#e8eef5] px-3 py-1.5 text-[9px] font-semibold text-[#334155] hover:bg-white"><span aria-hidden="true">≡</span> Filter</button>
              <button type="button" onClick={() => { setSuccessMessage(''); setIsRegisterModalOpen(true); }} className="flex items-center gap-2 border border-[#00688f] bg-[#08729a] px-3 py-1.5 text-[9px] font-semibold text-white shadow-sm hover:bg-[#075a7b]"><span aria-hidden="true">+</span> Register New Item</button>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="Total Units" value={items.length} tone="blue" />
            <StatCard label="Maintenance Due" value={items.filter((item) => item.status === 'Maintenance Due').length} tone="amber" />
            <StatCard label="Available" value={items.filter((item) => item.status === 'Available').length} tone="green" />
          </div>

          {successMessage && <div className="mb-4 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700" role="status">{successMessage}</div>}
          {loadError && <div className="mb-4 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{loadError}</div>}

          <section className="mb-4 border border-[#cbd5e1] bg-[#f3f7fb] p-2.5" aria-label="Search and filter inventory">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(130px,0.6fr)_minmax(130px,0.6fr)_auto] md:items-end">
              <label className="block text-[9px] font-bold text-[#334155]">Search Information
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-[#475569]">⌕</span>
                  <input value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} className="h-7 w-full border border-[#cbd5e1] bg-white pl-9 pr-3 text-[9px] font-normal text-[#334155] outline-none focus:border-[#08729a] focus:ring-2 focus:ring-[#08729a]/10" placeholder="Cari Item, Kode, atau Jenis Kerusakan..." />
                </div>
              </label>
              <label className="block text-[9px] font-bold text-[#334155]">Jenis
                <select value={advancedFilters.jenis[0] || 'All'} onChange={updateFilter('jenis')} className="mt-1.5 h-7 w-full border border-[#cbd5e1] bg-white px-2 text-[9px] font-normal text-[#64748b] outline-none focus:border-[#08729a]"><option value="All">All</option>
                  {jenisOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="block text-[9px] font-bold text-[#334155]">Status
                <select value={advancedFilters.statuses[0] || 'All'} onChange={updateFilter('statuses')} className="mt-1.5 h-7 w-full border border-[#cbd5e1] bg-white px-2 text-[9px] font-normal text-[#64748b] outline-none focus:border-[#08729a]"><option value="All">All</option>
                  {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <button type="button" onClick={resetFilters} className="h-7 border border-[#cbd5e1] bg-[#e8eef5] px-4 text-[9px] font-semibold text-[#475569] hover:bg-white"><span aria-hidden="true">≡</span> Reset</button>
            </div>
          </section>

          <ItemTable items={visibleItems} totalItems={filteredItems.length} page={page} pageSize={PAGE_SIZE} onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE)))))} onViewDetails={onViewDetails} onDelete={handleArchive} />
        </div>
      </main>
      <RegisterItemModal isOpen={isRegisterModalOpen} onClose={() => setIsRegisterModalOpen(false)} onSaved={handleItemSaved} />
      <FilterItemModal key={`${isFilterModalOpen}-${JSON.stringify(advancedFilters)}`} isOpen={isFilterModalOpen} options={{ statuses: statusOptions, jenis: jenisOptions, manufacturers: manufacturerOptions }} value={advancedFilters} onApply={handleAdvancedFilter} onReset={() => { resetFilters(); setIsFilterModalOpen(false); }} onClose={() => setIsFilterModalOpen(false)} />
    </div>
  );
}
