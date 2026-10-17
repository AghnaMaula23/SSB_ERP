const ExcelJS = require('exceljs');
const { httpError } = require('../../utils/error.js');
const { toNumber, toDateOnly } = require('../../utils/shape.js');
const fileService = require('../file/file.service.js');
const stock = require('../request-material/material-stock.service.js');

// ============================================================
// ARSIP PENUTUPAN (L8, docs/keputusan-desain-lampiran.md)
//
// XLSX dibuat SEKALI di dalam transaksi penutupan tahapan/project, dari data
// yang dibaca lewat `tx` SETELAH baris konteks dikunci FOR UPDATE — tidak ada
// tulis yang bisa menyelip (context-lock.js). Disimpan sebagai file biasa;
// tidak pernah dibuat ulang, jadi arsip tetap sama walau kode berubah kelak.
//
// Pemakaian (di service status):
//   const store = closingArchive.createStore(userId);
//   try { await prisma.$transaction(async (tx) => { ...; await closingArchive.archiveStage(tx, store, ...) }) }
//   catch (err) { await store.discard(); throw err; }
// ============================================================

const PREFIX = 'closing-archives';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TZ = 'Asia/Jakarta';
const SESSIONS = [['pagi', 'Pagi'], ['siang', 'Siang'], ['overtime', 'Overtime']];

const dateTimeText = (d) => (d
  ? `${new Intl.DateTimeFormat('id-ID', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(d)} WIB`
  : '');
const timeText = (d) => (d
  ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
  : '');
const round2 = (n) => Math.round(n * 100) / 100;
const actorName = (u) => u?.fullName || u?.username || '';
const safeName = (text) => String(text).replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '');

const createStore = (userId) => fileService.generatedFileStore({ prefix: PREFIX, userId });

// ------------------------------------------------------------
// Penyusun sheet: blok kepala (identitas + "diarsipkan oleh") lalu tabel
// ------------------------------------------------------------

const addSheet = (wb, title, head, columns, rows, footer) => {
  const ws = wb.addWorksheet(title);
  head.forEach(([label, value]) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  });
  ws.addRow([]);
  ws.addRow(columns.map((c) => c.header)).font = { bold: true };
  rows.forEach((r) => ws.addRow(columns.map((c) => c.value(r) ?? '')));
  (footer ?? []).forEach((f) => { ws.addRow(f).font = { bold: true }; });
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? 16; });
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width, 22);
  return ws;
};

/** Sheet daftar kunci-nilai (mis. kontrak tahapan). */
const addInfoSheet = (wb, title, head, pairs) => addSheet(wb, title, head,
  [{ header: 'Keterangan', value: (r) => r[0], width: 28 }, { header: 'Nilai', value: (r) => r[1], width: 36 }], pairs);

const headBlock = (ctx, subject) => [
  ['Project', `${ctx.code} — ${ctx.name}`],
  ...(subject ? [subject] : []),
  ['Diarsipkan', `${dateTimeText(ctx.closedAt)} oleh ${ctx.closedBy}, saat penutupan`],
  ['Status akhir', ctx.closedStatus],
];

const save = async (tx, store, wb, { owner, archiveKey, fileLabel, ctx, equipmentPoolItemId = null }) => {
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const originalName = `${safeName(ctx.code)}_${safeName(fileLabel)}_${archiveKey}_${toDateOnly(ctx.closedAt)}.xlsx`;
  const file = await store.save(tx, { buffer, originalName, mimeType: XLSX_MIME, ext: 'xlsx' });
  await tx.projectClosingArchive.create({ data: { ...owner, equipmentPoolItemId, archiveKey, fileId: file.id } });
};

const closingContext = async (tx, userId, closedStatus, code, name) => {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { username: true, fullName: true } });
  if (!user) throw httpError('User penutup tidak ditemukan', 400);
  return { code, name, closedStatus, closedAt: new Date(), closedBy: actorName(user) };
};

// ------------------------------------------------------------
// Tahapan konstruksi: stage-progress, stage-equipment, stage-material
// ------------------------------------------------------------

