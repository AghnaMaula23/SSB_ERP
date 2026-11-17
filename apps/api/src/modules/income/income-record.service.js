const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture, todayDate } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const { postJournal, reverseJournal } = require('../finance-accounting/journal.service.js');
const { ACCOUNTS } = require('../finance-accounting/accounts.js');
const { ACTIVE_STATUSES } = require('./billing-lock.js');

// ============================================================
// INCOME RECORD — tagihan klien (docs/claude_knowledge/plan-divisi-finance.md F10–F18).
//
// Alur status: submitted --Finance--> verified | rejected
//              submitted --pembuat (Admin)--> cancelled
//              verified  --Finance--> voided (koreksi, tanpa pembayaran aktif)
// Satu record = satu konteks × satu periode (F10). Tanpa draf (ERD). Verifikasi menjurnal
// Dr Piutang Usaha / Cr Pendapatan sesuai jenis, bertanggal hari verifikasi (F2, F3b).
//
// SENGAJA tanpa assertContextOpen (F18): tagihan termin akhir dibuat setelah tahapan/
// kontrak selesai, dan income hanya MEMBACA fakta yang sudah beku saat penutupan.
// Total, terbayar, dan status bayar dihitung saat dibaca (SQL yang sama dengan VIEW
// approval_queue), tidak disimpan.
// ============================================================

const INCOME_DOC_TYPE = 'INC';
const INCOME_DOC_PAD = 6;
const WIB_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const REVENUE_ACCOUNT = {
  construction: ACCOUNTS.REVENUE_CONSTRUCTION,
  rental: ACCOUNTS.REVENUE_RENTAL,
  supply: ACCOUNTS.REVENUE_MATERIAL,
};
const CONTEXT_LABEL = { construction: 'Progress', rental: 'Sewa alat', supply: 'Supply material' };

const contextTypeOf = (row) => (row.subProjectId ? 'construction' : row.externalRentalProjectId ? 'rental' : 'supply');

/** Konteks jurnal (F24) — tahapan selalu bersama project-nya. */
const journalContextOf = (row) => {
  if (row.subProjectId) return { constructionProjectId: row.subProject.constructionProjectId, subProjectId: row.subProjectId };
  if (row.externalRentalProjectId) return { externalRentalProjectId: row.externalRentalProjectId };
  return { externalSupplyProjectId: row.externalSupplyProjectId };
};

// ------------------------------------------------------------
// Total & status bayar — SQL, rumus sama dengan VIEW approval_queue
// ------------------------------------------------------------

/** Map(recordId → { total, paid }). Item dibulatkan per baris; pembayaran yang di-void tidak dihitung. */
const totalsOf = async (ids, client = prisma) => {
  if (!ids.length) return new Map();
  const rows = await client.$queryRaw`
    SELECT ir.id,
      CASE WHEN ir.sub_project_id IS NOT NULL
        THEN round((ir.progress_volume_to - ir.progress_volume_from) / ir.target_volume_snapshot * ir.contract_value_snapshot, 2)
        ELSE (SELECT COALESCE(sum(round(COALESCE(wl.total_workhour, rc.accepted_quantity) * it.unit_rate, 2)), 0)
                FROM income_record_items it
                LEFT JOIN equipment_workhour_logs wl ON wl.id = it.equipment_workhour_log_id
                LEFT JOIN material_receipts rc ON rc.id = it.material_receipt_id
               WHERE it.income_record_id = ir.id) END AS total,
      (SELECT COALESCE(sum(p.amount), 0) FROM income_payments p
        WHERE p.income_record_id = ir.id AND p.voided_at IS NULL) AS paid
    FROM income_records ir WHERE ir.id = ANY(${ids})`;
  return new Map(rows.map((r) => [r.id, { total: toNumber(r.total), paid: toNumber(r.paid) }]));
};

/** Status bayar hanya bermakna untuk record yang sudah diverifikasi. */
const paymentStatusOf = (status, total, paid) => {
  if (status !== 'verified') return null;
  if (paid <= 0) return 'unpaid';
  return paid < total ? 'partially_paid' : 'paid';
};

