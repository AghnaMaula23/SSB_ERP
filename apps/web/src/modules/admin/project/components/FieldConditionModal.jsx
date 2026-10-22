import { useEffect } from 'react';
import { StatusBadge } from './ProjectUi.jsx';
import { PROGRESS_STATUS, formatDate, formatDateTime, formatVolume } from '../utils/projectFormat.js';

function Row({ label, children }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-sm text-slate-800">{children || <span className="text-slate-400">-</span>}</dd>
    </div>
  );
}

/** Detail baca-saja satu progress harian: cuaca, kondisi lapangan, insiden. */
export default function FieldConditionModal({ log, unit, onClose }) {
  useEffect(() => {
    const handleKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const condition = log.fieldCondition || {};

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-content max-w-lg" role="dialog" aria-modal="true" aria-labelledby="field-condition-title">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-lg" aria-hidden="true">🌤️</span>
            <div>
              <h2 id="field-condition-title" className="text-base font-bold text-slate-900">Kondisi Lapangan</h2>
              <p className="text-xs text-slate-500">{formatDate(log.progressDate, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost px-2 py-1 text-slate-400 hover:text-slate-600" aria-label="Tutup">✕</button>
        </header>

        <div className="space-y-5 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Realisasi</p>
              <p className="text-lg font-bold text-teal-700">{formatVolume(log.realizedVolume, unit)}</p>
            </div>
            <StatusBadge status={log.status} map={PROGRESS_STATUS} />
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <Row label="Cuaca Pagi">{condition.weatherMorning}</Row>
            <Row label="Cuaca Siang">{condition.weatherAfternoon}</Row>
          </dl>
          <dl className="space-y-4">
            <Row label="Catatan Kondisi Lapangan">{condition.fieldConditionNotes}</Row>
            <Row label="Insiden">{condition.incidentNotes}</Row>
            <Row label="Catatan Progress">{log.notes}</Row>
          </dl>

          <p className="border-t border-slate-200 pt-3 text-[11px] text-slate-400">
            Dicatat {log.createdBy?.fullName || log.createdBy?.username || '-'} · {formatDateTime(log.createdAt)}
            {log.validatedAt && log.status !== 'submitted' && <> · Divalidasi {log.validatedBy?.fullName || log.validatedBy?.username || '-'} · {formatDateTime(log.validatedAt)}</>}
          </p>
        </div>
      </div>
    </div>
  );
}
