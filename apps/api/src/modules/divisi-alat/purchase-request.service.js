const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const cash = require('./cash.service.js');

const PR_DOC_TYPE = 'PRQ';
const PR_DOC_PAD = 6;

// Batas default Prisma untuk transaksi interaktif hanya 5 detik. Lewat
// connection pooler (Supabase) satu putaran bisa lewat dari itu, sehingga create
// order gagal dengan "Transaction already closed" padahal tidak ada konflik
// data. Dinaikkan supaya tidak bergantung pada latensi.
const TRANSACTION_OPTIONS = { maxWait: 15000, timeout: 30000 };

// Aspek yang belum mendekati jatuh tempo tidak boleh diajukan servisnya —
// kalau dibuka, anggaran perawatan bisa dipakai kapan saja tanpa pemicu.
const SERVICEABLE_SETTING_STATUSES = ['warning', 'due', 'overdue'];

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));
const toDateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

const ITEM_RELATION_BY_CATEGORY = {
  repair: 'repairItems',
  maintenance: 'maintenanceItems',
  stock: 'stockItems',
};

const requestInclude = {
  requestedByUser: { select: { id: true, username: true, fullName: true } },
  adminValidatedByUser: { select: { id: true, username: true, fullName: true } },
  financeApprovedByUser: { select: { id: true, username: true, fullName: true } },
  cancelledByUser: { select: { id: true, username: true, fullName: true } },
};

const detailInclude = {
  ...requestInclude,
  repairItems: {
    include: {
      damageLog: {
        select: {
          id: true, damageCode: true, description: true, sparePartSource: true, mechanicTeam: true,
          equipmentItem: { select: { id: true, assetCode: true } },
        },
      },
      spareparts: true,
    },
  },
  maintenanceItems: {
    include: {
      maintenanceSetting: {
        select: {
          id: true, status: true, thresholdValue: true, currentValueSinceReset: true,
          equipmentItem: { select: { id: true, assetCode: true } },
          maintenanceAspect: { select: { id: true, aspectCode: true, aspectName: true } },
        },
      },
    },
  },
  stockItems: true,
};

const shapeUser = (user) =>
  user ? { id: user.id, username: user.username, fullName: user.fullName } : null;

const shapeRequest = (pr) => ({
  id: pr.id,
  requestCode: pr.requestCode,
  requestDate: toDateOnly(pr.requestDate),
  orderCategory: pr.orderCategory,
  status: pr.status,
  totalEstimatedAmount: toNumber(pr.totalEstimatedAmount),
  totalApprovedAmount: toNumber(pr.totalApprovedAmount),
  requestedBy: shapeUser(pr.requestedByUser),
  adminValidatedBy: shapeUser(pr.adminValidatedByUser),
  adminValidatedAt: pr.adminValidatedAt,
  financeApprovedBy: shapeUser(pr.financeApprovedByUser),
  financeApprovedAt: pr.financeApprovedAt,
  cancelledBy: shapeUser(pr.cancelledByUser),
  cancelledAt: pr.cancelledAt,
  createdAt: pr.createdAt,
  updatedAt: pr.updatedAt,
  // Hanya kategori yang relevan yang ikut dikirim — dua tabel lain selalu kosong
  ...(pr.repairItems && {
    repairItems: pr.repairItems.map((item) => ({
      id: item.id,
      damageLogId: item.damageLogId,
      damageLog: item.damageLog
        ? {
            id: item.damageLog.id,
            damageCode: item.damageLog.damageCode,
            description: item.damageLog.description,
            sparePartSource: item.damageLog.sparePartSource,
            mechanicTeam: item.damageLog.mechanicTeam,
            equipmentItem: item.damageLog.equipmentItem,
          }
        : null,
      serviceFee: toNumber(item.serviceFee),
      approvedServiceFee: toNumber(item.approvedServiceFee),
      notes: item.notes,
      spareparts: (item.spareparts || []).map((sp) => ({
        id: sp.id,
        itemName: sp.itemName,
        quantity: toNumber(sp.quantity),
        estimatedUnitPrice: toNumber(sp.estimatedUnitPrice),
        estimatedTotalPrice: toNumber(sp.estimatedTotalPrice),
        approvedTotalPrice: toNumber(sp.approvedTotalPrice),
      })),
    })),
  }),
  ...(pr.maintenanceItems && {
    maintenanceItems: pr.maintenanceItems.map((item) => ({
      id: item.id,
      maintenanceSettingId: item.maintenanceSettingId,
      maintenanceSetting: item.maintenanceSetting
        ? {
            id: item.maintenanceSetting.id,
            status: item.maintenanceSetting.status,
            equipmentItem: item.maintenanceSetting.equipmentItem,
            maintenanceAspect: item.maintenanceSetting.maintenanceAspect,
          }
        : null,
      estimatedPrice: toNumber(item.estimatedPrice),
      approvedPrice: toNumber(item.approvedPrice),
    })),
  }),
  ...(pr.stockItems && {
    stockItems: pr.stockItems.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      quantity: toNumber(item.quantity),
      estimatedUnitPrice: toNumber(item.estimatedUnitPrice),
      estimatedTotalPrice: toNumber(item.estimatedTotalPrice),
      approvedTotalPrice: toNumber(item.approvedTotalPrice),
    })),
  }),
});

