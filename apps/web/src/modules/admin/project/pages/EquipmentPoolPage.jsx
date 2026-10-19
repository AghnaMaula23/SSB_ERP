import { useEffect, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, MetricCard, Notice, PageHeader, StatusBadge } from '../components/ProjectUi.jsx';
import { bindPoolItemUnit, changePoolStatus, closePoolItem, createPool, listProjectPoolsWithItems } from '../services/projectService.js';
import { POOL_ITEM_STATUS, POOL_STATUS, actorName, formatDate } from '../utils/projectFormat.js';
import { getItems } from '../../../alat/services/alatService.js';

/** Pilih unit fisik untuk pool item yang belum terikat — tampil di baris tabel. */
function BindUnitControl({ item, disabled, onBind }) {
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');

  const openPicker = () => {
    setOpen(true);
    if (units) return;
    getItems({ typeId: item.equipmentTypeId, status: 'operational', limit: 100 })
      .then((result) => setUnits(result.data || []))
      .catch((requestError) => setError(requestError.message));
  };

  if (!open) {
    return <button type="button" disabled={disabled} onClick={openPicker} className="btn btn-ghost px-2 py-1 text-[11px] text-teal-700 hover:bg-teal-50">Ikat Unit</button>;
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {error ? <span className="text-[11px] text-red-600">{error}</span> : (
        <select value={selected} onChange={(event) => setSelected(event.target.value)} className="input-control h-8 w-40 text-xs" aria-label="Pilih unit">
          <option value="">{units ? (units.length ? '- Pilih unit -' : 'Tidak ada unit operational') : 'Memuat...'}</option>
          {(units || []).map((unit) => <option key={unit.id} value={unit.id}>{unit.itemCode} {unit.merk !== '-' ? `· ${unit.merk}` : ''}</option>)}
        </select>
      )}
      <button type="button" disabled={!selected || disabled} onClick={() => onBind(item, selected)} className="btn btn-primary px-2 py-1 text-[11px]">Ikat</button>
      <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost px-2 py-1 text-[11px]">Batal</button>
    </div>
  );
}

/**
 * Equipment pool project: wadah unit alat yang kemudian dialokasikan ke
 * tahapan. Item masuk lewat approval Request Alat atau ditambah langsung
 * Divisi Alat. Admin umumnya hanya melihat.
 */