/** Record verified yang status bayarnya = `paymentStatus` — untuk filter list. */
const idsByPaymentStatus = async (paymentStatus) => {
  const verified = await prisma.incomeRecord.findMany({ where: { status: 'verified' }, select: { id: true } });
  const totals = await totalsOf(verified.map((r) => r.id));
  return [...totals].filter(([, t]) => paymentStatusOf('verified', t.total, t.paid) === paymentStatus).map(([id]) => id);
};

// ------------------------------------------------------------
// Bentuk response
// ------------------------------------------------------------

const CONTEXT_INCLUDE = {
  subProject: { select: {
    id: true, subProjectType: true, status: true, volumeUnit: true, constructionProjectId: true,
    constructionProject: { select: { id: true, projectCode: true, projectName: true, clientName: true } },
  } },
  externalRentalProject: { select: { id: true, rentalProjectCode: true, rentalProjectName: true, clientName: true, status: true } },
  externalSupplyProject: { select: { id: true, supplyProjectCode: true, supplyProjectName: true, clientName: true, status: true } },
};

const LIST_INCLUDE = { ...CONTEXT_INCLUDE, createdByUser: { select: ACTOR_SELECT }, _count: { select: { items: true } } };

const DETAIL_INCLUDE = {
  ...CONTEXT_INCLUDE,
  createdByUser: { select: ACTOR_SELECT },
  verifiedByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
  voidedByUser: { select: ACTOR_SELECT },
  items: {
    include: {
      equipmentWorkhourLog: { select: {
        id: true, workDate: true, workSession: true, totalWorkhour: true,
        equipmentItem: { select: { id: true, assetCode: true, defaultHourlyRate: true, equipmentType: { select: { typeName: true } } } },
      } },
      materialReceipt: { select: {
        id: true, receiptCode: true, receivedAt: true, acceptedQuantity: true,
        materialDelivery: { select: { deliveryCode: true, materialRequestItem: { select: {
          materialType: { select: { id: true, materialCode: true, materialName: true, unit: true } },
        } } } },
      } },
    },
    orderBy: { id: 'asc' },
  },
  payments: { include: { recordedByUser: { select: ACTOR_SELECT }, _count: { select: { files: true } } }, orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }] },
};

const shapeContext = (row) => {
  if (row.subProject) {
    const p = row.subProject.constructionProject;
    return { type: 'construction', id: p.id, code: p.projectCode, name: p.projectName, clientName: p.clientName,
      subProject: { id: row.subProject.id, subProjectType: row.subProject.subProjectType, status: row.subProject.status } };
  }
  if (row.externalRentalProject) {
    const p = row.externalRentalProject;
    return { type: 'rental', id: p.id, code: p.rentalProjectCode, name: p.rentalProjectName, clientName: p.clientName, subProject: null };
  }
  const p = row.externalSupplyProject;
  return { type: 'supply', id: p.id, code: p.supplyProjectCode, name: p.supplyProjectName, clientName: p.clientName, subProject: null };
};

const shapeHeader = (row, totals) => {
  const { total = 0, paid = 0 } = totals ?? {};
  return {
    id: row.id,
    incomeCode: row.incomeCode,
    contextType: contextTypeOf(row),
    context: shapeContext(row),
    periodStart: toDateOnly(row.periodStart),
    periodEnd: toDateOnly(row.periodEnd),
    notes: row.notes,
    status: row.status,
    totalAmount: total,
    paidAmount: row.status === 'verified' ? paid : 0,
    outstandingAmount: row.status === 'verified' ? round2(total - paid) : null,
    paymentStatus: paymentStatusOf(row.status, total, paid),
    createdBy: shapeActor(row.createdByUser),
    createdAt: row.createdAt,
  };
};

const percentOf = (volume, target) => (target > 0 ? round2((volume / target) * 100) : 0);

const shapeProgress = (row, amount) => {
  const from = toNumber(row.progressVolumeFrom);
  const to = toNumber(row.progressVolumeTo);
  const target = toNumber(row.targetVolumeSnapshot);
  return {
    volumeFrom: from, volumeTo: to, billedVolume: round2(to - from), targetVolume: target,
    volumeUnit: row.subProject.volumeUnit, contractValue: toNumber(row.contractValueSnapshot),
    percentFrom: percentOf(from, target), percentTo: percentOf(to, target), amount,
  };
};