const findRequestOrFail = async (id, include = requestInclude) => {
  const pr = await prisma.equipmentPurchaseRequest.findUnique({ where: { id }, include });
  if (!pr) throw httpError('Purchase request tidak ditemukan', 404);
  return pr;
};

const formatRupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(value);

/**
 * Saldo Kas Alat BOLEH negatif — keputusan 25 Sep 2026: Finance yang memutuskan,
 * bukan sistem yang memblokir. Jadi ini peringatan yang ikut di response, bukan
 * error: pengaju tahu kasnya kurang, tapi ordernya tetap terkirim.
 * `null` artinya saldo cukup.
 */
const buildBalanceWarning = async (requestedAmount) => {
  const { balance } = await cash.getBalance();
  if (requestedAmount <= balance) return null;

  const shortfall = requestedAmount - balance;
  return {
    currentBalance: balance,
    requestedAmount,
    shortfall,
    message: `Pengajuan melebihi saldo Kas Alat sebesar ${formatRupiah(shortfall)}`,
  };
};

// ============================================================
// VALIDASI PER KATEGORI
// ============================================================

/**
 * Kombinasi yang menentukan sebuah kerusakan butuh PR atau tidak:
 *   warehouse + internal -> tidak butuh PR sama sekali
 *   warehouse + external -> butuh PR, JASA saja
 *   supplier  + internal -> butuh PR, SPAREPART saja
 *   supplier  + external -> butuh PR, keduanya
 */
const validateRepairItem = (damageLog, item) => {
  const { damageCode, sparePartSource, mechanicTeam } = damageLog;

  if (damageLog.status !== 'reported') {
    throw httpError(`Kerusakan ${damageCode} berstatus "${damageLog.status}" — hanya laporan yang masih terbuka bisa diajukan pembeliannya`, 409);
  }

  const buysSparepart = sparePartSource === 'supplier';
  const hiresMechanic = mechanicTeam === 'external';

  if (!buysSparepart && !hiresMechanic) {
    throw httpError(
      `Kerusakan ${damageCode} ditangani sendiri dengan sparepart gudang, jadi tidak perlu purchase request`,
      409
    );
  }

  const spareparts = item.spareparts || [];
  const fee = Number(item.serviceFee || 0);

  if (spareparts.length > 0 && !buysSparepart) {
    throw httpError(
      `Kerusakan ${damageCode} memakai sparepart dari gudang (spare_part_source = warehouse), jadi tidak boleh ada baris sparepart di sini`,
      409
    );
  }
  if (fee > 0 && !hiresMechanic) {
    throw httpError(
      `Kerusakan ${damageCode} dikerjakan mekanik internal, jadi harga jasa harus 0`,
      409
    );
  }
  if (spareparts.length === 0 && fee <= 0) {
    throw httpError(
      `Kerusakan ${damageCode} tidak punya sparepart maupun harga jasa — tidak ada yang diajukan`,
      400
    );
  }
};

