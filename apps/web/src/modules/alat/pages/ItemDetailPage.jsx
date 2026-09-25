import { useEffect, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ActiveIssuesCard from '../components/ActiveIssuesCard.jsx';
import ItemInfoForm from '../components/ItemInfoForm.jsx';
import MaintenanceStatusGrid from '../components/MaintenanceStatusGrid.jsx';
import { getEquipmentTypes, getItemById, getItemDetail, normalizeEquipmentStatus, updateItem, updateItemStatus } from '../services/alatService.js';
import { hasPermission } from '../../../services/permissions.js';

const emptyItem = { itemCode: '', equipmentTypeId: '', jenis: '', merk: '', model: '', status: 'operational' };

function normalizeItem(data, itemId) {
  return {
    itemCode: data.itemCode || data.assetCode || itemId,
    equipmentTypeId: data.equipmentTypeId || data.equipmentType?.id || '',
    jenis: data.jenis || data.equipmentType?.typeName || '',
    merk: data.merk || data.brand || '',
    model: data.model || data.typeModel || '',
    status: normalizeEquipmentStatus(data.status || data.currentStatus),
  };
}

export default function ItemDetailPage({ itemId, onBackToItems, onBackToModules, onSignOut }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [item, setItem] = useState(emptyItem);
  const [equipmentTypes, setEquipmentTypes] = useState([]);
  const [savedStatus, setSavedStatus] = useState(emptyItem.status);
  const [maintenanceMetrics, setMaintenanceMetrics] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [subresourceWarnings, setSubresourceWarnings] = useState([]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const canUpdate = hasPermission('equipment:update');

  useEffect(() => {
    let cancelled = false;
    Promise.all([getItemDetail(itemId), getEquipmentTypes()])
      .then(([data, types]) => {
        if (cancelled) return;
        setEquipmentTypes(types || []);
        setItem(normalizeItem(data, itemId));
        setSavedStatus(normalizeEquipmentStatus(data.currentStatus || data.status));
        setMaintenanceMetrics(data.maintenanceMetrics || data.maintenance || []);
        setIssues(data.activeIssues || data.activeIssueLogs || []);
        setSubresourceWarnings(data.subresourceErrors || []);
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
    try {
      const payload = {
        brand: item.merk,
        model: item.model,
      };
      if (item.equipmentTypeId) {
        payload.equipmentTypeId = Number(item.equipmentTypeId);
      }
      const updated = await updateItem(itemId, payload);
      let statusUpdated = {};
      if (item.status !== savedStatus) {
        statusUpdated = await updateItemStatus(itemId, item.status);
        setSavedStatus(normalizeEquipmentStatus(item.status));
      }
      setItem((currentItem) => ({ ...currentItem, ...normalizeItem({ ...updated, ...statusUpdated }, itemId) }));
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleIssueFixed = async (issueId) => {
    setIssues((currentIssues) => currentIssues.filter((issue) => issue.id !== issueId));
    try {
      const freshItem = await getItemById(itemId);
      const normalized = normalizeItem(freshItem, itemId);
      setItem((currentItem) => ({ ...currentItem, ...normalized }));
      setSavedStatus(normalized.status);
    } catch (error) {
      setFormError(`Status equipment tidak dapat diperbarui: ${error.message}`);
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
          {!loading && subresourceWarnings.length > 0 && (
             <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700" role="status">
               Sebagian data equipment tidak dapat dimuat: {subresourceWarnings.join('; ')}
             </div>
           )}
           {!loading && !loadError && (
            <>
              <ItemInfoForm item={item} form={item} equipmentTypes={equipmentTypes} saving={saving} error={formError} readOnly={!canUpdate} onChange={handleFormChange} onSubmit={handleSave} />
              <MaintenanceStatusGrid metrics={maintenanceMetrics} status={item.status === 'maintenance' ? 'Maintenance Due' : 'Running Well'} />
              <ActiveIssuesCard issues={issues} onFixed={handleIssueFixed} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