const stageProgressBook = async (tx, sp, ctx, subject) => {
  // Lazy: sub-project.service memanggil modul ini, jadi require di atas akan melingkar
  const { calculateProgress } = require('../project/sub-project.service.js');
  const progress = await calculateProgress(sp, tx);
  const logs = await tx.dailyProgressLog.findMany({
    where: { subProjectId: sp.id },
    include: { fieldCondition: true, createdByUser: true, validatedByUser: true },
    orderBy: { progressDate: 'asc' },
  });

  const wb = new ExcelJS.Workbook();
  const head = headBlock(ctx, subject);
  addInfoSheet(wb, 'Kontrak', head, [
    ['Jenis tahapan', sp.subProjectType],
    ['No. kontrak', sp.contractNo ?? ''],
    ['Tanggal kontrak', toDateOnly(sp.contractDate) ?? ''],
    ['Periode kontrak', `${toDateOnly(sp.contractStartDate) ?? '-'} s.d. ${toDateOnly(sp.contractEndDate) ?? '-'}`],
    ['Nilai kontrak', progress.contractValue],
    ['Target volume', `${progress.targetVolume} ${sp.volumeUnit}`],
    ['Volume tervalidasi', `${progress.validatedVolume} ${sp.volumeUnit}`],
    ['Progress tertagih (%)', progress.billableProgress],
    ['Nilai tertagih', progress.billableAmount],
  ]);
  addSheet(wb, 'Progress Harian', head, [
    { header: 'Tanggal', value: (l) => toDateOnly(l.progressDate), width: 12 },
    { header: `Volume (${sp.volumeUnit})`, value: (l) => toNumber(l.realizedVolume) },
    { header: 'Status', value: (l) => l.status, width: 12 },
    { header: 'Divalidasi oleh', value: (l) => actorName(l.validatedByUser), width: 20 },
    { header: 'Waktu validasi', value: (l) => dateTimeText(l.validatedAt), width: 24 },
    { header: 'Catatan validasi', value: (l) => l.validationNotes, width: 28 },
    { header: 'Catatan', value: (l) => l.notes, width: 28 },
    { header: 'Cuaca pagi', value: (l) => l.fieldCondition?.weatherMorning },
    { header: 'Cuaca siang', value: (l) => l.fieldCondition?.weatherAfternoon },
    { header: 'Kondisi lapangan', value: (l) => l.fieldCondition?.fieldConditionNotes, width: 28 },
    { header: 'Insiden', value: (l) => l.fieldCondition?.incidentNotes, width: 28 },
    { header: 'Dicatat oleh', value: (l) => actorName(l.createdByUser), width: 20 },
  ], logs, [['Total tervalidasi', progress.validatedVolume]]);
  return wb;
};

const stageEquipmentBook = async (tx, sp, ctx, subject) => {
  const allocations = await tx.subProjectEquipmentAllocation.findMany({
    where: { subProjectId: sp.id },
    include: { equipmentItem: { include: { equipmentType: true } }, allocatedByUser: true, receivedByUser: true },
    orderBy: { id: 'asc' },
  });
  const logs = await tx.equipmentWorkhourLog.findMany({
    where: { subProjectEquipmentAllocation: { subProjectId: sp.id }, isVoided: false },
    include: { equipmentItem: { include: { equipmentType: true } }, createdByUser: true },
    orderBy: [{ workDate: 'asc' }, { startedAt: 'asc' }, { id: 'asc' }],
  });

  const perUnit = new Map();
  for (const l of logs) {
    const key = l.equipmentItem.assetCode;
    const u = perUnit.get(key) ?? { unit: key, type: l.equipmentItem.equipmentType.typeName, hours: 0, days: new Set() };
    u.hours = round2(u.hours + toNumber(l.totalWorkhour));
    u.days.add(toDateOnly(l.workDate));
    perUnit.set(key, u);
  }
  const total = round2(logs.reduce((s, l) => s + toNumber(l.totalWorkhour), 0));

  const wb = new ExcelJS.Workbook();
  const head = headBlock(ctx, subject);
  addSheet(wb, 'Alokasi', head, [
    { header: 'Unit', value: (a) => a.equipmentItem?.assetCode },
    { header: 'Jenis alat', value: (a) => a.equipmentItem?.equipmentType.typeName, width: 22 },
    { header: 'Dialokasikan', value: (a) => dateTimeText(a.allocatedAt), width: 24 },
    { header: 'Oleh', value: (a) => actorName(a.allocatedByUser), width: 20 },
    { header: 'Diterima di lokasi', value: (a) => dateTimeText(a.receivedAt), width: 24 },
    { header: 'Penerima', value: (a) => actorName(a.receivedByUser), width: 20 },
    { header: 'Status', value: (a) => a.status, width: 12 },
  ], allocations);
  addSheet(wb, 'Jam Kerja', head, [
    { header: 'Tanggal', value: (l) => toDateOnly(l.workDate), width: 12 },
    { header: 'Unit', value: (l) => l.equipmentItem.assetCode },
    { header: 'Mulai', value: (l) => timeText(l.startedAt), width: 10 },
    { header: 'Selesai', value: (l) => timeText(l.stoppedAt), width: 10 },
    { header: 'Jeda (menit)', value: (l) => l.pausedDurationMinutes, width: 12 },
    { header: 'Total jam', value: (l) => toNumber(l.totalWorkhour), width: 12 },
    { header: 'Keterangan', value: (l) => l.description, width: 32 },
    { header: 'Dicatat oleh', value: (l) => actorName(l.createdByUser), width: 20 },
  ], logs, [['Total jam', '', '', '', '', total]]);
  addSheet(wb, 'Rekap per Unit', head, [
    { header: 'Unit', value: (u) => u.unit },
    { header: 'Jenis alat', value: (u) => u.type, width: 22 },
    { header: 'Total jam', value: (u) => u.hours, width: 12 },
    { header: 'Hari kerja', value: (u) => u.days.size, width: 12 },
  ], [...perUnit.values()], [['Total', '', total]]);
  return wb;
};

