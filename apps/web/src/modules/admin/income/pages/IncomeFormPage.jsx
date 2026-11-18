import { useMemo, useState } from 'react';
import FormPage, { Field, FormError, InfoCard, SectionDivider } from '../../project/components/FormPage.jsx';
import { formatCurrency, formatDate, formatNumber, subProjectTypeLabel, todayIso, unitLabel } from '../../project/utils/projectFormat.js';
import { useRecord } from '../../../lapangan/hooks/useFieldData.js';
import { listProjects, listSubProjects } from '../../project/services/projectService.js';
import { listRentalProjects } from '../../rental/services/rentalService.js';
import { listSupplyProjects } from '../../supply/services/supplyService.js';
import { SOURCES } from '../utils/incomeFormat.js';
import { CONTEXT_FIELD, createIncomeRecord, getBillable } from '../services/incomeService.js';

const monthStart = () => `${todayIso().slice(0, 8)}01`;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** Kontrak yang bisa dipilih per jenis. Tagihan boleh untuk kontrak yang sudah selesai (termin akhir, F18). */
async function loadContracts(contextType) {
  const load = { construction: listProjects, rental: listRentalProjects, supply: listSupplyProjects }[contextType];
  const rows = (await load({ limit: 100 })).data || [];
  return rows.filter((row) => row.status !== 'cancelled');
}

/**
 * Form tagihan klien. Admin memilih kontrak + periode, backend menghitung yang
 * boleh ditagih (GET /billable). Konstruksi: tanpa isian angka. Rental: satu tarif
 * per unit. Supply: satu harga per material. Tarif ≠ tarif default unit wajib catatan.
 */
