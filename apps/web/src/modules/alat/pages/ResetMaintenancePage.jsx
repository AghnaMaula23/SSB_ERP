import { useEffect, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import { getItemDetail } from '../services/alatService.js';
import { createMaintenanceRecord, getItemMaintenanceSettings } from '../services/maintenanceService.js';

const statusBadgeStyles = {
  normal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  due: 'bg-orange-50 text-orange-700 border-orange-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200',
};

const statusLabels = {
  normal: 'Normal',
  warning: 'Scheduled',
  due: 'Due Soon',
  overdue: 'Alert',
  inactive: 'Inactive',
};

export default function ResetMaintenancePage({ unitId, onBack, onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  
  const [unit, setUnit] = useState(null);
  const [settings, setSettings] = useState([]);
  const [selectedSettingIds, setSelectedSettingIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Form fields
  const [maintenanceType, setMaintenanceType] = useState('routine');
  const [maintenanceDate, setMaintenanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [performedBy, setPerformedBy] = useState('');
  const [actionDescription, setActionDescription] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        setLoading(true);
        setError('');
        const [unitData, settingsData] = await Promise.all([
          getItemDetail(unitId).catch(() => ({ id: unitId, assetCode: `Unit ${unitId}` })),
          getItemMaintenanceSettings(unitId).catch(() => []),
        ]);
        if (cancelled) return;
        setUnit(unitData);
        setSettings(settingsData);
        // Pre-select settings that are overdue, due, or warning
        const priorityIds = settingsData
          .filter((s) => s.status === 'overdue' || s.status === 'due' || s.status === 'warning')
          .map((s) => s.id);
        setSelectedSettingIds(priorityIds.length ? priorityIds : settingsData.map((s) => s.id));
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load maintenance settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [unitId]);

  const toggleSelectAll = () => {
    if (selectedSettingIds.length === settings.length) {
      setSelectedSettingIds([]);
    } else {
      setSelectedSettingIds(settings.map((s) => s.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedSettingIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedSettingIds.length) {
      setError('Please select at least one maintenance parameter to reset.');
      return;
    }
    if (!actionDescription.trim()) {
      setError('Action description is required.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Create maintenance record for each selected setting
      await Promise.all(
        selectedSettingIds.map((settingId) =>
          createMaintenanceRecord({
            equipmentItemId: Number(unitId),
            maintenanceSettingId: Number(settingId),
            maintenanceType,
            maintenanceDate,
            actionDescription: actionDescription.trim(),
            performedBy: performedBy.trim() || undefined,
          })
        )
      );

      onBack('Maintenance reset successfully executed.');
    } catch (submitError) {
      setError(submitError.message || 'Failed to submit maintenance reset.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar
        collapsed={collapsed}
        mobileOpen={mobileSidebarOpen}
        activeRoute="alat/maintenance"
        onToggle={() =>
          setCollapsed((val) => {
            const next = !val;
            localStorage.setItem('alat-sidebar-collapsed', String(next));
            return next;
          })
        }
        onClose={() => setMobileSidebarOpen(false)}
        onBackToModules={onBackToModules}
        onSignOut={onSignOut}
      />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((val) => !val)} />

      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
          
          {/* Header & Breadcrumb */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
            <div>
              <nav className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <button type="button" onClick={() => onBack()} className="hover:text-slate-800">
                  Maintenance Tracking
                </button>
                <span>/</span>
                <span className="text-slate-900 font-semibold">Reset Maintenance Parameters</span>
              </nav>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                Reset Maintenance — {unit?.itemCode || unit?.assetCode || `Unit #${unitId}`}
              </h1>
            </div>
            <button type="button" onClick={() => onBack()} className="btn btn-secondary text-xs self-start sm:self-center">
              ← Back to Maintenance Overview
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700" role="alert">
              {error}
            </div>
          )}

          {loading ? (
            <div className="card-panel p-12 text-center text-sm text-slate-500">Loading equipment parameters...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Unit Info Banner */}
              <div className="card-panel p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">⚙️</span>
                    <h2 className="text-lg font-bold">{unit?.itemCode || unit?.assetCode || `Unit ${unitId}`}</h2>
                    <span className="rounded-full bg-slate-700/80 px-2.5 py-0.5 text-xs font-mono text-slate-200">
                      {unit?.jenis || unit?.equipmentType?.typeName || 'Equipment'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Brand: <strong className="text-slate-200">{unit?.merk || unit?.brand || '-'}</strong> | Model: <strong className="text-slate-200">{unit?.typeModel || unit?.model || '-'}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Total Workhour</p>
                    <p className="text-lg font-bold font-mono text-teal-400">
                      {Number(unit?.totalWorkhour || 0).toLocaleString('id-ID')} hrs
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Status</p>
                    <span className="inline-block mt-0.5 rounded-full bg-teal-500/20 px-3 py-0.5 text-xs font-semibold text-teal-300 border border-teal-500/30">
                      {unit?.status || unit?.currentStatus || 'Operational'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Parameter Selection Grid */}
              <div className="card-panel p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Select Maintenance Parameters to Reset</h3>
                    <p className="text-xs text-slate-500">Selected parameters will have their run-hour counters reset to zero (0 hrs).</p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="btn btn-secondary text-xs"
                  >
                    {selectedSettingIds.length === settings.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                {settings.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                    No configured maintenance settings found for this equipment unit.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {settings.map((setting) => {
                      const isSelected = selectedSettingIds.includes(setting.id);
                      const aspectName = setting.maintenanceAspect?.aspectName || 'Maintenance Aspect';
                      const current = Number(setting.currentValueSinceReset || 0);
                      const threshold = Number(setting.thresholdValue || 1);
                      const percent = Math.min(Math.round((current / threshold) * 100), 100);
                      const status = setting.status || 'normal';

                      return (
                        <div
                          key={setting.id}
                          onClick={() => toggleSelect(setting.id)}
                          className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
                            isSelected
                              ? 'border-teal-500 bg-teal-50/40 shadow-sm ring-1 ring-teal-500'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(setting.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                              <div>
                                <h4 className="text-sm font-bold text-slate-900">{aspectName}</h4>
                                <p className="text-xs text-slate-500 font-mono">
                                  Current: {current} / {threshold} hrs
                                </p>
                              </div>
                            </div>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeStyles[status] || statusBadgeStyles.normal}`}>
                              {statusLabels[status] || status}
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="mt-3 space-y-1">
                            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-teal-500'
                                }`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <div className="flex justify-end">
                              <span className="text-[10px] text-slate-400 font-medium">{percent}% threshold</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Maintenance Service Action Form */}
              <div className="card-panel p-6 space-y-4">
                <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-3">Service Action Details</h3>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="maintenanceType" className="block text-xs font-semibold text-slate-600">
                      Maintenance Type *
                    </label>
                    <select
                      id="maintenanceType"
                      value={maintenanceType}
                      onChange={(e) => setMaintenanceType(e.target.value)}
                      required
                      className="input-control mt-1 text-xs"
                    >
                      <option value="routine">Routine Service</option>
                      <option value="repair">Repair</option>
                      <option value="replacement">Part Replacement</option>
                      <option value="inspection">Inspection</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="maintenanceDate" className="block text-xs font-semibold text-slate-600">
                      Service Date *
                    </label>
                    <input
                      id="maintenanceDate"
                      type="date"
                      value={maintenanceDate}
                      onChange={(e) => setMaintenanceDate(e.target.value)}
                      required
                      className="input-control mt-1 text-xs"
                    />
                  </div>

                  <div>
                    <label htmlFor="performedBy" className="block text-xs font-semibold text-slate-600">
                      Performed By / Mechanic
                    </label>
                    <input
                      id="performedBy"
                      type="text"
                      value={performedBy}
                      onChange={(e) => setPerformedBy(e.target.value)}
                      placeholder="e.g. Tim Mekanik Internal"
                      className="input-control mt-1 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="actionDescription" className="block text-xs font-semibold text-slate-600">
                    Action Description / Notes *
                  </label>
                  <textarea
                    id="actionDescription"
                    rows={3}
                    value={actionDescription}
                    onChange={(e) => setActionDescription(e.target.value)}
                    required
                    placeholder="Describe maintenance work performed (e.g., Ganti oli mesin & filter udara, pembersihan kompresor)..."
                    className="input-control mt-1 text-xs resize-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => onBack()}
                  disabled={submitting}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedSettingIds.length}
                  className="btn btn-primary text-xs flex items-center gap-2"
                >
                  {submitting ? 'Executing Reset...' : `Confirm Reset (${selectedSettingIds.length} Selected)`}
                </button>
              </div>

            </form>
          )}

        </div>
      </main>
    </div>
  );
}