const stageMaterialBook = async (tx, sp, ctx, subject) => {
  const requests = await tx.materialRequest.findMany({
    where: { subProjectId: sp.id, status: { not: 'cancelled' } },
    include: { items: { include: { materialType: true } }, costs: true },
    orderBy: { id: 'asc' },
  });
  const deliveries = await tx.materialDelivery.findMany({
    where: { materialRequest: { subProjectId: sp.id }, cancelledAt: null },
    include: { materialRequestItem: { include: { materialType: true } }, supplier: true },
    orderBy: [{ deliveryNoteDate: 'asc' }, { id: 'asc' }],
  });
  const receipts = await tx.materialReceipt.findMany({
    where: { materialDelivery: { materialRequest: { subProjectId: sp.id }, cancelledAt: null }, cancelledAt: null },
    include: { materialDelivery: { include: { materialRequestItem: { include: { materialType: true } } } } },
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
  });
  const movements = await tx.materialStockMovement.findMany({
    where: { subProjectId: sp.id, cancelledAt: null },
    include: { materialType: true },
    orderBy: [{ movementDate: 'asc' }, { id: 'asc' }],
  });
  const balances = await stock.balances(tx, sp.id);

  const itemRows = requests.flatMap((r) => r.items.map((i) => ({ r, i })));
  const costRows = requests.flatMap((r) => r.costs.map((c) => ({ r, c })));

  const wb = new ExcelJS.Workbook();
  const head = headBlock(ctx, subject);
  addSheet(wb, 'Request', head, [
    { header: 'Kode request', value: ({ r }) => r.requestCode },
    { header: 'Tanggal', value: ({ r }) => toDateOnly(r.requestDate), width: 12 },
    { header: 'Status', value: ({ r }) => r.status, width: 14 },
    { header: 'Material', value: ({ i }) => i.materialType.materialName, width: 24 },
    { header: 'Diminta', value: ({ i }) => toNumber(i.requestedQuantity), width: 12 },
    { header: 'Disetujui Admin', value: ({ i }) => toNumber(i.adminValidatedQuantity ?? i.requestedQuantity), width: 16 },
    { header: 'Satuan', value: ({ i }) => i.materialType.unit, width: 10 },
  ], itemRows);
  addSheet(wb, 'Biaya', head, [
    { header: 'Kode request', value: ({ r }) => r.requestCode },
    { header: 'Jenis biaya', value: ({ c }) => c.costType, width: 20 },
    { header: 'Uraian', value: ({ c }) => c.description, width: 32 },
    { header: 'Jumlah', value: ({ c }) => toNumber(c.amount) },
    { header: 'Penerima', value: ({ c }) => c.payeeName, width: 22 },
  ], costRows, [['Total biaya', '', '', round2(costRows.reduce((s, { c }) => s + toNumber(c.amount), 0))]]);
  addSheet(wb, 'Surat Jalan', head, [
    { header: 'Tanggal SJ', value: (d) => toDateOnly(d.deliveryNoteDate), width: 12 },
    { header: 'Nomor SJ', value: (d) => d.deliveryNoteNumber },
    { header: 'Kode delivery', value: (d) => d.deliveryCode },
    { header: 'Material', value: (d) => d.materialRequestItem.materialType.materialName, width: 24 },
    { header: 'Kuantitas', value: (d) => toNumber(d.deliveredQuantity), width: 12 },
    { header: 'Satuan', value: (d) => d.materialRequestItem.materialType.unit, width: 10 },
    { header: 'Supplier', value: (d) => d.supplier.supplierName, width: 24 },
    { header: 'Kendaraan', value: (d) => d.vehicleType },
    { header: 'Nopol', value: (d) => d.vehicleNumber, width: 12 },
    { header: 'Sopir', value: (d) => d.driverName, width: 18 },
  ], deliveries);
  addSheet(wb, 'Penerimaan', head, [
    { header: 'Kode receipt', value: (r) => r.receiptCode },
    { header: 'Kode delivery', value: (r) => r.materialDelivery.deliveryCode },
    { header: 'Diterima', value: (r) => dateTimeText(r.receivedAt), width: 24 },
    { header: 'Material', value: (r) => r.materialDelivery.materialRequestItem.materialType.materialName, width: 24 },
    { header: 'Datang', value: (r) => toNumber(r.receivedQuantity), width: 12 },
    { header: 'Diterima baik', value: (r) => toNumber(r.acceptedQuantity), width: 14 },
    { header: 'Satuan', value: (r) => r.materialDelivery.materialRequestItem.materialType.unit, width: 10 },
    { header: 'Catatan', value: (r) => r.notes, width: 28 },
  ], receipts);
  addSheet(wb, 'Mutasi Stok', head, [
    { header: 'Tanggal', value: (m) => toDateOnly(m.movementDate), width: 12 },
    { header: 'Jenis', value: (m) => m.movementType, width: 16 },
    { header: 'Material', value: (m) => m.materialType.materialName, width: 24 },
    { header: 'Kuantitas', value: (m) => toNumber(m.quantity), width: 12 },
    { header: 'Satuan', value: (m) => m.materialType.unit, width: 10 },
    { header: 'Catatan', value: (m) => m.notes, width: 28 },
  ], movements);
  addSheet(wb, 'Saldo', head, [
    { header: 'Material', value: (b) => b.materialType.materialName, width: 24 },
    { header: 'Diterima', value: (b) => b.received, width: 12 },
    { header: 'Koreksi masuk', value: (b) => b.adjustmentIn, width: 14 },
    { header: 'Dipakai', value: (b) => b.used, width: 12 },
    { header: 'Koreksi keluar', value: (b) => b.adjustmentOut, width: 14 },
    { header: 'Saldo akhir', value: (b) => b.balance, width: 12 },
    { header: 'Satuan', value: (b) => b.unit, width: 10 },
  ], balances);
  return wb;
};