const shapeItem = (item, subtotal) => {
  if (item.equipmentWorkhourLog) {
    const log = item.equipmentWorkhourLog;
    return {
      id: item.id, equipmentWorkhourLogId: log.id, workDate: toDateOnly(log.workDate), workSession: log.workSession,
      equipmentItem: { id: log.equipmentItem.id, assetCode: log.equipmentItem.assetCode, typeName: log.equipmentItem.equipmentType.typeName,
        defaultHourlyRate: toNumber(log.equipmentItem.defaultHourlyRate) },
      quantity: toNumber(log.totalWorkhour), unit: 'jam',
      unitRate: toNumber(item.unitRate), rateNotes: item.rateNotes, subtotal,
    };
  }
  const receipt = item.materialReceipt;
  const material = receipt.materialDelivery.materialRequestItem.materialType;
  return {
    id: item.id, materialReceiptId: receipt.id, receiptCode: receipt.receiptCode, deliveryCode: receipt.materialDelivery.deliveryCode,
    receivedAt: receipt.receivedAt, material: { id: material.id, materialCode: material.materialCode, materialName: material.materialName },
    quantity: toNumber(receipt.acceptedQuantity), unit: material.unit,
    unitRate: toNumber(item.unitRate), rateNotes: item.rateNotes, subtotal,
  };
};

/** Subtotal per item, dibulatkan di SQL sama persis dengan totalsOf. */
const itemSubtotalsOf = async (recordId, client = prisma) => {
  const rows = await client.$queryRaw`
    SELECT it.id, round(COALESCE(wl.total_workhour, rc.accepted_quantity) * it.unit_rate, 2) AS subtotal
    FROM income_record_items it
    LEFT JOIN equipment_workhour_logs wl ON wl.id = it.equipment_workhour_log_id
    LEFT JOIN material_receipts rc ON rc.id = it.material_receipt_id
    WHERE it.income_record_id = ${recordId}`;
  return new Map(rows.map((r) => [r.id, toNumber(r.subtotal)]));
};

const shapeDetail = async (row, client = prisma) => {
  const [totals, subtotals, journals] = await Promise.all([
    totalsOf([row.id], client),
    itemSubtotalsOf(row.id, client),
    client.journalEntry.findMany({
      where: { sourceType: 'income_record', sourceId: row.id },
      select: { id: true, journalCode: true, journalDate: true, reversalOfJournalEntryId: true }, orderBy: { id: 'asc' },
    }),
  ]);
  const t = totals.get(row.id);
  return {
    ...shapeHeader(row, t),
    progress: row.subProjectId ? shapeProgress(row, t.total) : null,
    items: row.items.map((i) => shapeItem(i, subtotals.get(i.id))),
    payments: row.payments.map((p) => ({
      id: p.id, paymentCode: p.paymentCode, paymentDate: toDateOnly(p.paymentDate), amount: toNumber(p.amount),
      paymentMethod: p.paymentMethod, referenceNumber: p.referenceNumber, fileCount: p._count.files,
      recordedBy: shapeActor(p.recordedByUser), isVoided: p.voidedAt !== null, voidedAt: p.voidedAt, voidReason: p.voidReason,
    })),
    journalEntries: journals.map((j) => ({ id: j.id, journalCode: j.journalCode, journalDate: toDateOnly(j.journalDate), isReversal: j.reversalOfJournalEntryId !== null })),
    verifiedBy: shapeActor(row.verifiedByUser),
    verifiedAt: row.verifiedAt,
    financeNotes: row.financeNotes,
    cancelledBy: shapeActor(row.cancelledByUser),
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    voidedBy: shapeActor(row.voidedByUser),
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
  };
};

const findOrFail = async (id, client = prisma) => {
  const row = await client.incomeRecord.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw httpError('Income record tidak ditemukan', 404);
  return row;
};

// ------------------------------------------------------------
// Sumber tagihan per jenis (dipakai pratinjau, buat, dan ubah)
// ------------------------------------------------------------

/** Tepat satu konteks dari payload/query. */
const contextOfPayload = ({ subProjectId, externalRentalProjectId, externalSupplyProjectId }) => {
  const given = [['construction', subProjectId], ['rental', externalRentalProjectId], ['supply', externalSupplyProjectId]].filter(([, v]) => v);
  if (given.length !== 1) throw httpError('Isi tepat satu konteks: subProjectId, externalRentalProjectId, atau externalSupplyProjectId', 400);
  return { type: given[0][0], id: given[0][1] };
};

