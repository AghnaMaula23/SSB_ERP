// Sumber data form pendapatan. Semua angka acuan diambil dari modul yang
// sudah ada (Project, Rental, Supply, Divisi Alat) — form Income tidak
// mengarang volume atau jam sendiri, hanya menambahkan tarif.

import { listAllocations, listItemWorkhours, listProjects, listSubProjects } from '../../project/services/projectService.js';
import { listRentalProjects, listRentalWorkhours, loadRentalUnits } from '../../rental/services/rentalService.js';
import { isDemoId as isDemoRental, listDemoLogs, listDemoRentalProjects, listDemoUnits } from '../../rental/services/rentalDemoService.js';
import { buildUnits } from '../../rental/utils/rentalFormat.js';
import { listSupplyProjects } from '../../supply/services/supplyService.js';
import { listDemoSupplyProjects } from '../../supply/services/demoSupplyService.js';
import { listDeliveries } from '../../supply/services/deliveryMockService.js';
import { getItemById } from '../../../alat/services/alatService.js';
import { emptyLine, suggestHourlyRate, suggestMaterialPrice } from '../utils/incomeFormat.js';

/** API + data contoh; kalau API gagal, data contoh tetap dipakai. */
async function withDemo(apiCall, demoCall) {
  const [api, demo] = await Promise.allSettled([apiCall(), demoCall()]);
  return [
    ...(api.status === 'fulfilled' ? api.value.data || [] : []),
    ...(demo.status === 'fulfilled' ? demo.value : []),
  ];
}

export const listConstructionProjects = async () => (await listProjects({ limit: 100 })).data || [];
export const listStages = async (projectId) => (await listSubProjects(projectId)).data || [];
export const listRentalContracts = () => withDemo(() => listRentalProjects({ limit: 100 }), listDemoRentalProjects);
export const listSupplyContracts = () => withDemo(() => listSupplyProjects({ limit: 100 }), listDemoSupplyProjects);

// Tarif default per unit fisik dari master Divisi Alat (defaultHourlyRate).
const rateCache = new Map();
async function hourlyRateFor(equipmentItemId, typeName) {
  if (!equipmentItemId) return { rate: suggestHourlyRate(typeName), source: 'manual_input' };
  if (!rateCache.has(equipmentItemId)) {
    rateCache.set(equipmentItemId, getItemById(equipmentItemId).then((item) => Number(item?.defaultHourlyRate) || null).catch(() => null));
  }
  const rate = await rateCache.get(equipmentItemId);
  return rate ? { rate, source: 'equipment_default_rate' } : { rate: suggestHourlyRate(typeName), source: 'manual_input' };
}

const inRange = (date, start, end) => (!start || date >= start) && (!end || date <= end);
const round2 = (value) => Math.round(value * 100) / 100;

/** Rental: total jam tiap unit pada periode tagihan → baris equipment_income. */
export async function rentalEquipmentLines(contract, startDate, endDate) {
  const units = isDemoRental(contract.id) ? await listDemoUnits(contract.id) : buildUnits(await loadRentalUnits(contract.id));
  const billable = units.filter((unit) => unit.kind === 'demo' || unit.equipmentItemId);
  const lines = await Promise.all(billable.map(async (unit) => {
    const logs = unit.kind === 'demo'
      ? await listDemoLogs(unit.key, { startDate, endDate })
      : ((await listRentalWorkhours(unit.equipmentItemId, { startDate, endDate })).data || []).filter((log) => log.equipmentPoolItemId === unit.poolItemId);
    const hours = round2(logs.reduce((sum, log) => sum + (Number(log.totalWorkhour) || 0), 0));
    if (!hours) return null;
    const { rate, source } = await hourlyRateFor(unit.equipmentItemId, unit.typeName);
    return emptyLine('equipment_income', {
      description: [unit.typeName, unit.meta?.brand, unit.meta?.model].filter(Boolean).join(' ') + (unit.assetCode ? ` · ${unit.assetCode}` : ''),
      quantity: String(hours),
      rateSnapshot: String(rate),
      rateSource: source,
      equipmentItemId: unit.equipmentItemId || null,
      sourceRef: `${logs.length} catatan jam kerja`,
    });
  }));
  return lines.filter(Boolean);
}

/** Supply: volume ritase per material pada periode tagihan → baris material_income. */
export async function supplyMaterialLines(contract, startDate, endDate) {
  const deliveries = (await listDeliveries(contract.id)).filter((row) => inRange(row.deliveryDate, startDate, endDate));
  const byMaterial = new Map();
  deliveries.forEach((row) => {
    const entry = byMaterial.get(row.material) || { volume: 0, trips: 0 };
    entry.volume += Number(row.volume) || 0;
    entry.trips += 1;
    byMaterial.set(row.material, entry);
  });
  return [...byMaterial.entries()].map(([material, entry]) => emptyLine('material_income', {
    description: material,
    quantity: String(round2(entry.volume)),
    rateSnapshot: String(suggestMaterialPrice(material)),
    sourceRef: `${entry.trips} ritase`,
  }));
}

/** Sub-kontraktor: jam kerja alat yang dialokasikan ke tahapan → baris equipment_income. */
export async function stageEquipmentLines(stage, startDate, endDate) {
  const allocations = await listAllocations(stage.id);
  const byItem = new Map();
  allocations.forEach((row) => {
    if (!row.equipmentItemId) return;
    const entry = byItem.get(row.equipmentItemId) || { allocationIds: new Set(), assetCode: row.equipmentItem?.assetCode, typeName: row.poolItem?.equipmentType?.typeName };
    entry.allocationIds.add(row.id);
    byItem.set(row.equipmentItemId, entry);
  });
  const lines = await Promise.all([...byItem.entries()].map(async ([itemId, entry]) => {
    const logs = ((await listItemWorkhours(itemId, { startDate, endDate })).data || []).filter((log) => entry.allocationIds.has(log.subProjectEquipmentAllocationId));
    const hours = round2(logs.reduce((sum, log) => sum + (Number(log.totalWorkhour) || 0), 0));
    if (!hours) return null;
    const { rate, source } = await hourlyRateFor(itemId, entry.typeName);
    return emptyLine('equipment_income', {
      description: `${entry.typeName || 'Alat'} · ${entry.assetCode || itemId}`,
      quantity: String(hours),
      rateSnapshot: String(rate),
      rateSource: source,
      equipmentItemId: itemId,
      sourceRef: `${logs.length} catatan jam kerja`,
    });
  }));
  return lines.filter(Boolean);
}