const STAGE_ARCHIVES = [
  ['stage-progress', 'progress', stageProgressBook],
  ['stage-equipment', 'alat', stageEquipmentBook],
  ['stage-material', 'material', stageMaterialBook],
];

/** Dipanggil di transaksi penutupan tahapan, setelah lockForClosing & syarat lolos. */
const archiveStage = async (tx, store, subProjectId, closedStatus, userId) => {
  const sp = await tx.subProject.findUnique({ where: { id: subProjectId }, include: { constructionProject: true } });
  const ctx = await closingContext(tx, userId, closedStatus, sp.constructionProject.projectCode, sp.constructionProject.projectName);
  const subject = ['Tahapan', sp.subProjectType];
  const owner = { constructionProjectId: sp.constructionProjectId, subProjectId: sp.id };
  for (const [archiveKey, label, build] of STAGE_ARCHIVES) {
    const wb = await build(tx, sp, ctx, subject);
    await save(tx, store, wb, { owner, archiveKey, fileLabel: `${sp.subProjectType}-${label}`, ctx });
  }
};

// ------------------------------------------------------------
// Tingkat project: project-summary, supply-deliveries, rental-timesheet
// ------------------------------------------------------------

const projectSummaryBook = async (tx, project, ctx) => {
  const { calculateProgress } = require('../project/sub-project.service.js');
  const stages = await tx.subProject.findMany({ where: { constructionProjectId: project.id }, orderBy: { sequenceOrder: 'asc' } });
  const rows = [];
  for (const sp of stages) rows.push({ sp, p: await calculateProgress(sp, tx) });

  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'Rekap Tahapan', headBlock(ctx), [
    { header: 'Tahapan', value: ({ sp }) => sp.subProjectType, width: 16 },
    { header: 'Status', value: ({ sp }) => sp.status, width: 12 },
    { header: 'No. kontrak', value: ({ sp }) => sp.contractNo, width: 18 },
    { header: 'Nilai kontrak', value: ({ p }) => p.contractValue },
    { header: 'Target volume', value: ({ p }) => p.targetVolume },
    { header: 'Volume tervalidasi', value: ({ p }) => p.validatedVolume, width: 18 },
    { header: 'Satuan', value: ({ sp }) => sp.volumeUnit, width: 10 },
    { header: 'Progress (%)', value: ({ p }) => p.billableProgress, width: 12 },
    { header: 'Nilai tertagih', value: ({ p }) => p.billableAmount },
  ], rows, [[
    'Total', '', '',
    round2(rows.reduce((s, { p }) => s + p.contractValue, 0)), '', '', '', '',
    round2(rows.reduce((s, { p }) => s + p.billableAmount, 0)),
  ]]);
  return wb;
};