export default function EquipmentPoolPage({ project, permissions, initialNotice }) {
  const [pools, setPools] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });
  const isFinal = ['completed', 'cancelled'].includes(project.status);

  useEffect(() => {
    let cancelled = false;
    listProjectPoolsWithItems(project.id)
      .then((rows) => { if (!cancelled) setPools(rows); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [project.id, reloadKey]);

  const run = async (action, successText, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setNotice({ tone: 'success', text: '' });
    try {
      await action();
      setNotice({ tone: 'success', text: successText });
      setReloadKey((key) => key + 1);
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const allItems = (pools || []).flatMap((pool) => pool.items || []);
  const count = (status) => allItems.filter((item) => item.status === status).length;
  const livePools = (pools || []).filter((pool) => ['draft', 'active'].includes(pool.status));

  return (
    <>
      <Breadcrumb items={[{ label: 'Project', href: '#/admin/projects' }, { label: project.projectName, href: `#/admin/projects/${project.id}` }, { label: 'Equipment Pool' }]} />
      <PageHeader
        title="Equipment Pool"
        subtitle="Unit alat yang disediakan untuk project ini sebelum dialokasikan ke tahapan."
        actions={(
          <button
            type="button"
            disabled={busy || !permissions.createPool || isFinal}
            title={!permissions.createPool ? 'Membuat pool milik Divisi Alat (equipment-pool:create).' : isFinal ? 'Project sudah ditutup.' : undefined}
            onClick={() => run(() => createPool(project.id), 'Equipment pool baru dibuat.')}
            className="btn btn-primary text-xs"
          >
            + Buat Pool
          </button>
        )}
      />

      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      {loadError && <Notice tone="error">{loadError}</Notice>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Pool Aktif" value={livePools.length} hint={`${pools?.length || 0} pool total`} accent loading={!pools && !loadError} />
        <MetricCard label="Siap Dialokasikan" value={allItems.filter((item) => item.status === 'available' && item.equipmentItemId).length} tone="teal" hint="Available & terikat unit" loading={!pools && !loadError} />
        <MetricCard label="Sedang Dipakai" value={count('assigned')} hint="Dialokasikan ke tahapan" loading={!pools && !loadError} />
        <MetricCard label="Belum Terikat Unit" value={allItems.filter((item) => item.status === 'available' && !item.equipmentItemId).length} tone="amber" loading={!pools && !loadError} />
      </div>

      {!pools && !loadError ? (
        <LoadingPanel>Memuat equipment pool...</LoadingPanel>
      ) : pools && pools.length === 0 ? (
        <EmptyPanel icon="🧰" title="Project belum punya equipment pool">
          Pool dibuat otomatis saat Request Alat disetujui, atau langsung oleh Divisi Alat lewat tombol “Buat Pool”.
        </EmptyPanel>
      ) : (
        <div className="space-y-5">
          {(pools || []).map((pool) => {
            const live = ['draft', 'active'].includes(pool.status);
            return (
              <section key={pool.id} className="card-panel overflow-hidden" aria-label={`Pool ${pool.poolCode}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm font-bold text-slate-900">{pool.poolCode}</span>
                    <StatusBadge status={pool.status} map={POOL_STATUS} />
                    <span className="text-[11px] text-slate-500">Dibuat {formatDate(pool.createdAt)} · {actorName(pool.createdBy)}</span>
                  </div>
                  {live && (
                    <div className="flex flex-wrap gap-1">
                      {permissions.updatePool && (
                        <a href={`#/admin/projects/${project.id}/pool/${pool.id}/item/new`} className="btn btn-secondary px-2.5 py-1 text-[11px]">+ Tambah Item</a>
                      )}
                      {permissions.updatePool && (
                        <>
                          <button type="button" disabled={busy} onClick={() => run(() => changePoolStatus(pool.id, 'closed'), `Pool ${pool.poolCode} ditutup.`, 'Tutup pool ini? Item yang masih available ikut ditutup.')} className="btn btn-ghost px-2 py-1 text-[11px] text-teal-700 hover:bg-teal-50">Tutup</button>
                          <button type="button" disabled={busy} onClick={() => run(() => changePoolStatus(pool.id, 'cancelled'), `Pool ${pool.poolCode} dibatalkan.`, 'Batalkan pool ini? Status final.')} className="btn btn-ghost px-2 py-1 text-[11px] text-red-600 hover:bg-red-50">Batalkan</button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th>Tipe Alat</th>
                        <th>Unit</th>
                        <th>Asal</th>
                        <th className="text-center">Status</th>
                        {permissions.updatePool && live && <th className="text-right">Aksi</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(pool.items || []).length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-xs text-slate-500">Pool ini belum berisi alat.</td></tr>
                      ) : pool.items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <p className="font-semibold text-slate-900">{item.equipmentType?.typeName}</p>
                            <p className="font-mono text-[11px] text-slate-400">{item.equipmentType?.typeCode}</p>
                          </td>
                          <td>
                            {item.equipmentItem
                              ? <span className="font-mono text-sm font-bold text-teal-700">{item.equipmentItem.assetCode}</span>
                              : <span className="text-[11px] font-semibold text-amber-700">Belum terikat unit</span>}
                          </td>
                          <td className="text-xs text-slate-600">{item.equipmentRequestItemId ? 'Request Alat' : 'Ditambah manual'}</td>
                          <td className="text-center"><StatusBadge status={item.status} map={POOL_ITEM_STATUS} /></td>
                          {permissions.updatePool && live && (
                            <td>
                              <div className="flex flex-wrap justify-end gap-1">
                                {item.status === 'available' && !item.equipmentItemId && (
                                  <BindUnitControl
                                    item={item}
                                    disabled={busy}
                                    onBind={(target, unitId) => run(() => bindPoolItemUnit(pool.id, target.id, unitId), 'Unit berhasil diikat ke pool item.')}
                                  />
                                )}
                                {item.status === 'available' && (
                                  <>
                                    <button type="button" disabled={busy} onClick={() => run(() => closePoolItem(pool.id, item.id, 'completed'), 'Pool item ditandai selesai.', 'Tandai item ini selesai? Unit dilepas dari pool.')} className="btn btn-ghost px-2 py-1 text-[11px] text-teal-700 hover:bg-teal-50">Selesai</button>
                                    <button type="button" disabled={busy} onClick={() => run(() => closePoolItem(pool.id, item.id, 'cancelled'), 'Pool item dibatalkan.', 'Batalkan item ini?')} className="btn btn-ghost px-2 py-1 text-[11px] text-red-600 hover:bg-red-50">Batalkan</button>
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