const prepareRepairItems = async (items) => {
  const damageLogIds = items.map((item) => item.damageLogId);
  const unique = new Set(damageLogIds);
  if (unique.size !== damageLogIds.length) {
    throw httpError('Satu kerusakan hanya boleh muncul sekali dalam satu order', 400);
  }

  const logs = await prisma.damageLog.findMany({ where: { id: { in: damageLogIds } } });
  const logById = new Map(logs.map((log) => [log.id, log]));

  return items.map((item) => {
    const log = logById.get(item.damageLogId);
    if (!log) throw httpError(`Laporan kerusakan dengan ID ${item.damageLogId} tidak ditemukan`, 404);
    validateRepairItem(log, item);

    const spareparts = (item.spareparts || []).map((sp) => {
      const quantity = Number(sp.quantity);
      const unitPrice = Number(sp.estimatedUnitPrice);
      return {
        itemName: sp.itemName,
        quantity,
        estimatedUnitPrice: unitPrice,
        // Dihitung sistem — nilai kiriman klien diabaikan
        estimatedTotalPrice: quantity * unitPrice,
      };
    });

    return {
      damageLogId: item.damageLogId,
      serviceFee: Number(item.serviceFee || 0),
      notes: item.notes ?? null,
      spareparts,
    };
  });
};

const prepareMaintenanceItems = async (items) => {
  const settingIds = items.map((item) => item.maintenanceSettingId);
  if (new Set(settingIds).size !== settingIds.length) {
    throw httpError('Satu aspek maintenance hanya boleh muncul sekali dalam satu order', 400);
  }

  const settings = await prisma.equipmentMaintenanceSetting.findMany({
    where: { id: { in: settingIds } },
    include: {
      equipmentItem: { select: { assetCode: true } },
      maintenanceAspect: { select: { aspectName: true } },
    },
  });
  const settingById = new Map(settings.map((s) => [s.id, s]));

  return items.map((item) => {
    const setting = settingById.get(item.maintenanceSettingId);
    if (!setting) throw httpError(`Maintenance setting dengan ID ${item.maintenanceSettingId} tidak ditemukan`, 404);

    const label = `${setting.maintenanceAspect.aspectName} pada ${setting.equipmentItem.assetCode}`;
    if (!setting.isActive) throw httpError(`Setting ${label} sedang nonaktif`, 409);
    if (!SERVICEABLE_SETTING_STATUSES.includes(setting.status)) {
      throw httpError(
        `${label} berstatus "${setting.status}" — belum mendekati jatuh tempo, jadi belum bisa diajukan servisnya`,
        409
      );
    }

    return {
      maintenanceSettingId: item.maintenanceSettingId,
      estimatedPrice: Number(item.estimatedPrice),
    };
  });
};

const prepareStockItems = (items) =>
  items.map((item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.estimatedUnitPrice);
    return {
      itemName: item.itemName,
      quantity,
      estimatedUnitPrice: unitPrice,
      estimatedTotalPrice: quantity * unitPrice,
    };
  });

const sumEstimated = (orderCategory, prepared) => {
  if (orderCategory === 'repair') {
    return prepared.reduce(
      (total, item) =>
        total + item.serviceFee + item.spareparts.reduce((s, sp) => s + sp.estimatedTotalPrice, 0),
      0
    );
  }
  if (orderCategory === 'maintenance') {
    return prepared.reduce((total, item) => total + item.estimatedPrice, 0);
  }
  return prepared.reduce((total, item) => total + item.estimatedTotalPrice, 0);
};