const supplyDeliveriesBook = async (tx, project, ctx) => {
  const deliveries = await tx.materialDelivery.findMany({
    where: { materialRequest: { externalSupplyProjectId: project.id }, cancelledAt: null },
    include: { materialRequestItem: { include: { materialType: true } } },
    orderBy: [{ deliveryNoteDate: 'asc' }, { id: 'asc' }],
  });
  // Total per satuan (D1): material bersatuan beda tidak dijumlahkan jadi satu angka
  const perUnit = new Map();
  deliveries.forEach((d) => {
    const unit = d.materialRequestItem.materialType.unit;
    perUnit.set(unit, round2((perUnit.get(unit) ?? 0) + toNumber(d.deliveredQuantity)));
  });

  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'Surat Jalan', headBlock(ctx, ['Klien', project.clientName ?? '']), [
    { header: 'No', value: (d) => deliveries.indexOf(d) + 1, width: 6 },
    { header: 'Tanggal', value: (d) => toDateOnly(d.deliveryNoteDate), width: 12 },
    { header: 'Nomor surat jalan', value: (d) => d.deliveryNoteNumber, width: 20 },
    { header: 'Tipe kendaraan', value: (d) => d.vehicleType },
    { header: 'Nomor polisi', value: (d) => d.vehicleNumber, width: 14 },
    { header: 'Driver', value: (d) => d.driverName, width: 18 },
    { header: 'Material', value: (d) => d.materialRequestItem.materialType.materialName, width: 22 },
    { header: 'Gali (asal)', value: (d) => d.originLocation, width: 22 },
    { header: 'Bongkar (tujuan)', value: (d) => d.destinationLocation, width: 22 },
    { header: 'Volume', value: (d) => toNumber(d.deliveredQuantity), width: 12 },
    { header: 'Satuan', value: (d) => d.materialRequestItem.materialType.unit, width: 10 },
  ], deliveries, [...perUnit].map(([unit, qty]) => ['Total', '', '', '', '', '', '', '', '', qty, unit]));
  return wb;
};