const CONTEXT_FK = { construction: 'subProjectId', rental: 'externalRentalProjectId', supply: 'externalSupplyProjectId' };

const loadContextOrFail = async (client, { type, id }) => {
  const model = { construction: 'subProject', rental: 'externalRentalProject', supply: 'externalSupplyProject' }[type];
  const row = await client[model].findUnique({ where: { id } });
  if (!row) throw httpError({ construction: 'Tahapan', rental: 'Kontrak rental', supply: 'Kontrak supply' }[type] + ` dengan ID ${id} tidak ditemukan`, 404);
  return row;
};

const parsePeriod = ({ periodStart, periodEnd }) => {
  const start = new Date(periodStart);
  const end = assertNotFuture(periodEnd, 'Akhir periode tagihan');
  if (end < start) throw httpError('Akhir periode tidak boleh sebelum awal periode', 400);
  return { start, end };
};

/** Record aktif lain pada konteks yang sama (kecuali dirinya saat diubah). */
const otherActive = (excludeId) => ({ status: { in: ACTIVE_STATUSES }, ...(excludeId && { id: { not: excludeId } }) });

/**
 * F11: volume `validated` kumulatif s.d. periodEnd (maks. target) dikurangi volume yang
 * sudah ditagih record aktif. Periode harus SETELAH tagihan aktif terakhir — tagihan
 * konstruksi berurutan, jadi "from" selalu = "to" tagihan sebelumnya.
 */
const constructionSnapshot = async (client, subProject, periodEnd, excludeId) => {
  const target = toNumber(subProject.targetVolume);
  const contractValue = toNumber(subProject.contractValue);
  if (!(target > 0) || !(contractValue > 0)) throw httpError('Tahapan ini belum punya target volume dan nilai kontrak — lengkapi kontraknya dulu', 409);

  const previous = await client.incomeRecord.aggregate({
    where: { subProjectId: subProject.id, ...otherActive(excludeId) },
    _max: { periodEnd: true, progressVolumeTo: true },
  });
  if (previous._max.periodEnd && periodEnd <= previous._max.periodEnd) {
    throw httpError(`Akhir periode harus setelah tagihan aktif terakhir tahapan ini (s.d. ${toDateOnly(previous._max.periodEnd)})`, 409);
  }
  const { _sum } = await client.dailyProgressLog.aggregate({
    where: { subProjectId: subProject.id, status: 'validated', progressDate: { lte: periodEnd } }, _sum: { realizedVolume: true },
  });
  const volumeFrom = toNumber(previous._max.progressVolumeTo) ?? 0;
  const volumeTo = Math.min(toNumber(_sum.realizedVolume) ?? 0, target);
  if (volumeTo <= volumeFrom) {
    throw httpError('Tidak ada volume tervalidasi baru untuk ditagih sampai tanggal itu. Validasi progress hariannya dulu.', 409);
  }
  const [{ amount }] = await client.$queryRaw`
    SELECT round((${String(volumeTo)}::numeric - ${String(volumeFrom)}::numeric) / ${String(target)}::numeric * ${String(contractValue)}::numeric, 2) AS amount`;
  return {
    volumeFrom, volumeTo, billedVolume: round2(volumeTo - volumeFrom), targetVolume: target, volumeUnit: subProject.volumeUnit,
    contractValue, percentFrom: percentOf(volumeFrom, target), percentTo: percentOf(volumeTo, target), amount: toNumber(amount),
  };
};

/** Log jam kerja rental yang boleh ditagih: kontrak ini, periode ini, tidak dibatalkan, belum di record aktif lain. */
const rentalLogs = (client, rentalId, { start, end }, { excludeId, ids } = {}) => client.equipmentWorkhourLog.findMany({
  where: {
    sourceType: 'external_rental', isVoided: false, workDate: { gte: start, lte: end },
    equipmentPoolItem: { equipmentPool: { externalRentalProjectId: rentalId } },
    incomeItems: { none: { incomeRecord: otherActive(excludeId) } },
    ...(ids && { id: { in: ids } }),
  },
  include: { equipmentItem: { select: { id: true, assetCode: true, defaultHourlyRate: true, equipmentType: { select: { typeName: true } } } } },
  orderBy: [{ workDate: 'asc' }, { id: 'asc' }],
});

