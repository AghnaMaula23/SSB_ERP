import { useState } from 'react';
import { Breadcrumb, MockBanner, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { STATUS_TRANSITIONS, formatDate } from '../../project/utils/projectFormat.js';
import { BILLING_METHODS, PACKETS, RENTAL_STATUS, UNIT_STATUS } from '../utils/rentalFormat.js';
import { cancelRentalUnitRequest, changeRentalProjectStatus } from '../services/rentalService.js';
import { changeDemoRentalStatus } from '../services/rentalDemoService.js';
import UnitTimesheet from '../components/UnitTimesheet.jsx';

const STATUS_ACTIONS = {
  active: { label: '▶ Mulai Operasional', className: 'btn btn-primary text-xs', confirm: 'Mulai operasional kontrak rental ini?' },
  planned: { label: '⏸ Tunda', className: 'btn btn-secondary text-xs', confirm: 'Kembalikan kontrak ke status planned?' },
  cancelled: { label: 'Batalkan', className: 'btn btn-ghost text-xs text-red-600 hover:bg-red-50', confirm: 'Batalkan kontrak ini? Status final.' },
  completed: { label: '✓ Selesai', className: 'btn btn-danger text-xs shadow-sm', confirm: 'Tandai kontrak rental selesai? Data kontrak tidak bisa diubah lagi.' },
};

function InfoTile({ label, value, sub }) {
  return (
    <div className="card-panel min-w-0 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1.5 truncate text-base font-bold text-slate-900" title={typeof value === 'string' ? value : undefined}>{value || '-'}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

function UnitCard({ project, unit, selected }) {
  return (
    <a
      href={`#/admin/rental/${project.id}/unit/${unit.key}`}
      aria-current={selected ? 'page' : undefined}
      className={`flex w-60 shrink-0 flex-col rounded-xl border bg-white p-3.5 text-left transition ${selected ? 'border-brand-600 ring-2 ring-brand-600/20' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-bold text-slate-900">{unit.typeName}{unit.quantity > 1 ? ` ×${unit.quantity}` : ''}</span>
        <StatusBadge status={unit.status} map={UNIT_STATUS} className="shrink-0" />
      </div>
      <span className="mt-1 font-mono text-xs font-semibold text-brand-700">{unit.assetCode || unit.requestCode || '-'}</span>
      <span className="mt-1 truncate text-[11px] text-slate-500">
        👷 {unit.meta?.operator || 'Operator belum diisi'}
        {unit.meta?.packet && PACKETS[unit.meta.packet] ? ` · ${PACKETS[unit.meta.packet].label}` : ''}
      </span>
    </a>
  );
}

/** Kontrak rental + unit-unitnya. Unit dipilih lewat kartu, bukan sidebar. */
export default function RentalDetailPage({ project, projects, unitsEntry, selectedKey, permissions, initialNotice, onNavigate, onProjectChanged, onUnitsChanged }) {
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });
  const [busy, setBusy] = useState(false);
  const units = unitsEntry?.units || [];
  const unit = units.find((row) => row.key === selectedKey) || units.find((row) => row.status === 'active') || units[0];
  const isFinal = ['completed', 'cancelled'].includes(project.status);
  const transitions = permissions.updateProject ? STATUS_TRANSITIONS[project.status] || [] : [];
  const canRecord = project.isDemo || permissions.createWorkhour;

  const run = async (action, successText, confirmText) => {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setNotice({ tone: 'success', text: '' });
    try {
      await action();
      setNotice({ tone: 'success', text: successText });
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (status) => run(async () => {
    const updated = project.isDemo ? await changeDemoRentalStatus(project.id, status) : await changeRentalProjectStatus(project.id, status);
    onProjectChanged(updated);
  }, `Status kontrak kini "${RENTAL_STATUS[status].label}".`, STATUS_ACTIONS[status].confirm);

  const cancelRequest = (target) => run(async () => {
    await cancelRentalUnitRequest(target.requestId);
    await onUnitsChanged();
  }, `Request ${target.requestCode} dibatalkan.`, `Batalkan request ${target.requestCode}?`);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb items={[{ label: 'Rental', href: '#/admin/rental' }, { label: project.clientName || 'Kontrak' }, { label: 'Timesheet Detail' }]} />
        <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Kontrak
          <select value={project.id} onChange={(event) => onNavigate(`admin/rental/${event.target.value}`)} className="input-control h-9 w-full max-w-sm text-xs normal-case tracking-normal sm:w-80" aria-label="Ganti kontrak rental">
            {projects.map((option) => <option key={option.id} value={option.id}>{option.clientName ? `${option.clientName} — ` : ''}{option.projectName}{option.isDemo ? ' (contoh)' : ''}</option>)}
            {!projects.some((option) => option.id === project.id) && <option value={project.id}>{project.projectName}</option>}
          </select>
        </label>
      </div>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{project.projectName}</h1>
            <StatusBadge status={project.status} map={RENTAL_STATUS} />
            {project.isDemo && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-600">Contoh</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-700">{project.projectCode}</span>
            {project.contractNo && <span>📄 {project.contractNo}</span>}
            <span>💳 {BILLING_METHODS[project.billingMethod] || 'Metode tagihan belum diisi'}</span>
            {project.location && <span>📍 {project.location}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {permissions.updateProject && !isFinal && <a href={`#/admin/rental/${project.id}/edit`} className="btn btn-secondary text-xs">✎ Ubah</a>}
          {['planned', 'cancelled', 'active', 'completed'].filter((status) => transitions.includes(status)).map((status) => (
            <button key={status} type="button" disabled={busy} onClick={() => changeStatus(status)} className={STATUS_ACTIONS[status].className}>{STATUS_ACTIONS[status].label}</button>
          ))}
        </div>
      </div>

      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      {project.isDemo && <MockBanner>Kontrak contoh — unit dan timesheet di bawah adalah data dummy yang hanya tersimpan di browser ini.</MockBanner>}

      <section className="mb-5" aria-label="Unit disewa">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Unit Disewa · {units.length}</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {unitsEntry?.loading && !units.length && <div className="card-panel w-60 shrink-0 p-4 text-xs text-slate-500">Memuat unit...</div>}
          {unitsEntry?.error && <div className="w-72 shrink-0 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">{unitsEntry.error}</div>}
          {units.map((row) => <UnitCard key={row.key} project={project} unit={row} selected={unit?.key === row.key} />)}
          {!isFinal && (permissions.requestUnit || project.isDemo) && (
            <a href={`#/admin/rental/${project.id}/unit/new`} className="flex w-44 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 p-3.5 text-sm font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-50">
              <span className="text-xl">+</span>
              Unit Baru
            </a>
          )}
        </div>
      </section>

      {!unit ? (
        !unitsEntry?.loading && (
          <div className="card-panel flex flex-col items-center px-6 py-12 text-center">
            <span className="text-3xl" aria-hidden="true">🚜</span>
            <p className="mt-3 text-sm font-bold text-slate-900">Belum ada unit di kontrak ini</p>
            <p className="mt-1 max-w-md text-xs text-slate-500">Ajukan unit lewat tombol “Unit Baru”. Timesheet tampil setelah Divisi Alat menyetujui dan menentukan unit fisiknya.</p>
          </div>
        )
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoTile label="Penyewa" value={project.clientName} sub={project.location} />
            <InfoTile
              label="Periode Kontrak"
              value={project.contractStartDate ? `${formatDate(project.contractStartDate)} – ${formatDate(project.contractEndDate)}` : '-'}
              sub={unit.neededDate ? `Unit dibutuhkan ${formatDate(unit.neededDate)}` : undefined}
            />
            <InfoTile label="Alat" value={unit.typeName} sub={[unit.meta?.packet && PACKETS[unit.meta.packet] ? `Paket: ${PACKETS[unit.meta.packet].label}` : null, unit.locationDetail].filter(Boolean).join(' · ') || undefined} />
            <InfoTile label="Operator" value={unit.meta?.operator} sub={unit.requestCode ? `Request ${unit.requestCode}` : undefined} />
          </div>

          {unit.status === 'active' || (unit.status === 'closed' && unit.equipmentItemId) || unit.kind === 'demo' ? (
            <UnitTimesheet key={unit.key} project={project} unit={unit} canRecord={canRecord && unit.status === 'active' && !isFinal} />
          ) : (
            <div className="card-panel flex flex-col items-center px-6 py-12 text-center">
              <StatusBadge status={unit.status} map={UNIT_STATUS} />
              <p className="mt-3 max-w-md text-sm text-slate-700">
                {unit.status === 'requested' && 'Request unit ini sedang menunggu keputusan Divisi Alat. Timesheet bisa diisi setelah disetujui dan unit fisiknya ditentukan.'}
                {unit.status === 'unbound' && 'Request sudah disetujui. Divisi Alat belum menentukan unit fisiknya, jadi jam kerja belum bisa dicatat.'}
                {unit.status === 'rejected' && `Request ditolak Divisi Alat.${unit.notes ? ` Alasan: ${unit.notes}` : ''}`}
                {unit.status === 'cancelled' && 'Request ini sudah dibatalkan.'}
                {unit.status === 'closed' && 'Unit ini sudah selesai disewa.'}
              </p>
              {unit.kind === 'request' && unit.requestStatus === 'equipment_review' && permissions.requestUnit && (
                <button type="button" disabled={busy} onClick={() => cancelRequest(unit)} className="btn btn-secondary mt-4 text-xs text-red-600">Batalkan Request</button>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