// ============================================================
// QUERY
// ============================================================

/**
 * Daftar order harus ikut membawa item-nya: sisi alat memakai daftar ini untuk
 * mencari order yang terhubung ke sebuah damage log (repair) maupun ke setting
 * maintenance (maintenance) — tanpa item, kedua relasi itu tidak terlihat dan
 * halaman harus mengambil detail satu per satu.
 * Bentuk itemnya sama persis dengan detail, jadi shapeRequest bisa dipakai
 * tanpa cabang tambahan.
 */
const list = async ({ page = 1, limit = 20, orderCategory, status, search }) => {
  const where = {
    ...(orderCategory && { orderCategory }),
    ...(status && { status }),
    ...(search && { requestCode: { contains: search, mode: 'insensitive' } }),
  };

  const [rows, total] = await Promise.all([
    prisma.equipmentPurchaseRequest.findMany({
      where,
      include: detailInclude,
      orderBy: [{ requestDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.equipmentPurchaseRequest.count({ where }),
  ]);

  return { data: rows.map(shapeRequest), total, page, limit };
};

const getById = async (id) => {
  const pr = await findRequestOrFail(id, detailInclude);
  const shaped = shapeRequest(pr);

  // Layar approval Finance harus menampilkan saldo SETELAH pencairan, termasuk
  // kalau hasilnya negatif — itu justru keputusan yang diminta disadari.
  if (pr.status === 'waiting_finance_approval') {
    const { balance } = await cash.getBalance();
    const requestedAmount = Number(pr.totalEstimatedAmount);
    shaped.balanceProjection = {
      currentBalance: balance,
      requestedAmount,
      projectedBalance: balance - requestedAmount,
    };
  }
  return shaped;
};

// ============================================================
// CREATE
// ============================================================

const create = async (payload, userId) => {
  const { requestDate, orderCategory } = payload;
  const relation = ITEM_RELATION_BY_CATEGORY[orderCategory];

  const rawItems = payload[relation];
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw httpError(`Order kategori "${orderCategory}" wajib berisi minimal satu item pada "${relation}"`, 400);
  }

  const date = assertNotFuture(requestDate, 'Tanggal pengajuan');

  let prepared;
  if (orderCategory === 'repair') prepared = await prepareRepairItems(rawItems);
  else if (orderCategory === 'maintenance') prepared = await prepareMaintenanceItems(rawItems);
  else prepared = prepareStockItems(rawItems);

  const totalEstimatedAmount = sumEstimated(orderCategory, prepared);

  const created = await prisma.$transaction(async (tx) => {
    const requestCode = await nextDocumentNumber(tx, PR_DOC_TYPE, { pad: PR_DOC_PAD });

    return tx.equipmentPurchaseRequest.create({
      data: {
        requestCode,
        requestDate: date,
        orderCategory,
        totalEstimatedAmount,
        requestedBy: userId,
        ...(orderCategory === 'repair' && {
          repairItems: {
            create: prepared.map((item) => ({
              damageLogId: item.damageLogId,
              serviceFee: item.serviceFee,
              notes: item.notes,
              ...(item.spareparts.length > 0 && { spareparts: { create: item.spareparts } }),
            })),
          },
        }),
        ...(orderCategory === 'maintenance' && { maintenanceItems: { create: prepared } }),
        ...(orderCategory === 'stock' && { stockItems: { create: prepared } }),
      },
      include: detailInclude,
    });
  }, TRANSACTION_OPTIONS);

  return { ...shapeRequest(created), balanceWarning: await buildBalanceWarning(totalEstimatedAmount) };
};

// ============================================================
// UPDATE & CANCEL (milik pengaju)
// ============================================================

/** Ganti seluruh isi item. Hanya selama `submitted` — begitu Admin memvalidasi,
 *  angka yang dinilai tidak boleh berubah di belakang. */
const update = async (id, payload, userId) => {
  const pr = await findRequestOrFail(id);

  if (pr.status !== 'submitted') {
    throw httpError(`Order berstatus "${pr.status}" tidak bisa diubah lagi`, 409);
  }
  if (pr.requestedBy !== userId) {
    throw httpError('Hanya pengaju yang boleh mengubah order ini', 403);
  }
  if (payload.orderCategory && payload.orderCategory !== pr.orderCategory) {
    throw httpError('Kategori order tidak bisa diubah. Batalkan order ini dan buat yang baru.', 409);
  }

  const relation = ITEM_RELATION_BY_CATEGORY[pr.orderCategory];
  const rawItems = payload[relation];
  const date = payload.requestDate ? assertNotFuture(payload.requestDate, 'Tanggal pengajuan') : undefined;

  let prepared = null;
  if (rawItems !== undefined) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw httpError(`Order kategori "${pr.orderCategory}" wajib berisi minimal satu item`, 400);
    }
    if (pr.orderCategory === 'repair') prepared = await prepareRepairItems(rawItems);
    else if (pr.orderCategory === 'maintenance') prepared = await prepareMaintenanceItems(rawItems);
    else prepared = prepareStockItems(rawItems);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (prepared) {
      // Ganti total: hapus dulu, lalu buat ulang. Sparepart ikut terhapus lewat cascade.
      if (pr.orderCategory === 'repair') {
        await tx.equipmentPurchaseRepairItem.deleteMany({ where: { purchaseRequestId: id } });
        for (const item of prepared) {
          await tx.equipmentPurchaseRepairItem.create({
            data: {
              purchaseRequestId: id,
              damageLogId: item.damageLogId,
              serviceFee: item.serviceFee,
              notes: item.notes,
              ...(item.spareparts.length > 0 && { spareparts: { create: item.spareparts } }),
            },
          });
        }
      } else if (pr.orderCategory === 'maintenance') {
        await tx.equipmentPurchaseMaintenanceItem.deleteMany({ where: { purchaseRequestId: id } });
        await tx.equipmentPurchaseMaintenanceItem.createMany({
          data: prepared.map((item) => ({ ...item, purchaseRequestId: id })),
        });
      } else {
        await tx.equipmentPurchaseStockItem.deleteMany({ where: { purchaseRequestId: id } });
        await tx.equipmentPurchaseStockItem.createMany({
          data: prepared.map((item) => ({ ...item, purchaseRequestId: id })),
        });
      }
    }

    return tx.equipmentPurchaseRequest.update({
      where: { id },
      data: {
        ...(date && { requestDate: date }),
        ...(prepared && { totalEstimatedAmount: sumEstimated(pr.orderCategory, prepared) }),
      },
      include: detailInclude,
    });
  }, TRANSACTION_OPTIONS);

  return {
    ...shapeRequest(updated),
    balanceWarning: await buildBalanceWarning(Number(updated.totalEstimatedAmount)),
  };
};

