import { useEffect, useMemo, useState } from 'react';
import { Breadcrumb, MockBanner, ProgressBar } from '../../project/components/ProjectUi.jsx';
import { Field, FormError } from '../../project/components/FormPage.jsx';
import LineItemsEditor from '../components/LineItemsEditor.jsx';
import { formatCurrency, formatNumber, subProjectTypeLabel, todayIso } from '../../project/utils/projectFormat.js';
import { SOURCES, emptyLine, lineSubtotal, slugOf } from '../utils/incomeFormat.js';
import { billedProgressFor, createIncomeRecord, peekReferenceCode } from '../services/incomeService.js';
import {
  listConstructionProjects, listRentalContracts, listStages, listSupplyContracts,
  rentalEquipmentLines, stageEquipmentLines, supplyMaterialLines,
} from '../services/incomeSourceService.js';

const monthStart = () => `${todayIso().slice(0, 8)}01`;

function Select({ id, label, value, onChange, options, placeholder, disabled, error, hint }) {
  return (
    <Field label={label} htmlFor={id} required error={error} hint={hint}>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="input-control h-11 bg-slate-50 text-sm disabled:opacity-60">
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
  );
}

function HeroStat({ label, value }) {
  return (
    <div className="min-w-0 border-white/20 pr-5 [&:not(:first-child)]:border-l [&:not(:first-child)]:pl-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-100/80">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-white">{value}</p>
    </div>
  );
}

/**
 * Form pendapatan baru. Angka acuan (progress, jam kerja, ritase) ditarik dari
 * modul lain; Admin menambahkan tarif dan mengajukan ke Finance.
 */