export default function IncomeFormPage({ contextType, onNavigate, onSaved }) {
  const source = SOURCES[contextType];
  const isConstruction = contextType === 'construction';
  const { data: contracts, error: contractError } = useRecord(() => loadContracts(contextType), contextType);
  const [contractId, setContractId] = useState('');
  const { data: stages } = useRecord(() => (isConstruction && contractId ? listSubProjects(Number(contractId)).then((r) => r.data || []) : Promise.resolve([])), `${contextType}:${contractId}`);
  const [stageId, setStageId] = useState('');
  const [period, setPeriod] = useState({ start: monthStart(), end: todayIso() });
  const [preview, setPreview] = useState(null);
  const [rates, setRates] = useState({});
  const [excluded, setExcluded] = useState({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const contextId = isConstruction ? stageId : contractId;
  const contract = (contracts || []).find((row) => String(row.id) === String(contractId));
  const groups = useMemo(() => preview?.units || preview?.materials || [], [preview]);
  const keyOf = (group) => String(group.equipmentItemId ?? group.materialTypeId);

  const resetPreview = () => { setPreview(null); setError(''); };

  const pull = async () => {
    if (!contextId) { setError(isConstruction ? 'Pilih project dan tahapan.' : 'Pilih kontrak.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await getBillable(contextType, contextId, period.start, period.end);
      setPreview(result);
      const groupsOf = result.units || result.materials || [];
      setRates(Object.fromEntries(groupsOf.map((g) => [String(g.equipmentItemId ?? g.materialTypeId), { rate: g.suggestedRate ? String(g.suggestedRate) : '', notes: '' }])));
      setExcluded({});
    } catch (requestError) {
      setPreview(null);
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const quantityOf = (group) => group.totalHours ?? group.totalQuantity;
  const included = groups.filter((group) => !excluded[keyOf(group)]);
  const total = isConstruction
    ? preview?.progress?.amount || 0
    : round2(included.reduce((sum, group) => sum + round2(quantityOf(group) * (Number(rates[keyOf(group)]?.rate) || 0)), 0));

  const needsNote = (group) => {
    const rate = Number(rates[keyOf(group)]?.rate);
    return Boolean(group.equipmentItemId) && rate > 0 && rate !== group.defaultHourlyRate;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!preview) { setError('Tarik data yang bisa ditagih dulu.'); return; }
    const payload = { [CONTEXT_FIELD[contextType]]: Number(contextId), periodStart: preview.periodStart, periodEnd: preview.periodEnd, ...(notes.trim() && { notes: notes.trim() }) };
    if (!isConstruction) {
      if (!included.length) { setError('Pilih minimal satu baris untuk ditagih.'); return; }
      const missing = included.find((group) => !(Number(rates[keyOf(group)]?.rate) > 0));
      if (missing) { setError(`Isi tarif untuk ${missing.assetCode || missing.materialName}.`); return; }
      const unnoted = included.find((group) => needsNote(group) && !rates[keyOf(group)]?.notes.trim());
      if (unnoted) { setError(`Tarif ${unnoted.assetCode} berbeda dari tarif default — isi alasannya.`); return; }
      payload.items = included.flatMap((group) => {
        const { rate, notes: rateNotes } = rates[keyOf(group)];
        const base = { unitRate: Number(rate), ...(rateNotes.trim() && { rateNotes: rateNotes.trim() }) };
        return group.logs
          ? group.logs.map((log) => ({ equipmentWorkhourLogId: log.id, ...base }))
          : group.receipts.map((receipt) => ({ materialReceiptId: receipt.id, ...base }));
      });
    }
    setBusy(true);
    setError('');
    try {
      onSaved(await createIncomeRecord(payload));
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  };

  return (
    <FormPage
      breadcrumb={[{ label: 'Income', href: '#/admin/income' }, { label: `Tagihan ${source.label}` }]}
      icon={source.icon}
      title={`Tagihan ${source.label}`}
      subtitle={source.hint}
      busy={busy}
      onCancel={() => onNavigate('admin/income')}
      onSubmit={submit}
      submitLabel={`Ajukan ke Finance · ${formatCurrency(total)}`}
      footerNote="Tagihan langsung masuk antrean Finance. Baris yang sudah ditagih terkunci (jam kerja, penerimaan, dan validasi progress tidak bisa dibatalkan)."
      aside={(
        <InfoCard title="Aturan tagihan">
          {isConstruction
            ? <><p>Nominal = volume tervalidasi baru ÷ target × nilai kontrak tahapan. Tidak ada isian angka.</p><p>Tagihan berurutan: akhir periode harus setelah tagihan aktif terakhir tahapan ini.</p></>
            : <><p>Satu tarif per {contextType === 'rental' ? 'unit' : 'material'} dalam satu tagihan.</p>{contextType === 'rental' && <p>Tarif berbeda dari tarif default unit wajib diberi alasan.</p>}<p>Baris yang sudah ada di tagihan aktif lain tidak muncul lagi.</p></>}
        </InfoCard>
      )}
    >
      <FormError>{contractError || error}</FormError>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={isConstruction ? 'Project' : 'Kontrak'} htmlFor="income-contract" required>
          <select id="income-contract" value={contractId} onChange={(event) => { setContractId(event.target.value); setStageId(''); resetPreview(); }} className="input-control text-sm">
            <option value="">{contracts ? '- Pilih -' : 'Memuat...'}</option>
            {(contracts || []).map((row) => <option key={row.id} value={row.id}>{row.projectCode} · {row.projectName}{row.clientName ? ` (${row.clientName})` : ''}</option>)}
          </select>
        </Field>
        {isConstruction && (
          <Field label="Tahapan" htmlFor="income-stage" required>
            <select id="income-stage" value={stageId} disabled={!contractId} onChange={(event) => { setStageId(event.target.value); resetPreview(); }} className="input-control text-sm">
              <option value="">- Pilih -</option>
              {(stages || []).map((row) => <option key={row.id} value={row.id}>{subProjectTypeLabel(row.subProjectType)} · {row.status}</option>)}
            </select>
          </Field>
        )}
        <Field label="Periode mulai" htmlFor="income-start" required>
          <input id="income-start" type="date" value={period.start} max={period.end} onChange={(event) => { setPeriod((p) => ({ ...p, start: event.target.value })); resetPreview(); }} className="input-control text-sm" />
        </Field>
        <Field label="Periode akhir" htmlFor="income-end" required>
          <input id="income-end" type="date" value={period.end} min={period.start} max={todayIso()} onChange={(event) => { setPeriod((p) => ({ ...p, end: event.target.value })); resetPreview(); }} className="input-control text-sm" />
        </Field>
      </div>
      {contract?.clientName && <p className="text-xs text-slate-500">Klien: <b className="text-slate-800">{contract.clientName}</b></p>}
      <button type="button" onClick={pull} disabled={busy || !contextId} className="btn btn-secondary text-xs">⟳ Tarik data yang bisa ditagih</button>

      {preview?.progress && (
        <>
          <SectionDivider>Progress yang ditagih</SectionDivider>
          <div className="grid gap-3 rounded-lg border border-slate-200 p-4 text-xs sm:grid-cols-2">
            <p>Volume kumulatif: <b>{formatNumber(preview.progress.volumeFrom)} → {formatNumber(preview.progress.volumeTo)} {unitLabel(preview.progress.volumeUnit)}</b></p>
            <p>Progress: <b>{formatNumber(preview.progress.percentFrom)}% → {formatNumber(preview.progress.percentTo)}%</b></p>
            <p>Volume ditagih: <b>{formatNumber(preview.progress.billedVolume)} {unitLabel(preview.progress.volumeUnit)}</b> dari target {formatNumber(preview.progress.targetVolume)}</p>
            <p>Nilai kontrak: <b>{formatCurrency(preview.progress.contractValue)}</b></p>
            <p className="text-base font-bold text-brand-800 sm:col-span-2">Nominal tagihan: {formatCurrency(preview.progress.amount)}</p>
          </div>
        </>
      )}

      {preview && !isConstruction && (
        <>
          <SectionDivider>{contextType === 'rental' ? 'Jam kerja per unit' : 'Material diterima'}</SectionDivider>
          {!groups.length && <p className="text-xs text-slate-500">Tidak ada {contextType === 'rental' ? 'jam kerja' : 'penerimaan'} yang belum ditagih pada periode ini.</p>}
          <div className="space-y-2">
            {groups.map((group) => {
              const key = keyOf(group);
              const off = Boolean(excluded[key]);
              const rate = rates[key] || { rate: '', notes: '' };
              const setRate = (patch) => setRates((current) => ({ ...current, [key]: { ...rate, ...patch } }));
              return (
                <div key={key} className={`rounded-lg border p-3 ${off ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <input type="checkbox" checked={!off} onChange={(event) => setExcluded((current) => ({ ...current, [key]: !event.target.checked }))} className="accent-brand-700" />
                      {group.equipmentItemId ? `${group.typeName} · ${group.assetCode}` : group.materialName}
                    </label>
                    <span className="text-xs text-slate-500">
                      {formatNumber(quantityOf(group))} {group.equipmentItemId ? 'jam' : unitLabel(group.unit)} · {(group.logs || group.receipts).length} {group.logs ? 'catatan' : 'penerimaan'}
                    </span>
                  </div>
                  {!off && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)_9rem] sm:items-end">
                      <label className="text-[11px] font-semibold text-slate-600">Tarif per {group.equipmentItemId ? 'jam' : unitLabel(group.unit)}
                        <input type="number" min="0" step="any" value={rate.rate} onChange={(event) => setRate({ rate: event.target.value })} className="input-control mt-1 h-9 text-right font-mono text-xs" />
                      </label>
                      {group.equipmentItemId ? (
                        <label className="text-[11px] font-semibold text-slate-600">Alasan tarif {needsNote(group) ? <span className="text-red-500">*</span> : <span className="text-slate-400">(default {formatCurrency(group.defaultHourlyRate)})</span>}
                          <input value={rate.notes} disabled={!needsNote(group)} onChange={(event) => setRate({ notes: event.target.value })} maxLength={500} className="input-control mt-1 h-9 text-xs" placeholder={needsNote(group) ? 'Mis. diskon sesuai addendum' : 'Tarif sama dengan default'} />
                        </label>
                      ) : <span />}
                      <p className="text-right font-mono text-sm font-bold text-slate-900">{formatCurrency(round2(quantityOf(group) * (Number(rate.rate) || 0)))}</p>
                    </div>
                  )}
                  {!off && group.receipts && <p className="mt-1 text-[11px] text-slate-400">{group.receipts.map((r) => `${r.receiptCode} (${formatDate(r.receivedAt)})`).join(', ')}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}

      <Field label="Catatan untuk Finance" htmlFor="income-notes">
        <textarea id="income-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} className="input-control h-auto resize-y text-sm" placeholder="Mis. nomor berita acara progress, termin ke-" />
      </Field>
    </FormPage>
  );
}