const cancel = async (id, userId) => {
  const pr = await findRequestOrFail(id);

  if (['rejected_by_admin', 'rejected_by_finance', 'cancelled'].includes(pr.status)) {
    throw httpError(`Order berstatus "${pr.status}" sudah tidak berjalan`, 409);
  }
  if (pr.status === 'approved') {
    // Dana sudah keluar dari Kas Alat. Membatalkannya berarti mencatat uang
    // kembali masuk, dan SIAPA yang berwenang melakukan itu belum diputuskan —
    // pengaju sendiri jelas tidak cukup, karena dia bisa membuat saldo kas
    // terlihat lebih besar dari kenyataan tanpa Finance tahu.
    // Ditutup untuk MVP. Sementara ini koreksinya dicatat manual di Kas Alat
    // sebagai cash-in `adjustment` kategori "Koreksi Masuk", oleh Divisi Alat
    // yang memang memegang kasnya. Lihat backlog bagian G1.
    throw httpError(
      'Order yang sudah disetujui tidak bisa dibatalkan karena dananya sudah dicairkan. Catat pengembaliannya sebagai koreksi masuk di Kas Alat.',
      409
    );
  }
  if (pr.requestedBy !== userId) {
    throw httpError('Hanya pengaju yang boleh membatalkan order ini', 403);
  }

  const cancelled = await prisma.equipmentPurchaseRequest.update({
    where: { id },
    data: { status: 'cancelled', cancelledBy: userId, cancelledAt: new Date() },
    include: detailInclude,
  });
  return shapeRequest(cancelled);
};