/** Penerimaan supply yang boleh ditagih. `received_at` dibandingkan sebagai hari kalender WIB. */
const supplyReceipts = (client, supplyId, { start, end }, { excludeId, ids } = {}) => client.materialReceipt.findMany({
  where: {
    cancelledAt: null, acceptedQuantity: { gt: 0 },
    receivedAt: { gte: new Date(start.getTime() - WIB_MS), lt: new Date(end.getTime() + DAY_MS - WIB_MS) },
    materialDelivery: { materialRequest: { externalSupplyProjectId: supplyId } },
    incomeItems: { none: { incomeRecord: otherActive(excludeId) } },
    ...(ids && { id: { in: ids } }),
  },
  include: { materialDelivery: { select: { deliveryCode: true, materialRequestItem: { select: {
    materialType: { select: { id: true, materialCode: true, materialName: true, unit: true } },
  } } } } },
  orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
});

/** Tarif usulan per unit: tarif unit itu di record verified terakhir kontrak ini, lalu tarif default. */
const suggestedRentalRates = async (rentalId) => {
  const items = await prisma.incomeRecordItem.findMany({
    where: { incomeRecord: { externalRentalProjectId: rentalId, status: 'verified' }, equipmentWorkhourLogId: { not: null } },
    select: { unitRate: true, equipmentWorkhourLog: { select: { equipmentItemId: true } } },
    orderBy: { id: 'desc' },
  });
  const rates = new Map();
  for (const i of items) if (!rates.has(i.equipmentWorkhourLog.equipmentItemId)) rates.set(i.equipmentWorkhourLog.equipmentItemId, toNumber(i.unitRate));
  return rates;
};

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

const billable = async (query) => {
  const ctx = contextOfPayload(query);
  const period = parsePeriod(query);
  const owner = await loadContextOrFail(prisma, ctx);
  const base = { contextType: ctx.type, periodStart: toDateOnly(period.start), periodEnd: toDateOnly(period.end) };

  if (ctx.type === 'construction') {
    return { ...base, progress: await constructionSnapshot(prisma, owner, period.end) };
  }
  if (ctx.type === 'rental') {
    const [logs, suggested] = await Promise.all([rentalLogs(prisma, ctx.id, period), suggestedRentalRates(ctx.id)]);
    const units = new Map();
    for (const log of logs) {
      const unit = log.equipmentItem;
      if (!units.has(unit.id)) {
        const defaultHourlyRate = toNumber(unit.defaultHourlyRate);
        units.set(unit.id, { equipmentItemId: unit.id, assetCode: unit.assetCode, typeName: unit.equipmentType.typeName,
          defaultHourlyRate, suggestedRate: suggested.get(unit.id) ?? defaultHourlyRate, totalHours: 0, logs: [] });
      }
      const u = units.get(unit.id);
      u.logs.push({ id: log.id, workDate: toDateOnly(log.workDate), workSession: log.workSession, totalWorkhour: toNumber(log.totalWorkhour) });
      u.totalHours = round2(u.totalHours + toNumber(log.totalWorkhour));
    }
    return { ...base, units: [...units.values()] };
  }
  const receipts = await supplyReceipts(prisma, ctx.id, period);
  const materials = new Map();
  for (const r of receipts) {
    const m = r.materialDelivery.materialRequestItem.materialType;
    if (!materials.has(m.id)) materials.set(m.id, { materialTypeId: m.id, materialCode: m.materialCode, materialName: m.materialName, unit: m.unit, totalQuantity: 0, receipts: [] });
    const g = materials.get(m.id);
    g.receipts.push({ id: r.id, receiptCode: r.receiptCode, deliveryCode: r.materialDelivery.deliveryCode, receivedAt: r.receivedAt, acceptedQuantity: toNumber(r.acceptedQuantity) });
    g.totalQuantity = round2(g.totalQuantity + toNumber(r.acceptedQuantity));
  }
  return { ...base, materials: [...materials.values()] };
};