export default function IncomeFormPage({ sourceType, onNavigate, onSaved }) {
  const source = SOURCES[sourceType];
  const isConstruction = sourceType === 'construction_project';
  const [reference, setReference] = useState('');
  const [contracts, setContracts] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [party, setParty] = useState('');
  const [contractId, setContractId] = useState('');
  const [stages, setStages] = useState({ projectId: '', rows: null });
  const [stageId, setStageId] = useState('');
  const [billed, setBilled] = useState({ percent: 0, amount: 0 });
  const [includeProgress, setIncludeProgress] = useState(true);
  const [period, setPeriod] = useState({ start: monthStart(), end: todayIso() });
  const [equipment, setEquipment] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [notes, setNotes] = useState('');
  const [busyFill, setBusyFill] = useState('');
  const [fillNotice, setFillNotice] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    peekReferenceCode().then((code) => { if (!cancelled) setReference(code); });
    const load = isConstruction ? listConstructionProjects() : sourceType === 'external_rental' ? listRentalContracts() : listSupplyContracts();
    load
      .then((rows) => { if (!cancelled) setContracts(rows.filter((row) => row.status !== 'cancelled')); })
      .catch((error) => { if (!cancelled) { setContracts([]); setLoadError(error.message); } });
    return () => { cancelled = true; };
  }, [isConstruction, sourceType]);

  // Sub-proyek mengikuti proyek utama yang dipilih.
  useEffect(() => {
    if (!isConstruction || !contractId) return undefined;
    let cancelled = false;
    listStages(Number(contractId))
      .then((rows) => { if (!cancelled) setStages({ projectId: contractId, rows }); })
      .catch((error) => { if (!cancelled) { setStages({ projectId: contractId, rows: [] }); setLoadError(error.message); } });
    return () => { cancelled = true; };
  }, [contractId, isConstruction]);

  useEffect(() => {
    if (!stageId) return undefined;
    let cancelled = false;
    billedProgressFor(Number(stageId)).then((value) => { if (!cancelled) setBilled(value); });
    return () => { cancelled = true; };
  }, [stageId]);

  const parties = useMemo(() => [...new Set((contracts || []).map((row) => row.clientName).filter(Boolean))].sort(), [contracts]);
  const contractOptions = (contracts || []).filter((row) => isConstruction || !party || row.clientName === party);
  const contract = (contracts || []).find((row) => String(row.id) === String(contractId));
  const stageRows = stages.projectId === contractId ? stages.rows : null;
  const stage = stageRows?.find((row) => String(row.id) === String(stageId));

  // Progress kontrak: hanya selisih progress tervalidasi dengan yang sudah ditagih.
  const progress = stage?.progress;
  const progressDelta = progress ? Math.max(0, Math.round((progress.billableProgress - billed.percent) * 100) / 100) : 0;
  const progressLine = isConstruction && stage && includeProgress && progressDelta > 0
    ? emptyLine('contract_progress_income', {
      key: 'progress',
      description: `Progress ${subProjectTypeLabel(stage.subProjectType)} tervalidasi ${formatNumber(progressDelta)}%`,
      quantity: String(progressDelta),
      unit: '%',
      rateSnapshot: String((stage.contractValue || 0) / 100),
      rateSource: 'contract_reference',
    })
    : null;

  const equipmentTotal = equipment.reduce((sum, row) => sum + lineSubtotal(row), 0);
  const materialTotal = materials.reduce((sum, row) => sum + lineSubtotal(row), 0);
  const progressTotal = progressLine ? lineSubtotal(progressLine) : 0;
  const grandTotal = equipmentTotal + materialTotal + progressTotal;

  const autofill = async (kind, target = contract, targetStage = stage) => {
    if (!target || (isConstruction && !targetStage)) return;
    setBusyFill(kind);
    setFillNotice('');
    try {
      const lines = kind === 'equipment'
        ? isConstruction ? await stageEquipmentLines(targetStage, period.start, period.end) : await rentalEquipmentLines(target, period.start, period.end)
        : await supplyMaterialLines(target, period.start, period.end);
      if (kind === 'equipment') setEquipment(lines); else setMaterials(lines);
      setFillNotice(lines.length
        ? `${lines.length} baris diisi dari ${kind === 'equipment' ? 'jam kerja alat' : 'ritase'} periode ini. Periksa tarifnya sebelum diajukan.`
        : `Tidak ada ${kind === 'equipment' ? 'jam kerja alat' : 'ritase'} pada periode ini.`);
    } catch (error) {
      setFillNotice(`Gagal mengambil data: ${error.message}`);
    } finally {
      setBusyFill('');
    }
  };

  const chooseParty = (value) => { setParty(value); setContractId(''); setEquipment([]); setMaterials([]); setErrors({}); };
  const chooseContract = (value) => {
    setContractId(value);
    setStageId('');
    setEquipment([]);
    setMaterials([]);
    setFillNotice('');
    setErrors({});
    // Rental & supply: langsung tarik jam kerja / ritase periode berjalan.
    const target = (contracts || []).find((row) => String(row.id) === String(value));
    if (target && sourceType === 'external_rental') autofill('equipment', target);
    if (target && sourceType === 'external_supply') autofill('material', target);
  };

  const validateRows = (rows, nextErrors) => rows.forEach((row) => {
    if (!row.description.trim()) nextErrors[row.key] = 'Uraian wajib diisi.';
    else if (!(Number(row.quantity) > 0)) nextErrors[row.key] = 'Kuantitas harus lebih dari 0.';
    else if (!(Number(row.rateSnapshot) > 0)) nextErrors[row.key] = 'Tarif harus lebih dari 0.';
  });

  const handleSubmit = async () => {
    const nextErrors = {};
    if (!isConstruction && !party) nextErrors.party = `Pilih ${source.partyLabel.toLowerCase()}.`;
    if (!contractId) nextErrors.contract = 'Pilih proyek.';
    if (isConstruction && !stageId) nextErrors.stage = 'Pilih sub-proyek.';
    if (!period.start || !period.end) nextErrors.period = 'Periode tagihan wajib diisi.';
    else if (period.start > period.end) nextErrors.period = 'Periode akhir tidak boleh sebelum periode mulai.';
    validateRows(equipment, nextErrors);
    validateRows(materials, nextErrors);
    if (!progressLine && equipment.length === 0 && materials.length === 0) nextErrors.items = 'Tambahkan minimal satu baris pendapatan.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setFormError('Periksa kembali isian yang ditandai merah.');
      return;
    }

    const toItem = (row) => ({
      incomeComponentType: row.incomeComponentType,
      sourceType: { equipment_income: 'equipment_workhour_log', material_income: 'material_receipt_item', contract_progress_income: 'contract_progress' }[row.incomeComponentType],
      ...(row.incomeComponentType === 'contract_progress_income' && { subProjectId: Number(stageId) }),
      ...(row.equipmentItemId && { equipmentItemId: row.equipmentItemId }),
      description: row.description.trim(),
      quantity: Number(row.quantity),
      unit: row.unit,
      rateSnapshot: Number(row.rateSnapshot),
      rateSource: row.rateSource,
      ...(row.rateNotes && { rateNotes: row.rateNotes }),
    });

    setBusy(true);
    setFormError('');
    try {
      const record = await createIncomeRecord({
        projectSourceType: sourceType,
        ...(isConstruction && { constructionProjectId: contract.id, subProjectId: Number(stageId), subProjectLabel: subProjectTypeLabel(stage.subProjectType) }),
        ...(sourceType === 'external_rental' && { externalRentalProjectId: contract.id }),
        ...(sourceType === 'external_supply' && { externalSupplyProjectId: contract.id }),
        partyName: isConstruction ? contract.clientName : party,
        projectName: contract.projectName,
        billingPeriodStart: period.start,
        billingPeriodEnd: period.end,
        adminNotes: notes.trim() || null,
        items: [...(progressLine ? [progressLine] : []), ...equipment, ...materials].map(toItem),
      });
      onSaved(record);
    } catch (error) {
      setFormError(error.message);
      setBusy(false);
    }
  };

  const heroStats = isConstruction
    ? [['Progress', formatCurrency(progressTotal)], ['Equipment', formatCurrency(equipmentTotal)], ['Material', formatCurrency(materialTotal)]]
    : sourceType === 'external_rental'
      ? [['Equipment', `${equipment.length} Unit`], ['Total Jam', `${formatNumber(equipment.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0))} Jam`]]
      : [['Jenis Material', `${materials.length} Jenis`], ['Total Volume', `${formatNumber(materials.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0))} m³`]];

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={[{ label: 'Income', href: '#/admin/income' }, { label: 'Pendapatan Baru' }]} />

      {/* Ringkasan total — selalu terlihat saat menggulir isian panjang. */}
      <section className="sticky top-16 z-10 -mx-1 mt-3 rounded-2xl bg-gradient-to-br from-teal-800 via-teal-700 to-teal-600 p-5 text-white shadow-lg sm:p-6" aria-label="Estimasi total pendapatan">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-100">Estimasi Total Pendapatan</p>
            <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{formatCurrency(grandTotal)}</p>
          </div>
          <span className="rounded-lg bg-white/10 px-2.5 py-1 font-mono text-[11px] text-teal-50">{reference || '...'}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-white/20 pt-4">
          <div className="flex flex-wrap gap-y-2">{heroStats.map(([label, value]) => <HeroStat key={label} label={label} value={value} />)}</div>
          <button type="button" onClick={handleSubmit} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-teal-800 shadow-sm transition hover:bg-teal-50 disabled:opacity-60">
            {busy ? 'Mengajukan...' : 'Submit Pendapatan ➤'}
          </button>
        </div>
      </section>

      <div className="mt-5">
        <MockBanner>Backend Income belum tersedia — pengajuan disimpan di browser ini dengan bentuk data sesuai kontrak API (Swagger <code>POST /income/records</code>). Proyek, progress, jam kerja, dan ritase tetap diambil dari modul masing-masing.</MockBanner>
      </div>

      <section className="card-panel mb-5 p-5" aria-label="Sumber pendapatan">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Sumber Pendapatan</p>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist">
          {Object.entries(SOURCES).map(([value, item]) => {
            const active = value === sourceType;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => !active && onNavigate(`admin/income/new/${slugOf(value)}`)}
                className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-xs font-bold uppercase tracking-wider transition sm:text-sm ${active ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
              >
                <span aria-hidden="true" className="hidden sm:inline">{item.icon}</span>{item.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card-panel p-5 sm:p-6" aria-label="Detail pekerjaan">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
          <h2 className="text-base font-bold text-slate-900">Detail Pekerjaan</h2>
          <span className="text-xs text-slate-500">Reference ID: <b className="font-mono text-slate-700">#{reference}</b></span>
        </div>

        <div className="space-y-5">
          <FormError>{formError || loadError}</FormError>

          <div className="grid gap-4 sm:grid-cols-2">
            {isConstruction ? (
              <>
                <Select id="contract" label="Pilih Proyek Utama" value={contractId} onChange={chooseContract} error={errors.contract}
                  placeholder={contracts ? '- Pilih proyek -' : 'Memuat...'} disabled={!contracts}
                  options={(contracts || []).map((row) => ({ value: row.id, label: `${row.projectName} · ${row.projectCode}` }))} />
                <Select id="stage" label="Sub-Proyek" value={stageId} onChange={(value) => { setStageId(value); setEquipment([]); setFillNotice(''); }} error={errors.stage}
                  placeholder={!contractId ? 'Pilih proyek dulu' : stageRows ? (stageRows.length ? '- Pilih sub-proyek -' : 'Belum ada sub-proyek') : 'Memuat...'}
                  disabled={!stageRows || !stageRows.length}
                  options={(stageRows || []).filter((row) => row.status !== 'cancelled').map((row) => ({ value: row.id, label: `${subProjectTypeLabel(row.subProjectType)} · ${row.status}` }))} />
              </>
            ) : (
              <>
                <Select id="party" label={source.partyLabel} value={party} onChange={chooseParty} error={errors.party}
                  placeholder={contracts ? `- Pilih ${source.partyLabel.toLowerCase()} -` : 'Memuat...'} disabled={!contracts}
                  options={parties.map((name) => ({ value: name, label: name }))} />
                <Select id="contract" label="Proyek" value={contractId} onChange={chooseContract} error={errors.contract}
                  placeholder={!party ? `Pilih ${source.partyLabel.toLowerCase()} dulu` : '- Pilih proyek -'} disabled={!party}
                  options={contractOptions.map((row) => ({ value: row.id, label: `${row.projectName}${row.isDemo ? ' (contoh)' : ''}` }))} />
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_2fr]">
            <Field label="Periode Mulai" htmlFor="periodStart" required error={errors.period}>
              <input id="periodStart" type="date" value={period.start} max={period.end || undefined} onChange={(event) => setPeriod((current) => ({ ...current, start: event.target.value }))} className="input-control h-11 text-sm" />
            </Field>
            <Field label="Periode Akhir" htmlFor="periodEnd" required>
              <input id="periodEnd" type="date" value={period.end} min={period.start || undefined} onChange={(event) => setPeriod((current) => ({ ...current, end: event.target.value }))} className="input-control h-11 text-sm" />
            </Field>
            <Field label="Catatan untuk Finance" htmlFor="adminNotes">
              <input id="adminNotes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} className="input-control h-11 text-sm" placeholder="Opsional" />
            </Field>
          </div>

          {fillNotice && <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800">{fillNotice}</p>}
          {errors.items && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{errors.items}</p>}

          {isConstruction && stage && (
            <section className="rounded-xl border border-teal-200 bg-teal-50/40 p-4" aria-label="Progress kontrak">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-teal-800">📈 Progress Kontrak · {subProjectTypeLabel(stage.subProjectType)}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Tervalidasi <b>{formatNumber(progress.billableProgress)}%</b> dari nilai kontrak {formatCurrency(stage.contractValue)} · sudah diajukan <b>{formatNumber(billed.percent)}%</b>
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={includeProgress} onChange={(event) => setIncludeProgress(event.target.checked)} disabled={progressDelta <= 0} className="accent-teal-700" />
                  Tagihkan progress
                </label>
              </div>
              <div className="mt-3"><ProgressBar value={billed.percent} secondary={progressDelta} label="Progress ditagih" /></div>
              <p className="mt-2 text-sm">
                {progressDelta > 0
                  ? <>Selisih belum ditagih <b>{formatNumber(progressDelta)}%</b> = <b className="text-teal-800">{formatCurrency(progressTotal || (progressDelta * (stage.contractValue || 0)) / 100)}</b></>
                  : <span className="text-slate-500">Tidak ada progress tervalidasi baru yang bisa ditagih.</span>}
              </p>
            </section>
          )}

          {(isConstruction || sourceType === 'external_rental') && (
            <LineItemsEditor
              component="equipment_income"
              rows={equipment}
              onChange={(rows) => { setEquipment(rows); setErrors({}); }}
              units={['jam', 'hari']}
              errors={errors}
              emptyText={contract ? 'Belum ada baris alat. Ambil dari timesheet atau tambah manual.' : 'Pilih proyek untuk mengambil jam kerja alat.'}
              autofill={{
                label: 'Ambil dari timesheet',
                busy: busyFill === 'equipment',
                disabled: !contract || (isConstruction && !stage),
                hint: 'Isi otomatis dari jam kerja alat pada periode tagihan',
                onClick: () => autofill('equipment'),
              }}
            />
          )}

          {isConstruction && <hr className="border-dashed border-slate-300" />}

          {(isConstruction || sourceType === 'external_supply') && (
            <LineItemsEditor
              component="material_income"
              rows={materials}
              onChange={(rows) => { setMaterials(rows); setErrors({}); }}
              units={['m3', 'm2', 'ton', 'unit']}
              errors={errors}
              emptyText={sourceType === 'external_supply' && contract ? 'Belum ada baris material. Ambil dari ritase atau tambah manual.' : 'Belum ada baris material.'}
              autofill={sourceType === 'external_supply' ? {
                label: 'Ambil dari ritase',
                busy: busyFill === 'material',
                disabled: !contract,
                hint: 'Isi otomatis dari total volume ritase per material pada periode tagihan',
                onClick: () => autofill('material'),
              } : null}
            />
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <a href="#/admin/income" className="btn btn-secondary text-xs">Batal</a>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">Total <b className="font-mono text-lg text-slate-900">{formatCurrency(grandTotal)}</b></span>
            <button type="button" onClick={handleSubmit} disabled={busy} className="btn btn-primary text-xs">{busy ? 'Mengajukan...' : 'Submit Pendapatan ➤'}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