// ============================================================
// VALIDASI ADMIN & APPROVAL FINANCE
// ============================================================

const assertNotOwnRequest = (pr, userId, action) => {
  if (pr.requestedBy === userId) {
    throw httpError(`Anda mengajukan order ini, jadi tidak boleh ${action} sendiri`, 403);
  }
};

/** submitted -> waiting_finance_approval. Tidak ada status `admin_validated`:
 *  validasi Admin langsung melempar ke antrean Finance. */
const validateByAdmin = async (id, userId) => {
  const pr = await findRequestOrFail(id);
  if (pr.status !== 'submitted') {
    throw httpError(`Order berstatus "${pr.status}" tidak menunggu validasi Admin`, 409);
  }
  assertNotOwnRequest(pr, userId, 'memvalidasi');

  const updated = await prisma.equipmentPurchaseRequest.update({
    where: { id },
    data: {
      status: 'waiting_finance_approval',
      adminValidatedBy: userId,
      adminValidatedAt: new Date(),
    },
    include: detailInclude,
  });
  return shapeRequest(updated);
};

const reject = async (id, userId, userRoles) => {
  const pr = await findRequestOrFail(id);
  assertNotOwnRequest(pr, userId, 'menolak');

  if (pr.status === 'submitted') {
    if (!userRoles.includes('admin')) {
      throw httpError('Order yang belum divalidasi hanya bisa ditolak Admin', 403);
    }
    const updated = await prisma.equipmentPurchaseRequest.update({
      where: { id },
      data: { status: 'rejected_by_admin', adminValidatedBy: userId, adminValidatedAt: new Date() },
      include: detailInclude,
    });
    return shapeRequest(updated);
  }

  if (pr.status === 'waiting_finance_approval') {
    if (!userRoles.includes('finance')) {
      throw httpError('Order yang menunggu pencairan hanya bisa ditolak Finance', 403);
    }
    const updated = await prisma.equipmentPurchaseRequest.update({
      where: { id },
      data: { status: 'rejected_by_finance', financeApprovedBy: userId, financeApprovedAt: new Date() },
      include: detailInclude,
    });
    return shapeRequest(updated);
  }

  throw httpError(`Order berstatus "${pr.status}" tidak bisa ditolak`, 409);
};

/**
 * Finance mengisi nominal AKTUAL per baris, bukan menyalin estimasi. Kalau
 * dibiarkan menyalin, saldo Kas Alat berisi angka perkiraan — konsekuensi yang
 * sudah dicatat saat `in_progress`/`completed` dibuang dari enum status.
 */