const rentalTimesheetBook = async (tx, project, poolItem, ctx) => {
  const logs = await tx.equipmentWorkhourLog.findMany({
    where: { equipmentPoolItemId: poolItem.id, isVoided: false },
    orderBy: [{ workDate: 'asc' }, { startedAt: 'asc' }, { id: 'asc' }],
  });
  const byDate = new Map();
  for (const l of logs) {
    const date = toDateOnly(l.workDate);
    const row = byDate.get(date) ?? { date, sessions: {}, unsessioned: 0, total: 0, notes: [] };
    const hours = toNumber(l.totalWorkhour);
    if (l.workSession) row.sessions[l.workSession] = { start: timeText(l.startedAt), end: timeText(l.stoppedAt), hours };
    else row.unsessioned = round2(row.unsessioned + hours);
    row.total = round2(row.total + hours);
    if (l.description) row.notes.push(l.description);
    byDate.set(date, row);
  }
  const rows = [...byDate.values()];
  const sum = (fn) => round2(rows.reduce((s, r) => s + fn(r), 0));

  const columns = [
    { header: 'No', value: (r) => rows.indexOf(r) + 1, width: 6 },
    { header: 'Tanggal', value: (r) => r.date, width: 12 },
    ...SESSIONS.flatMap(([key, label]) => [
      { header: `${label} awal`, value: (r) => r.sessions[key]?.start, width: 11 },
      { header: `${label} akhir`, value: (r) => r.sessions[key]?.end, width: 11 },
      { header: `${label} jam`, value: (r) => r.sessions[key]?.hours ?? 0, width: 10 },
    ]),
    // Log lama sebelum sesi dicatat (17 Okt 2026) tidak ditebak sesinya
    { header: 'Tanpa sesi (jam)', value: (r) => r.unsessioned || '', width: 14 },
    { header: 'Total jam', value: (r) => r.total, width: 11 },
    { header: 'Hari', value: (r) => (r.total > 0 ? 1 : 0), width: 6 },
    { header: 'Keterangan', value: (r) => r.notes.join('; '), width: 32 },
  ];
  const footer = ['Jumlah', '', ...SESSIONS.flatMap(([key]) => ['', '', sum((r) => r.sessions[key]?.hours ?? 0)]),
    sum((r) => r.unsessioned), sum((r) => r.total), rows.filter((r) => r.total > 0).length, ''];

  const unit = `${poolItem.equipmentType.typeName} — ${poolItem.equipmentItem.assetCode}`;
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'Timesheet', [
    ...headBlock(ctx, ['Penyewa', project.clientName ?? '']),
    ['Periode', `${toDateOnly(project.contractStartDate) ?? '-'} s.d. ${toDateOnly(project.contractEndDate) ?? '-'}`],
    ['Alat', unit],
    ['Operator', poolItem.operatorName ?? ''],
  ], columns, rows, [footer]);
  return wb;
};

/**
 * Dipanggil di transaksi penutupan project, setelah lockForClosing & syarat lolos.
 * `model` = nama model Prisma project (konfigurasi project.service).
 */
const archiveProject = async (tx, store, model, projectId, closedStatus, userId) => {
  const project = await tx[model].findUnique({ where: { id: projectId } });

  if (model === 'constructionProject') {
    const ctx = await closingContext(tx, userId, closedStatus, project.projectCode, project.projectName);
    const wb = await projectSummaryBook(tx, project, ctx);
    return save(tx, store, wb, { owner: { constructionProjectId: projectId }, archiveKey: 'project-summary', fileLabel: 'rekap', ctx });
  }
  if (model === 'externalSupplyProject') {
    const ctx = await closingContext(tx, userId, closedStatus, project.supplyProjectCode, project.supplyProjectName);
    const wb = await supplyDeliveriesBook(tx, project, ctx);
    return save(tx, store, wb, { owner: { externalSupplyProjectId: projectId }, archiveKey: 'supply-deliveries', fileLabel: 'surat-jalan', ctx });
  }

  const ctx = await closingContext(tx, userId, closedStatus, project.rentalProjectCode, project.rentalProjectName);
  // Satu file per unit yang pernah terikat ke kontrak ini
  const poolItems = await tx.equipmentPoolItem.findMany({
    where: { equipmentPool: { externalRentalProjectId: projectId }, equipmentItemId: { not: null } },
    include: { equipmentType: true, equipmentItem: true },
    orderBy: { id: 'asc' },
  });
  for (const poolItem of poolItems) {
    const wb = await rentalTimesheetBook(tx, project, poolItem, ctx);
    await save(tx, store, wb, {
      owner: { externalRentalProjectId: projectId }, archiveKey: 'rental-timesheet',
      fileLabel: poolItem.equipmentItem.assetCode, ctx, equipmentPoolItemId: poolItem.id,
    });
  }
  return undefined;
};

module.exports = { createStore, archiveStage, archiveProject };
