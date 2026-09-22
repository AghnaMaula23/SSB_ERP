import { useEffect, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ActiveIssuesCard from '../components/ActiveIssuesCard.jsx';
import ItemInfoForm from '../components/ItemInfoForm.jsx';
import MaintenanceStatusGrid from '../components/MaintenanceStatusGrid.jsx';
import { getItemDetail, updateItem, updateItemStatus } from '../services/alatService.js';

const emptyItem = { itemCode: '', jenis: '', merk: '', model: '', lokasi: '', status: 'available' };

function normalizeItem(data, itemId) {
  const statusMap = {
    Available: 'available',
    'Not Available': 'assigned_to_location',
    'Delivery to Palembang': 'assigned_to_location',
    'Delivery to Subang': 'assigned_to_location',
    'Maintenance Due': 'maintenance',
  };
  return {
    itemCode: data.itemCode || data.assetCode || itemId,
    jenis: data.jenis || data.equipmentType?.typeName || '',
    merk: data.merk || data.brand || '',
    model: data.model || data.typeModel || '',
    lokasi: data.lokasi || data.location || '',
    status: statusMap[data.status] || statusMap[data.currentStatus] || data.status || data.currentStatus || 'available',
    isDummy: Boolean(data.isDummy),
  };
}

export default function ItemDetailPage({ itemId, onBackToItems, onBackToModules, onSignOut }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [item, setItem] = useState(emptyItem);
  const [savedStatus, setSavedStatus] = useState(emptyItem.status);
  const [maintenanceMetrics, setMaintenanceMetrics] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getItemDetail(itemId)
      .then((data) => {
        if (cancelled) return;
        setItem(normalizeItem(data, itemId));
        setSavedStatus(data.currentStatus || data.status || 'available');
        setMaintenanceMetrics(data.maintenanceMetrics || data.maintenance || []);
        setIssues(data.activeIssues || data.activeIssueLogs || []);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [itemId]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setItem((currentItem) => ({ ...currentItem, [name]: value }));
    setFormError('');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    if (item.isDummy) {
      setSavedStatus(item.status);
      setFormError('Dummy item edits apply in view mode only.');
      setSaving(false);
      return;
    }
    try {
      const updated = await updateItem(itemId, {
        brand: item.merk,
        model: item.model,
      });
      let statusUpdated = {};
      if (item.status !== savedStatus) {
        statusUpdated = await updateItemStatus(itemId, item.status);
        setSavedStatus(item.status);
      }
      setItem((currentItem) => ({ ...currentItem, ...normalizeItem({ ...updated, ...statusUpdated }, itemId) }));
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleIssueFixed = (issueId) => {
    setIssues((currentIssues) => currentIssues.filter((issue) => issue.id !== issueId));
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
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between">
            <div>
              <nav className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <button type="button" onClick={onBackToItems} className="hover:text-slate-800">Items Inventory</button>
                <span>/</span>
                <span className="text-slate-900 font-semibold">{item.itemCode || itemId}</span>
              </nav>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Equipment Summary — {item.itemCode || itemId}</h1>
            </div>
            <button type="button" onClick={onBackToItems} className="btn btn-secondary text-xs">
              ← Back to Inventory
            </button>
          </header>

          {loading && <div className="card-panel p-12 text-center text-sm text-slate-500">Loading item specifications...</div>}
          {!loading && loadError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700" role="alert">{loadError}</div>}
          {!loading && !loadError && (
            <>
              <ItemInfoForm item={item} form={item} saving={saving} error={formError} onChange={handleFormChange} onSubmit={handleSave} />
              <MaintenanceStatusGrid metrics={maintenanceMetrics} status={item.status === 'maintenance' ? 'Maintenance' : 'Running Well'} />
              <ActiveIssuesCard issues={issues} onFixed={handleIssueFixed} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