const approve = async (id, payload, userId) => {
  const pr = await findRequestOrFail(id, detailInclude);
  if (pr.status !== 'waiting_finance_approval') {
    throw httpError(`Order berstatus "${pr.status}" tidak menunggu approval Finance`, 409);
  }
  assertNotOwnRequest(pr, userId, 'menyetujui');

  const writes = [];
  let totalApprovedAmount = 0;

  if (pr.orderCategory === 'repair') {
    const decisions = payload.approvedRepairItems || [];
    const byId = new Map(decisions.map((d) => [d.repairItemId, d]));

    for (const item of pr.repairItems) {
      const decision = byId.get(item.id);
      if (!decision) throw httpError(`Nominal aktual untuk baris perbaikan ID ${item.id} belum diisi`, 400);

      const approvedFee = Number(decision.approvedServiceFee ?? 0);
      if (approvedFee > 0 && Number(item.serviceFee) === 0) {
        throw httpError(`Baris perbaikan ID ${item.id} tidak mengajukan biaya jasa, jadi nominalnya harus 0`, 400);
      }
      totalApprovedAmount += approvedFee;
      writes.push((tx) =>
        tx.equipmentPurchaseRepairItem.update({
          where: { id: item.id },
          data: { approvedServiceFee: approvedFee },
        })
      );

      const spDecisions = new Map((decision.spareparts || []).map((sp) => [sp.sparepartId, sp]));
      for (const sp of item.spareparts) {
        const spDecision = spDecisions.get(sp.id);
        if (!spDecision) throw httpError(`Nominal aktual untuk sparepart ID ${sp.id} belum diisi`, 400);
        const amount = Number(spDecision.approvedTotalPrice);
        totalApprovedAmount += amount;
        writes.push((tx) =>
          tx.equipmentPurchaseRepairSparepart.update({
            where: { id: sp.id },
            data: { approvedTotalPrice: amount },
          })
        );
      }
    }
  } else if (pr.orderCategory === 'maintenance') {
    const byId = new Map((payload.approvedMaintenanceItems || []).map((d) => [d.itemId, d]));
    for (const item of pr.maintenanceItems) {
      const decision = byId.get(item.id);
      if (!decision) throw httpError(`Nominal aktual untuk baris maintenance ID ${item.id} belum diisi`, 400);
      const amount = Number(decision.approvedPrice);
      totalApprovedAmount += amount;
      writes.push((tx) =>
        tx.equipmentPurchaseMaintenanceItem.update({
          where: { id: item.id },
          data: { approvedPrice: amount },
        })
      );
    }
  } else {
    const byId = new Map((payload.approvedStockItems || []).map((d) => [d.itemId, d]));
    for (const item of pr.stockItems) {
      const decision = byId.get(item.id);
      if (!decision) throw httpError(`Nominal aktual untuk baris stok ID ${item.id} belum diisi`, 400);
      const amount = Number(decision.approvedTotalPrice);
      totalApprovedAmount += amount;
      writes.push((tx) =>
        tx.equipmentPurchaseStockItem.update({
          where: { id: item.id },
          data: { approvedTotalPrice: amount },
        })
      );
    }
  }

  // Nominal baris, status header, DAN cash-out Kas Alat harus bergerak bersama.
  // Kalau salah satu gagal: jangan ada order approved dengan nominal setengah
  // terisi, order approved tanpa dana keluar, maupun dana keluar tanpa ordernya.
  const { updated, cashTransaction } = await prisma.$transaction(async (tx) => {
    for (const write of writes) await write(tx);

    const row = await tx.equipmentPurchaseRequest.update({
      where: { id },
      data: {
        status: 'approved',
        totalApprovedAmount,
        financeApprovedBy: userId,
        financeApprovedAt: new Date(),
      },
      include: detailInclude,
    });

    // Saldo boleh jadi negatif — keputusan Finance, bukan blokir sistem.
    // Nominalnya totalApprovedAmount (yang benar-benar dicairkan), BUKAN estimasi.
    const created = totalApprovedAmount > 0
      ? await cash.recordPurchaseRequestCashOut(tx, row, userId)
      : null;

    return { updated: row, cashTransaction: created };
  }, TRANSACTION_OPTIONS);

  return {
    ...shapeRequest(updated),
    cashTransactionCreated: Boolean(cashTransaction),
    cashTransaction: cashTransaction ? cash.shapeTransaction(cashTransaction) : null,
  };
};

module.exports = {
  list, getById, create, update, cancel,
  validateByAdmin, reject, approve,
};
