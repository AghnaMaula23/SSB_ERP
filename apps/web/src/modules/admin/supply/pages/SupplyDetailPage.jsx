import { useEffect, useMemo, useRef, useState } from 'react';
import { Breadcrumb, MetricCard, MockBanner, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { STATUS_TRANSITIONS, formatDate, formatNumber } from '../../project/utils/projectFormat.js';
import { DELIVERY_COLUMNS, SUPPLY_STATUS, totalsByUnit } from '../utils/supplyFormat.js';
import { changeSupplyProjectStatus } from '../services/supplyService.js';
import { changeDemoSupplyStatus } from '../services/demoSupplyService.js';
import { getDeliveryNoteUrl, listProjectDeliveries } from '../services/deliveryService.js';
import { downloadCsv } from '../../../../utils/csv.js';

const COLUMN_PREF_KEY = 'admin-supply-columns';
// Kolom pelengkap disembunyikan sampai user memilih sendiri lewat menu Columns,
// supaya tabel tetap terbaca tanpa menggulir ke samping.
const DEFAULT_HIDDEN = ['vehicleType', 'originLocation'];

function readHiddenColumns() {
  try {
    const stored = localStorage.getItem(COLUMN_PREF_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_HIDDEN;
  } catch {
    return DEFAULT_HIDDEN;
  }
}

/** Pilihan kolom tabel — panel kecil di bawah tombol, bukan modal. */
function ColumnsMenu({ hidden, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="btn btn-secondary text-xs">⚙ Columns</button>
      {open && (
        <div className="absolute right-0 top-11 z-20 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {DELIVERY_COLUMNS.filter((column) => column.toggle !== false).map((column) => (
            <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={!hidden.includes(column.key)}
                onChange={(event) => onChange(event.target.checked ? hidden.filter((key) => key !== column.key) : [...hidden, column.key])}
                className="accent-teal-700"
              />
              {column.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_ACTIONS = {
  active: { label: '▶ Mulai Operasional', className: 'btn btn-primary text-xs', confirm: 'Mulai operasional kontrak ini?' },
  planned: { label: '⏸ Tunda', className: 'btn btn-secondary text-xs', confirm: 'Kembalikan kontrak ke status planned?' },
  cancelled: { label: 'Batalkan', className: 'btn btn-ghost text-xs text-red-600 hover:bg-red-50', confirm: 'Batalkan kontrak ini? Status final dan tidak bisa dikembalikan.' },
  completed: { label: '✓ Selesai', className: 'btn btn-danger text-xs shadow-sm', confirm: 'Tandai kontrak supply selesai? Data kontrak tidak bisa diubah lagi.' },
};

/**
 * Rekap ritase satu kontrak supply — baca-saja. Ritase dicatat Divisi Lapangan
 * lewat API delivery (backlog E15); kontrak contoh memakai data contoh.
 */
export default function SupplyDetailPage({ project, projects, permissions, initialNotice, onNavigate, onProjectChanged }) {
  const [result, setResult] = useState({ key: null, rows: [], error: '' });
  const [hidden, setHidden] = useState(readHiddenColumns);
  const [search, setSearch] = useState('');
  const [material, setMaterial] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });
  const [busy, setBusy] = useState(false);
  const isFinal = ['completed', 'cancelled'].includes(project.status);
  const loading = result.key !== project.id;

  useEffect(() => {
    let cancelled = false;
    listProjectDeliveries(project)
      .then((rows) => { if (!cancelled) setResult({ key: project.id, rows, error: '' }); })
      .catch((error) => { if (!cancelled) setResult({ key: project.id, rows: [], error: error.message }); });
    return () => { cancelled = true; };
  }, [project]);

  const rows = useMemo(() => (loading ? [] : result.rows), [loading, result.rows]);
  const active = useMemo(() => rows.filter((row) => !row.isCancelled), [rows]);
  const materials = useMemo(() => [...new Set(rows.map((row) => row.material))].sort(), [rows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => (showCancelled || !row.isCancelled)
        && (!query || [row.deliveryNoteNo, row.plateNumber, row.driverName, row.supplier, row.originLocation, row.destinationLocation].some((value) => String(value || '').toLowerCase().includes(query)))
        && (!material || row.material === material)
        && (!startDate || row.deliveryDate >= startDate)
        && (!endDate || row.deliveryDate <= endDate))
      .sort((a, b) => (a.deliveryDate === b.deliveryDate ? a.deliveryNoteNo.localeCompare(b.deliveryNoteNo) : a.deliveryDate.localeCompare(b.deliveryDate)));
  }, [endDate, material, rows, search, showCancelled, startDate]);

  // Ritase batal boleh ditampilkan, tapi tidak ikut dihitung.
  const counted = filtered.filter((row) => !row.isCancelled);
  const totals = totalsByUnit(counted);
  const fleet = new Set(counted.map((row) => row.plateNumber));
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = active.filter((row) => row.deliveryDate === today);
  const pendingReceipt = active.filter((row) => !row.received).length;
  const cancelledCount = rows.length - active.length;
  const columns = DELIVERY_COLUMNS.filter((column) => !hidden.includes(column.key));
  const volumeIndex = columns.findIndex((column) => column.key === 'volume');

  const changeHidden = (next) => {
    setHidden(next);
    try { localStorage.setItem(COLUMN_PREF_KEY, JSON.stringify(next)); } catch { /* preferensi tampilan saja */ }
  };

  const runStatus = async (status) => {
    if (!window.confirm(STATUS_ACTIONS[status].confirm)) return;
    setBusy(true);
    setNotice({ tone: 'success', text: '' });
    try {
      const updated = project.isDemo ? await changeDemoSupplyStatus(project.id, status) : await changeSupplyProjectStatus(project.id, status);
      onProjectChanged(updated);
      setNotice({ tone: 'success', text: `Status kontrak kini "${SUPPLY_STATUS[status].label}".` });
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  // URL file berlaku 5 menit — diminta setiap kali dibuka. Tab dibuka lebih
  // dulu (masih di dalam klik) supaya tidak diblokir popup blocker.
  const openNote = async (row) => {
    const tab = window.open('', '_blank');
    try {
      const url = await getDeliveryNoteUrl(row.fileId);
      if (tab) { tab.opener = null; tab.location.href = url; } else { window.location.assign(url); }
    } catch (error) {
      tab?.close();
      setNotice({ tone: 'error', text: `Surat jalan ${row.deliveryNoteNo} tidak bisa dibuka: ${error.message}` });
    }
  };

  const exportCsv = () => {
    downloadCsv(`ritase-${project.projectCode}.csv`, filtered, [
      ...DELIVERY_COLUMNS.map((column) => ({
        label: column.label,
        value: (row) => (column.key === 'received' ? (row.received ? 'Diterima' : 'Belum') : row[column.key]),
      })),
      { label: 'Satuan', value: (row) => row.unit },
      { label: 'Status', value: (row) => (row.isCancelled ? `Dibatalkan: ${row.cancelReason || ''}` : 'Aktif') },
    ]);
  };

  const cell = (row, key) => {
    if (key === 'deliveryDate') return <span className="whitespace-nowrap">{formatDate(row.deliveryDate)}</span>;
    if (key === 'deliveryNoteNo') {
      return (
        <span className="whitespace-nowrap">
          {row.fileId
            ? <button type="button" onClick={() => openNote(row)} className="font-mono text-xs font-semibold text-teal-700 hover:underline" title="Buka file surat jalan">📎 {row.deliveryNoteNo}</button>
            : <span className="font-mono text-xs font-semibold text-slate-800">{row.deliveryNoteNo}</span>}
          {row.isCancelled && <span className="ml-1.5 rounded bg-red-50 px-1 py-0.5 text-[10px] font-bold uppercase text-red-600" title={row.cancelReason || undefined}>Batal</span>}
        </span>
      );
    }
    if (key === 'plateNumber') return <span className="whitespace-nowrap font-mono text-xs">{row.plateNumber}</span>;
    if (key === 'received') {
      if (row.isCancelled) return <span className="text-[11px] text-slate-400">-</span>;
      return row.received
        ? <span className="whitespace-nowrap text-[11px] font-semibold text-emerald-700">✓ Diterima</span>
        : <span className="whitespace-nowrap text-[11px] font-semibold text-amber-700">Belum</span>;
    }
    if (key === 'volume') return <span className="whitespace-nowrap font-mono font-bold text-slate-900">{formatNumber(row.volume)} <span className="text-[11px] font-medium text-slate-500">{row.unit}</span></span>;
    return row[key] || '-';
  };

  const transitions = permissions.updateProject ? STATUS_TRANSITIONS[project.status] || [] : [];
  const totalText = totals.length ? totals.map((total) => `${formatNumber(total.volume)} ${total.unit}`).join(' · ') : '0';

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb items={[{ label: 'Supply', href: '#/admin/supply' }, { label: project.clientName || 'Kontrak' }, { label: 'Rekap Ritase' }]} />
        <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Kontrak
          <select
            value={project.id}
            onChange={(event) => onNavigate(`admin/supply/${event.target.value}`)}
            className="input-control h-9 w-full max-w-sm text-xs normal-case tracking-normal sm:w-80"
            aria-label="Ganti kontrak supply"
          >
            {projects.map((option) => <option key={option.id} value={option.id}>{option.clientName ? `${option.clientName} — ` : ''}{option.projectName}{option.isDemo ? ' (contoh)' : ''}</option>)}
            {!projects.some((option) => option.id === project.id) && <option value={project.id}>{project.projectName}</option>}
          </select>
        </label>
      </div>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{project.projectName}{project.clientName && !project.projectName.includes(project.clientName) ? ` - ${project.clientName}` : ''}</h1>
            <StatusBadge status={project.status} map={SUPPLY_STATUS} />
            {project.isDemo && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-600">Contoh</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-700">{project.projectCode}</span>
            {project.contractNo && <span>📄 {project.contractNo}</span>}
            {project.location && <span>📍 {project.location}</span>}
            <span>🗓 {project.contractStartDate ? `${formatDate(project.contractStartDate)} – ${formatDate(project.contractEndDate)}` : 'Periode belum diisi'}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ColumnsMenu hidden={hidden} onChange={changeHidden} />
          <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className="btn btn-secondary text-xs">↓ Export CSV</button>
          {permissions.updateProject && !isFinal && <a href={`#/admin/supply/${project.id}/edit`} className="btn btn-secondary text-xs">✎ Ubah</a>}
          {['planned', 'cancelled', 'active', 'completed'].filter((status) => transitions.includes(status)).map((status) => (
            <button key={status} type="button" disabled={busy} onClick={() => runStatus(status)} className={STATUS_ACTIONS[status].className}>{STATUS_ACTIONS[status].label}</button>
          ))}
        </div>
      </div>

      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      {project.isDemo && <MockBanner>Kontrak ini kontrak contoh, dan seluruh datanya (termasuk ritase) hanya tersimpan di browser ini.</MockBanner>}
      {!loading && result.error && <Notice tone="error">Ritase gagal dimuat: {result.error}</Notice>}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Volume" value={<span className="text-xl">{totalText}</span>} hint={`${counted.length} ritase pada filter ini`} accent tone="teal" loading={loading} />
        <MetricCard label="Armada" value={<>{fleet.size} <span className="text-sm font-medium text-slate-500">kendaraan</span></>} hint={`${new Set(todayRows.map((row) => row.plateNumber)).size} jalan hari ini · ${todayRows.length} ritase`} loading={loading} />
        <MetricCard label="Menunggu Penerimaan" value={pendingReceipt} hint={cancelledCount ? `${cancelledCount} ritase dibatalkan` : 'Belum dikonfirmasi penerima'} tone={pendingReceipt ? 'amber' : undefined} loading={loading} />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">ⓘ Pencatatan</p>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-800">Ritase & surat jalan dicatat Divisi Lapangan. Volume mengikuti satuan jenis material masing-masing.</p>
        </div>
      </div>

      <section className="card-panel mb-4 p-4" aria-label="Filter ritase">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_9.5rem_9.5rem_auto] lg:items-end">
          <div>
            <label htmlFor="sp-search" className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Cari</label>
            <input id="sp-search" value={search} onChange={(event) => setSearch(event.target.value)} className="input-control mt-1 text-xs" placeholder="Surat jalan, nopol, driver, supplier..." />
          </div>
          <div>
            <label htmlFor="sp-material" className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Material</label>
            <select id="sp-material" value={material} onChange={(event) => setMaterial(event.target.value)} className="input-control mt-1 text-xs">
              <option value="">Semua material</option>
              {materials.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sp-start" className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Dari</label>
            <input id="sp-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="input-control mt-1 text-xs" />
          </div>
          <div>
            <label htmlFor="sp-end" className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Sampai</label>
            <input id="sp-end" type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className="input-control mt-1 text-xs" />
          </div>
          <button type="button" onClick={() => { setSearch(''); setMaterial(''); setStartDate(''); setEndDate(''); setShowCancelled(false); }} className="btn btn-secondary text-xs">Reset</button>
        </div>
        {cancelledCount > 0 && (
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showCancelled} onChange={(event) => setShowCancelled(event.target.checked)} className="accent-teal-700" />
            Tampilkan {cancelledCount} ritase yang dibatalkan
          </label>
        )}
      </section>

      <div className="table-container">
        <table className="table-modern">
          <thead>
            <tr>
              <th className="w-12 text-center">No</th>
              {columns.map((column) => (
                <th key={column.key} className={`whitespace-nowrap ${column.key === 'volume' ? 'bg-amber-300! text-right text-slate-900!' : ''}`}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 1} className="py-12 text-center text-sm text-slate-500">Memuat ritase...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={columns.length + 1} className="py-12 text-center text-sm text-slate-500">{rows.length ? 'Tidak ada ritase yang cocok dengan filter.' : 'Belum ada ritase. Ritase muncul di sini setelah Divisi Lapangan mencatat surat jalan untuk request material kontrak ini.'}</td></tr>
            ) : filtered.map((row, index) => (
              <tr key={row.id} className={row.isCancelled ? 'bg-slate-50 opacity-60' : ''} title={row.isCancelled ? `Dibatalkan: ${row.cancelReason || '-'}` : undefined}>
                <td className="text-center text-xs text-slate-500">{index + 1}</td>
                {columns.map((column) => (
                  <td key={column.key} className={column.key === 'volume' ? `text-right ${row.isCancelled ? 'line-through' : ''}` : 'whitespace-nowrap text-xs text-slate-700'}>{cell(row, column.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {counted.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-800 bg-slate-100">
                <td colSpan={volumeIndex + 1} className="px-4 py-4 text-center text-base font-bold uppercase tracking-[0.3em] text-slate-900">Total</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-mono text-lg font-bold text-slate-900">
                  {totals.map((total) => <span key={total.unit} className="block">{formatNumber(total.volume)} <span className="text-xs font-medium text-slate-500">{total.unit}</span></span>)}
                </td>
                {columns.length - volumeIndex - 1 > 0 && <td colSpan={columns.length - volumeIndex - 1} />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
