import { useEffect, useMemo, useState } from 'react';
import FormPage, { Field, FormError, InfoCard } from '../components/FormPage.jsx';
import { EmptyPanel, LoadingPanel } from '../components/ProjectUi.jsx';
import { WORKER_TYPES, createLaborLog, getLaborLog, listAllWorkers, listAssignmentsOn, quickCreateWorker, updateLaborLog } from '../services/workerService.js';
import { formatCurrency, formatDate, stageCrumbs, todayIso } from '../utils/projectFormat.js';
import { divisionPrefix } from '../../utils/divisionRoute.js';

const fromAssignment = (row) => ({
  workerId: row.worker.id,
  name: row.worker.fullName,
  code: row.worker.workerCode,
  present: true,
  workerRole: row.role || '',
  workerType: row.workerType,
  dailyWage: String(row.dailyWage ?? ''),
  hasOvertime: false,
  overtimeAmount: '',
  taskNotes: '',
});

const fromLogItem = (item) => ({
  workerId: item.worker.id,
  name: item.worker.fullName,
  code: item.worker.workerCode,
  present: true,
  workerRole: item.workerRole,
  workerType: item.workerType,
  dailyWage: String(item.dailyWage),
  hasOvertime: item.overtimeAmount > 0,
  overtimeAmount: item.overtimeAmount > 0 ? String(item.overtimeAmount) : '',
  taskNotes: item.taskNotes || '',
});

/**
 * Form log harian: satu form untuk semua pekerja satu tanggal. Isi awal dari
 * penugasan yang berlaku di tanggal itu; pekerja lain bisa ditambah dari master
 * atau didaftarkan cepat cukup dengan nama (P6). Baris yang tidak dicentang
 * tidak dikirim. Simpan ulang mengirim daftar lengkap.
 */
