import { useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../../project/components/FormPage.jsx';
import { MockBanner } from '../../project/components/ProjectUi.jsx';
import { formatNumber, todayIso } from '../../project/utils/projectFormat.js';
import { SESSIONS, minutesBetween } from '../utils/rentalFormat.js';
import { createRentalWorkhour } from '../services/rentalService.js';
import { addDemoLogs } from '../services/rentalDemoService.js';

const initialSessions = () => Object.fromEntries(SESSIONS.map((session) => [session.key, {
  enabled: session.key !== 'overtime',
  start: session.defaultStart,
  end: session.defaultEnd,
}]));

/**
 * Input satu lembar timesheet harian. Tiap sesi yang diisi menjadi SATU
 * workhour log (startedAt..stoppedAt) — bentuk yang disimpan backend —
 * lalu dikelompokkan lagi per tanggal di tabel rekap.
 */
export default function SheetFormPage({ project, unit, onCancel, onSaved }) {
  const [workDate, setWorkDate] = useState(todayIso());
  const [sessions, setSessions] = useState(initialSessions);
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const setSession = (key, patch) => {
    setSessions((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
    setErrors((current) => ({ ...current, [key]: undefined, sessions: undefined }));
  };

  const hoursOf = (session) => {
    const minutes = minutesBetween(session.start, session.end);
    return minutes ? Math.round((minutes / 60) * 100) / 100 : null;
  };
  const filled = SESSIONS.filter((session) => sessions[session.key].enabled);
  const total = filled.reduce((sum, session) => sum + (hoursOf(sessions[session.key]) || 0), 0);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!workDate) nextErrors.workDate = 'Tanggal wajib diisi.';
    else if (workDate > todayIso()) nextErrors.workDate = 'Tanggal tidak boleh di masa depan.';
    if (filled.length === 0) nextErrors.sessions = 'Isi minimal satu sesi kerja.';
    filled.forEach((session) => {
      if (!hoursOf(sessions[session.key])) nextErrors[session.key] = 'Jam akhir harus setelah jam awal.';
    });
    if (total > 24) nextErrors.sessions = 'Total jam satu hari maksimal 24.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const payloads = filled.map((session) => ({
      workDate,
      startedAt: new Date(`${workDate}T${sessions[session.key].start}:00`).toISOString(),
      stoppedAt: new Date(`${workDate}T${sessions[session.key].end}:00`).toISOString(),
      totalWorkhour: hoursOf(sessions[session.key]),
      // Keterangan cukup di sesi pertama supaya tidak terulang di rekap.
      description: session === filled[0] ? description.trim() || null : null,
    }));

    setBusy(true);
    setFormError('');
    if (unit.kind === 'demo') {
      try {
        await addDemoLogs(unit.key, payloads);
        onSaved({ workDate, total });
      } catch (error) {
        setFormError(error.message);
        setBusy(false);
      }
      return;
    }

    // Backend menerima satu sesi per request. Kirim berurutan supaya kalau ada
    // yang ditolak (mis. melewati 24 jam), sesi yang sudah masuk diketahui.
    const saved = [];
    for (const [index, payload] of payloads.entries()) {
      try {
        await createRentalWorkhour(unit.poolItemId, payload);
        saved.push(filled[index].label);
      } catch (error) {
        setFormError(saved.length
          ? `Sesi ${saved.join(', ')} tersimpan, tetapi sesi ${filled[index].label} gagal: ${error.message}`
          : error.message);
        setBusy(false);
        return;
      }
    }
    onSaved({ workDate, total });
  };

  return (
    <FormPage
      breadcrumb={[{ label: 'Rental', href: '#/admin/rental' }, { label: project.projectName, href: `#/admin/rental/${project.id}/unit/${unit.key}` }, { label: unit.assetCode || unit.typeName }, { label: 'Input Sheet' }]}
      icon="📝"
      title="Input Sheet"
      subtitle={`${unit.typeName} · ${unit.assetCode || '-'}${unit.meta?.operator ? ` · Operator ${unit.meta.operator}` : ''}`}
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Simpan Sheet"
      footerNote={`Total ${formatNumber(total)} jam`}
      aside={(
        <InfoCard title="Ketentuan">
          <p>Setiap sesi tersimpan sebagai satu catatan jam kerja dan ikut menggerakkan counter maintenance unit.</p>
          <p>Total jam per unit per hari maksimal 24 jam, termasuk catatan lain di tanggal yang sama.</p>
          <p>Hari libur cukup tidak diisi — tabel rekap menandainya otomatis.</p>
        </InfoCard>
      )}
    >
      {unit.kind === 'demo' && <MockBanner>Unit contoh — sheet hanya tersimpan di browser ini.</MockBanner>}
      <FormError>{formError}</FormError>

      <Field label="Tanggal" htmlFor="workDate" required error={errors.workDate}>
        <input id="workDate" type="date" max={todayIso()} value={workDate} onChange={(event) => { setWorkDate(event.target.value); setErrors((current) => ({ ...current, workDate: undefined })); }} className="input-control text-sm sm:max-w-xs" />
      </Field>

      <fieldset>
        <legend className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Sesi Kerja</legend>
        {errors.sessions && <p className="mt-1 text-[11px] font-medium text-red-600">{errors.sessions}</p>}
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
          {SESSIONS.map((session) => {
            const value = sessions[session.key];
            const hours = value.enabled ? hoursOf(value) : null;
            return (
              <div key={session.key} className={`grid grid-cols-[7rem_1fr_1fr_4.5rem] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${value.enabled ? 'bg-white' : 'bg-slate-50'}`}>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <input type="checkbox" checked={value.enabled} onChange={(event) => setSession(session.key, { enabled: event.target.checked })} className="accent-brand-700" />
                  {session.label}
                </label>
                <input type="time" aria-label={`${session.label} awal`} value={value.start} disabled={!value.enabled} onChange={(event) => setSession(session.key, { start: event.target.value })} className="input-control h-9 font-mono text-sm disabled:bg-slate-100" />
                <input type="time" aria-label={`${session.label} akhir`} value={value.end} disabled={!value.enabled} onChange={(event) => setSession(session.key, { end: event.target.value })} className="input-control h-9 font-mono text-sm disabled:bg-slate-100" />
                <span className={`text-right font-mono text-sm font-bold ${hours ? 'text-brand-700' : 'text-slate-300'}`}>{hours ? `${formatNumber(hours)} j` : '-'}</span>
                {errors[session.key] && <p className="col-span-4 text-[11px] font-medium text-red-600">{errors[session.key]}</p>}
              </div>
            );
          })}
          <div className="flex items-center justify-between bg-brand-700 px-4 py-2.5 text-white">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Jam</span>
            <span className="font-mono text-lg font-bold">{formatNumber(total)} Jam</span>
          </div>
        </div>
      </fieldset>

      <Field label="Keterangan" htmlFor="description">
        <input id="description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} className="input-control text-sm" placeholder="Contoh: Langsir material sirtu" />
      </Field>
    </FormPage>
  );
}