const list = async ({ page = 1, limit = 20, search, contextType, constructionProjectId, subProjectId,
  externalRentalProjectId, externalSupplyProjectId, status, paymentStatus, startDate, endDate }) => {
  const where = {
    ...(contextType && { [CONTEXT_FK[contextType]]: { not: null } }),
    ...(constructionProjectId && { subProject: { constructionProjectId } }),
    ...(subProjectId && { subProjectId }),
    ...(externalRentalProjectId && { externalRentalProjectId }),
    ...(externalSupplyProjectId && { externalSupplyProjectId }),
    ...(status && { status }),
    ...((startDate || endDate) && { periodEnd: {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    } }),
    ...(search && { OR: [
      { incomeCode: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ] }),
  };
  if (paymentStatus) where.id = { in: await idsByPaymentStatus(paymentStatus) };

  const [rows, total, matched] = await Promise.all([
    prisma.incomeRecord.findMany({ where, include: LIST_INCLUDE, orderBy: [{ periodEnd: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.incomeRecord.count({ where }),
    prisma.incomeRecord.findMany({ where: { ...where, status: 'verified' }, select: { id: true } }),
  ]);
  const [pageTotals, verifiedTotals] = await Promise.all([totalsOf(rows.map((r) => r.id)), totalsOf(matched.map((r) => r.id))]);
  const sum = (key) => round2([...verifiedTotals.values()].reduce((s, t) => s + t[key], 0));
  return {
    data: rows.map((row) => ({ ...shapeHeader(row, pageTotals.get(row.id)), itemCount: row._count.items })),
    total, page, limit,
    // Ringkasan record verified pada seluruh filter, bukan hanya halaman ini
    summary: { verifiedAmount: sum('total'), paidAmount: sum('paid'), outstandingAmount: round2(sum('total') - sum('paid')) },
  };
};

const getById = async (id) => shapeDetail(await findOrFail(id));

// ------------------------------------------------------------
// BUAT & UBAH (Admin)
// ------------------------------------------------------------

/** Satu tarif per kelompok (unit alat / jenis material) dalam satu record. */
const assertSingleRate = (groups, label) => {
  for (const [key, rates] of groups) {
    if (new Set(rates).size > 1) throw httpError(`${label} ${key} diberi lebih dari satu tarif dalam satu tagihan — samakan tarifnya`, 400);
  }
};

const groupRates = (entries) => {
  const groups = new Map();
  for (const [key, rate] of entries) groups.set(key, [...(groups.get(key) ?? []), rate]);
  return groups;
};

/**
 * Menyusun isi record per jenis di dalam transaksi pemanggil, setelah baris sumber
 * dikunci. Mengembalikan { snapshot, items } untuk ditulis. `excludeId` = record yang
 * sedang diubah (sumbernya sendiri tidak dianggap "sudah ditagih").
 */
const buildContent = async (tx, ctx, period, payloadItems, excludeId) => {
  if (ctx.type === 'construction') {
    if (payloadItems?.length) throw httpError('Tagihan konstruksi tidak memakai items — volume dihitung dari progress tervalidasi', 400);
    await tx.$queryRaw`SELECT id FROM sub_projects WHERE id = ${ctx.id} FOR UPDATE`;
    const subProject = await tx.subProject.findUnique({ where: { id: ctx.id } });
    const s = await constructionSnapshot(tx, subProject, period.end, excludeId);
    return {
      snapshot: { progressVolumeFrom: s.volumeFrom, progressVolumeTo: s.volumeTo, targetVolumeSnapshot: s.targetVolume, contractValueSnapshot: s.contractValue },
      items: [],
    };
  }
  if (!payloadItems?.length) throw httpError('items wajib diisi untuk tagihan rental/supply', 400);
  const field = ctx.type === 'rental' ? 'equipmentWorkhourLogId' : 'materialReceiptId';
  const ids = payloadItems.map((i) => i[field]);
  if (ids.some((x) => !x)) throw httpError(`Setiap baris ${ctx.type === 'rental' ? 'rental' : 'supply'} wajib berisi ${field}`, 400);
  if (new Set(ids).size !== ids.length) throw httpError(`${field} ganda dalam satu tagihan`, 400);
  const sorted = [...ids].sort((a, b) => a - b);

  if (ctx.type === 'rental') {
    // Kunci baris sumber (urut id, bebas deadlock) — void jam kerja mengunci baris yang sama
    await tx.$queryRaw`SELECT id FROM equipment_workhour_logs WHERE id = ANY(${sorted}) ORDER BY id FOR UPDATE`;
    const logs = await rentalLogs(tx, ctx.id, period, { excludeId, ids });
    const found = new Map(logs.map((l) => [l.id, l]));
    const invalid = ids.filter((id) => !found.has(id));
    if (invalid.length) {
      throw httpError(`Jam kerja ${invalid.join(', ')} tidak bisa ditagih: bukan milik kontrak ini, di luar periode, dibatalkan, atau sudah ada di tagihan aktif lain`, 409);
    }
    assertSingleRate(groupRates(payloadItems.map((i) => [found.get(i.equipmentWorkhourLogId).equipmentItem.assetCode, i.unitRate])), 'Unit');
    for (const i of payloadItems) {
      const unit = found.get(i.equipmentWorkhourLogId).equipmentItem;
      if (toNumber(unit.defaultHourlyRate) !== i.unitRate && !i.rateNotes?.trim()) {
        throw httpError(`Tarif ${unit.assetCode} berbeda dari tarif default (${toNumber(unit.defaultHourlyRate) ?? 'belum diisi'}) — rateNotes wajib diisi`, 400);
      }
    }
    return { snapshot: {}, items: payloadItems.map((i) => ({ equipmentWorkhourLogId: i.equipmentWorkhourLogId, unitRate: i.unitRate, rateNotes: i.rateNotes?.trim() || null })) };
  }

  await tx.$queryRaw`SELECT id FROM material_receipts WHERE id = ANY(${sorted}) ORDER BY id FOR UPDATE`;
  const receipts = await supplyReceipts(tx, ctx.id, period, { excludeId, ids });
  const found = new Map(receipts.map((r) => [r.id, r]));
  const invalid = ids.filter((id) => !found.has(id));
  if (invalid.length) {
    throw httpError(`Penerimaan ${invalid.join(', ')} tidak bisa ditagih: bukan milik kontrak ini, di luar periode, dibatalkan, atau sudah ada di tagihan aktif lain`, 409);
  }
  assertSingleRate(groupRates(payloadItems.map((i) => [found.get(i.materialReceiptId).materialDelivery.materialRequestItem.materialType.materialName, i.unitRate])), 'Material');
  return { snapshot: {}, items: payloadItems.map((i) => ({ materialReceiptId: i.materialReceiptId, unitRate: i.unitRate, rateNotes: i.rateNotes?.trim() || null })) };
};

const create = async (payload, userId) => {
  const ctx = contextOfPayload(payload);
  const period = parsePeriod(payload);
  await loadContextOrFail(prisma, ctx);

  const row = await prisma.$transaction(async (tx) => {
    const { snapshot, items } = await buildContent(tx, ctx, period, payload.items);
    const incomeCode = await nextDocumentNumber(tx, INCOME_DOC_TYPE, { pad: INCOME_DOC_PAD });
    const created = await tx.incomeRecord.create({
      data: {
        incomeCode,
        [CONTEXT_FK[ctx.type]]: ctx.id,
        periodStart: period.start, periodEnd: period.end,
        notes: payload.notes?.trim() || null,
        ...snapshot,
        createdBy: userId,
        items: { create: items },
      },
    });
    return findOrFail(created.id, tx);
  });
  return shapeDetail(row);
};

/** Pembuat mengubah isi selama Finance belum memutuskan (pola E30). Konteks tetap. */
const update = async (id, payload, userId) => {
  const current = await findOrFail(id);
  if (current.createdBy !== userId) throw httpError('Hanya pembuat yang boleh mengubah tagihan ini', 403);
  if (current.status !== 'submitted') throw httpError(`Tagihan berstatus "${current.status}" sudah tidak bisa diubah`, 409);
  const ctx = { type: contextTypeOf(current), id: current[CONTEXT_FK[contextTypeOf(current)]] };
  const period = parsePeriod(payload);

  const row = await prisma.$transaction(async (tx) => {
    const { snapshot, items } = await buildContent(tx, ctx, period, payload.items, id);
    await claimTransition(tx.incomeRecord, { id, status: 'submitted' }, {
      periodStart: period.start, periodEnd: period.end, notes: payload.notes?.trim() || null, ...snapshot,
    });
    await tx.incomeRecordItem.deleteMany({ where: { incomeRecordId: id } });
    if (items.length) await tx.incomeRecordItem.createMany({ data: items.map((i) => ({ ...i, incomeRecordId: id })) });
    return findOrFail(id, tx);
  });
  return shapeDetail(row);
};

const transition = async (row, from, data, after) => {
  const updated = await prisma.$transaction(async (tx) => {
    await claimTransition(tx.incomeRecord, { id: row.id, status: from }, data);
    if (after) await after(tx);
    return findOrFail(row.id, tx);
  });
  return shapeDetail(updated);
};

const cancel = async (id, { reason }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'submitted') throw httpError(`Tagihan berstatus "${row.status}" sudah tidak bisa dibatalkan`, 409);
  if (row.createdBy !== userId) throw httpError('Hanya pembuat yang boleh membatalkan tagihan ini', 403);
  if (!reason?.trim()) throw httpError('Alasan pembatalan wajib diisi', 400);
  return transition(row, 'submitted', { status: 'cancelled', cancelledBy: userId, cancelledAt: new Date(), cancelReason: reason.trim() });
};

// ------------------------------------------------------------
// KEPUTUSAN FINANCE
// ------------------------------------------------------------

const assertNotCreator = (row, userId, action) => {
  if (row.createdBy === userId) throw httpError(`Anda membuat tagihan ini, jadi tidak boleh ${action} sendiri`, 403);
};

/** Jurnal pengakuan pendapatan (accrual-light): Dr Piutang Usaha / Cr Pendapatan sesuai jenis. */
const postVerifyJournal = async (tx, row, userId) => {
  const { total } = (await totalsOf([row.id], tx)).get(row.id);
  const type = contextTypeOf(row);
  const ctx = shapeContext(row);
  return postJournal(tx, {
    sourceType: 'income_record', sourceId: row.id,
    journalDate: todayDate(),
    description: `Tagihan ${row.incomeCode} — ${CONTEXT_LABEL[type]} ${ctx.code}${ctx.subProject ? ` ${ctx.subProject.subProjectType}` : ''}`,
    lines: [
      { account: ACCOUNTS.RECEIVABLE, debit: total },
      { account: REVENUE_ACCOUNT[type], credit: total },
    ],
    context: journalContextOf(row),
    userId,
  });
};

const verify = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'submitted') throw httpError(`Tagihan berstatus "${row.status}", bukan antrean Finance`, 409);
  assertNotCreator(row, userId, 'memverifikasinya');
  return transition(row, 'submitted', { status: 'verified', verifiedBy: userId, verifiedAt: new Date(), financeNotes: notes?.trim() || null },
    (tx) => postVerifyJournal(tx, row, userId));
};

const reject = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'submitted') throw httpError(`Tagihan berstatus "${row.status}", bukan antrean Finance`, 409);
  assertNotCreator(row, userId, 'menolaknya');
  if (!notes?.trim()) throw httpError('Alasan penolakan wajib diisi', 400);
  return transition(row, 'submitted', { status: 'rejected', verifiedBy: userId, verifiedAt: new Date(), financeNotes: notes.trim() });
};