export default function LaborLogFormPage({ project, stage, logId, onCancel, onSaved }) {
  const isEdit = Boolean(logId);
  const [workDate, setWorkDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [loaded, setLoaded] = useState({ date: null, rows: null });
  const [masters, setMasters] = useState([]);
  const [pickId, setPickId] = useState('');
  const [quickName, setQuickName] = useState('');
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [rowErrors, setRowErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listAllWorkers().then((data) => { if (!cancelled) setMasters(data); }).catch(() => {});
    if (isEdit) {
      getLaborLog(logId)
        .then((log) => {
          if (cancelled) return;
          setWorkDate(log.workDate);
          setNotes(log.notes || '');
          setLoaded({ date: log.workDate, rows: log.items.map(fromLogItem) });
          setLocked(log.claim);
        })
        .catch((error) => { if (!cancelled) setLoadError(error.message); });
    }
    return () => { cancelled = true; };
  }, [isEdit, logId]);

  // Log baru: isi awal mengikuti penugasan yang berlaku pada tanggal terpilih.
  useEffect(() => {
    if (isEdit || !workDate) return undefined;
    let cancelled = false;
    listAssignmentsOn(stage.id, workDate)
      .then((data) => { if (!cancelled) setLoaded({ date: workDate, rows: data.map(fromAssignment) }); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [isEdit, stage.id, workDate]);

  const rows = loaded.date === workDate ? loaded.rows : null;
  const setRows = (update) => setLoaded((current) => ({ ...current, rows: update(current.rows) }));
  const present = useMemo(() => (rows || []).filter((row) => row.present), [rows]);
  const totalOf = (row) => (Number(row.dailyWage) || 0) + (row.hasOvertime ? Number(row.overtimeAmount) || 0 : 0);
  const total = present.reduce((sum, row) => sum + totalOf(row), 0);
  const addable = masters.filter((worker) => !(rows || []).some((row) => row.workerId === worker.id));

  const setRow = (workerId, patch) => {
    setRows((current) => current.map((row) => (row.workerId === workerId ? { ...row, ...patch } : row)));
    setRowErrors((current) => ({ ...current, [workerId]: undefined }));
  };

  const addWorker = (worker) => setRows((current) => [...current, {
    workerId: worker.id, name: worker.fullName, code: worker.workerCode, present: true,
    workerRole: worker.defaultRole || '', workerType: 'daily', dailyWage: '', hasOvertime: false, overtimeAmount: '', taskNotes: '',
  }]);

  const handleQuickAdd = async () => {
    if (!quickName.trim()) return;
    setFormError('');
    try {
      const worker = await quickCreateWorker(quickName);
      setMasters((current) => [...current, worker]);
      addWorker(worker);
      setQuickName('');
    } catch (error) {
      setFormError(error.message);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = {};
    present.forEach((row) => {
      if (!row.workerRole.trim()) errors[row.workerId] = 'Peran wajib diisi.';
      else if (!(Number(row.dailyWage) > 0)) errors[row.workerId] = 'Upah harus lebih dari 0 — pekerja kontrak juga berupah harian.';
      else if (row.hasOvertime && !(Number(row.overtimeAmount) > 0)) errors[row.workerId] = 'Isi nominal lembur, atau hilangkan centangnya.';
    });
    setRowErrors(errors);
    if (!present.length) { setFormError('Centang minimal satu pekerja yang hadir.'); return; }
    if (Object.keys(errors).length) { setFormError('Periksa baris yang ditandai.'); return; }

    const items = present.map((row) => ({
      projectWorkerId: row.workerId,
      workerRole: row.workerRole.trim(),
      workerType: row.workerType,
      dailyWage: Number(row.dailyWage),
      overtimeAmount: row.hasOvertime ? Number(row.overtimeAmount) : 0,
      taskNotes: row.taskNotes.trim() || null,
    }));
    setBusy(true);
    setFormError('');
    try {
      if (isEdit) await updateLaborLog(logId, notes, items);
      else await createLaborLog(stage.id, workDate, notes, items);
      onSaved(`Log ${formatDate(workDate)} tersimpan: ${items.length} pekerja, ${formatCurrency(total)}.`);
    } catch (error) {
      setFormError(error.message);
      setBusy(false);
    }
  };

  if (loadError) return <EmptyPanel icon="⚠️" title="Data log tidak bisa dimuat">{loadError}</EmptyPanel>;
  if (stage.status !== 'active') {
    return <EmptyPanel icon="⏸️" title="Tahapan tidak aktif" action={<button type="button" onClick={onCancel} className="btn btn-secondary text-xs">← Kembali</button>}>Log harian hanya bisa dicatat untuk tahapan yang sedang berjalan.</EmptyPanel>;
  }
  if (locked) {
    return <EmptyPanel icon="🔒" title="Log terkunci" action={<button type="button" onClick={onCancel} className="btn btn-secondary text-xs">← Kembali</button>}>Log ini masuk klaim upah {locked.claimCode}. Ubah setelah klaim ditolak atau dibatalkan.</EmptyPanel>;
  }

  return (
    <FormPage
      breadcrumb={stageCrumbs(project, stage, { label: 'Log Harian', href: `#/${divisionPrefix()}/projects/${project.id}/sub/${stage.id}/log` }, { label: isEdit ? formatDate(workDate) : 'Catat Log' })}
      icon="📝"
      title={isEdit ? `Ubah Log ${formatDate(workDate)}` : 'Catat Log Harian'}
      subtitle="Upah kontrak dan harian sama-sama dihitung per hari."
      busy={busy}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Simpan Log"
      footerNote={`${present.length} pekerja · total ${formatCurrency(total)}`}
      aside={(
        <InfoCard title="Aturan log">
          <p>Satu orang hanya boleh tercatat di satu log per tanggal, lintas tahapan dan project.</p>
          <p>Lembur berupa nominal, bukan jam. Total baris = upah + lembur.</p>
          <p>Log tidak divalidasi di sini: pemeriksaan terjadi di klaim upah, dan log di klaim aktif terkunci.</p>
        </InfoCard>
      )}
    >
      <FormError>{formError}</FormError>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal Kerja" htmlFor="workDate" required hint={isEdit ? 'Salah tanggal: hapus log lalu catat ulang.' : undefined}>
          <input id="workDate" type="date" max={todayIso()} disabled={isEdit} value={workDate} onChange={(event) => setWorkDate(event.target.value)} className="input-control text-sm disabled:bg-slate-100" />
        </Field>
        <Field label="Catatan Lapangan" htmlFor="notes">
          <input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className="input-control text-sm" placeholder="Opsional" />
        </Field>
      </div>

      {!rows ? <LoadingPanel>Memuat penugasan...</LoadingPanel> : (
        <div className="space-y-2">
          {rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">Tidak ada penugasan pada tanggal ini. Tambahkan pekerja di bawah.</p>}
          {rows.map((row) => (
            <div key={row.workerId} className={`rounded-lg border p-3 ${row.present ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-70'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
                  <input type="checkbox" checked={row.present} onChange={(event) => setRow(row.workerId, { present: event.target.checked })} className="accent-brand-700" />
                  <span className="truncate">{row.name}</span>
                  <span className="font-mono text-[11px] font-normal text-slate-400">{row.code}</span>
                </label>
                <span className="font-mono text-xs font-bold text-brand-700">{row.present ? formatCurrency(totalOf(row)) : 'Tidak hadir'}</span>
              </div>
              {row.present && (
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_minmax(0,1fr)]">
                  <input aria-label={`Peran ${row.name}`} value={row.workerRole} onChange={(event) => setRow(row.workerId, { workerRole: event.target.value })} maxLength={100} className="input-control h-9 text-xs" placeholder="Peran" />
                  <select aria-label={`Jenis ${row.name}`} value={row.workerType} onChange={(event) => setRow(row.workerId, { workerType: event.target.value })} className="input-control h-9 text-xs">
                    {Object.entries(WORKER_TYPES).map(([value, type]) => <option key={value} value={value}>{type.label}</option>)}
                  </select>
                  <input aria-label={`Upah ${row.name}`} type="number" min="0" step="any" value={row.dailyWage} onChange={(event) => setRow(row.workerId, { dailyWage: event.target.value })} className="input-control h-9 font-mono text-xs" placeholder="Upah / hari" />
                  <input aria-label={`Catatan tugas ${row.name}`} value={row.taskNotes} onChange={(event) => setRow(row.workerId, { taskNotes: event.target.value })} maxLength={500} className="input-control h-9 text-xs" placeholder={row.hasOvertime ? 'Alasan lembur' : 'Catatan tugas (opsional)'} />
                  <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-4">
                    <input type="checkbox" checked={row.hasOvertime} onChange={(event) => setRow(row.workerId, { hasOvertime: event.target.checked })} className="accent-brand-700" />
                    Lembur
                    {row.hasOvertime && <input aria-label={`Nominal lembur ${row.name}`} type="number" min="0" step="any" value={row.overtimeAmount} onChange={(event) => setRow(row.workerId, { overtimeAmount: event.target.value })} className="input-control h-8 w-36 font-mono text-xs" placeholder="Nominal" />}
                  </label>
                </div>
              )}
              {rowErrors[row.workerId] && <p className="mt-1 text-[11px] font-medium text-red-600">{rowErrors[row.workerId]}</p>}
            </div>
          ))}

          <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
            <select aria-label="Tambah dari master pekerja" value={pickId} onChange={(event) => {
              const worker = addable.find((item) => String(item.id) === event.target.value);
              if (worker) addWorker(worker);
              setPickId('');
            }} className="input-control h-9 text-xs">
              <option value="">+ Tambah dari master pekerja</option>
              {addable.map((worker) => <option key={worker.id} value={worker.id}>{worker.fullName} ({worker.workerCode})</option>)}
            </select>
            <div className="flex gap-2">
              <input aria-label="Nama pekerja baru" value={quickName} onChange={(event) => setQuickName(event.target.value)} maxLength={150} className="input-control h-9 min-w-0 flex-1 text-xs" placeholder="Pekerja baru: ketik nama" />
              <button type="button" onClick={handleQuickAdd} className="btn btn-secondary shrink-0 text-xs">Daftarkan</button>
            </div>
          </div>
        </div>
      )}
    </FormPage>
  );
}
