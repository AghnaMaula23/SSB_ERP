import { useEffect, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ActiveIssuesCard from '../components/ActiveIssuesCard.jsx';
import ItemInfoForm from '../components/ItemInfoForm.jsx';
import MaintenanceStatusGrid from '../components/MaintenanceStatusGrid.jsx';
import { getItemDetail, updateItem, updateItemStatus } from '../services/alatService.js';

const emptyItem = { itemCode: '', jenis: '', merk: '', model: '', lokasi: '', status: 'available' };

function normalizeItem(data, itemId) {
  return {
    itemCode: data.itemCode || data.assetCode || itemId,
    jenis: data.jenis || data.equipmentType?.typeName || '',
    merk: data.merk || data.brand || '',
    model: data.model || '',
    lokasi: data.lokasi || data.location || '',
    status: data.status || data.currentStatus || 'available',
  };
}

export default function ItemDetailPage({ itemId, onBackToItems, onBackToModules, onSignOut }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
    <div className="min-h-screen bg-[#edf2f8] text-[#1e293b]">
      <AlatSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
      <main className={`min-h-screen pt-9 transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-40'}`}>
        <div className="mx-auto max-w-[1320px] space-y-4 px-4 py-4 sm:px-5 lg:px-4">
          <header>
            <button type="button" onClick={onBackToItems} className="text-[9px] font-semibold uppercase text-[#475569] hover:text-[#08729a]">Inventory <span className="px-1 text-[#94a3b8]">/</span> <span className="text-[#08729a]">Detail</span></button>
            <h1 className="mt-1 text-[19px] font-bold tracking-tight text-[#1e293b]">Summary - {item.itemCode || itemId}</h1>
          </header>

          {loading && <div className="border border-[#cbd5e1] bg-white px-4 py-8 text-center text-xs text-[#64748b]">Memuat detail item...</div>}
          {!loading && loadError && <div className="border border-red-200 bg-red-50 px-4 py-5 text-xs text-red-700" role="alert">{loadError}</div>}
          {!loading && !loadError && <>
            <ItemInfoForm item={item} form={item} saving={saving} error={formError} onChange={handleFormChange} onSubmit={handleSave} />
            <MaintenanceStatusGrid metrics={maintenanceMetrics} />
            <ActiveIssuesCard issues={issues} onFixed={handleIssueFixed} />
          </>}
        </div>
      </main>
    </div>
  );
}