/**
 * Koreksi setelah diverifikasi (F6): verified → voided + jurnal balik hari ini. Ditolak
 * selama ada pembayaran aktif (void pembayarannya dulu). Record dikunci FOR UPDATE —
 * pencatat pembayaran mengunci baris yang sama.
 */
const voidRecord = async (id, { reason }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'verified') throw httpError(`Tagihan berstatus "${row.status}" — hanya tagihan terverifikasi yang bisa dibatalkan sebagai koreksi`, 409);
  assertNotCreator(row, userId, 'membatalkannya');
  if (!reason?.trim()) throw httpError('Alasan pembatalan wajib diisi', 400);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM income_records WHERE id = ${id} FOR UPDATE`;
    const payments = await tx.incomePayment.count({ where: { incomeRecordId: id, voidedAt: null } });
    if (payments) throw httpError(`Tagihan ini punya ${payments} pembayaran aktif — batalkan pembayarannya dulu`, 409);
    await claimTransition(tx.incomeRecord, { id, status: 'verified' }, { status: 'voided', voidedBy: userId, voidedAt: new Date(), voidReason: reason.trim() });
    await reverseJournal(tx, { sourceType: 'income_record', sourceId: id, reason: reason.trim(), userId });
    return findOrFail(id, tx);
  });
  return shapeDetail(updated);
};

module.exports = {
  billable, list, getById, create, update, cancel, verify, reject, voidRecord,
  totalsOf, journalContextOf, contextTypeOf, findOrFail,
};
