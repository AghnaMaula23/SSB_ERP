const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');

const CASH_DOC_TYPE = 'KAS';
const CASH_DOC_PAD = 6;

// Sama seperti purchase-request: batas default transaksi interaktif Prisma 5
// detik terlalu pendek untuk connection pooler Supabase.
const TRANSACTION_OPTIONS = { maxWait: 15000, timeout: 30000 };

/**
 * Baris bersumber dokumen WAJIB dibuat sistem lewat recordPurchaseRequest*().
 * Kalau boleh diketik manual, orang bisa mencatat cash-in klaim pendapatan
 * fiktif tanpa klaim di belakangnya — dan saldo kas jadi karangan.
 */
const SYSTEM_SOURCE_TYPES = ['equipment_income_claim', 'equipment_purchase_request'];

/**
 * Arah uang yang sah per sumber (§6 kas-alat-kombinasi-transaksi.md).
 * `adjustment` sengaja dua arah: koreksi bisa menambah (dana order batal
 * kembali) maupun mengurangi (kas tercatat kelebihan).
 */
const ALLOWED_TYPES_BY_SOURCE = {
  opening_balance: ['cash_in'],
  equipment_income_claim: ['cash_in'],
  equipment_purchase_request: ['cash_out'],
  manual_expense: ['cash_out'],
  adjustment: ['cash_in', 'cash_out'],
};

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));
const toDateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

const shapeUser = (user) =>
  user ? { id: user.id, username: user.username, fullName: user.fullName } : null;

const shapeCategory = (category) => ({
  id: category.id,
  categoryName: category.categoryName,
  transactionType: category.transactionType,
  orderCategory: category.orderCategory,
  description: category.description,
  isActive: category.isActive,
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
  ...(category._count && { transactionCount: category._count.transactions }),
});

const transactionInclude = {
  category: { select: { id: true, categoryName: true, transactionType: true, orderCategory: true } },
  createdByUser: { select: { id: true, username: true, fullName: true } },
  voidedByUser: { select: { id: true, username: true, fullName: true } },
};

const shapeTransaction = (row) => ({
  id: row.id,
  transactionCode: row.transactionCode,
  transactionDate: toDateOnly(row.transactionDate),
  transactionType: row.transactionType,
  category: row.category
    ? {
        id: row.category.id,
        categoryName: row.category.categoryName,
        transactionType: row.category.transactionType,
        orderCategory: row.category.orderCategory,
      }
    : null,
  amount: toNumber(row.amount),
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  description: row.description,
  // Baris sistem tidak bisa diubah maupun dibatalkan lewat endpoint manual —
  // dikirim eksplisit supaya frontend tidak perlu menebak aturannya sendiri.
  isSystemGenerated: SYSTEM_SOURCE_TYPES.includes(row.sourceType),
  isVoided: row.isVoided,
  voidReason: row.voidReason,
  voidedBy: shapeUser(row.voidedByUser),
  voidedAt: row.voidedAt,
  createdBy: shapeUser(row.createdByUser),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

// ============================================================
// SALDO
// ============================================================

/**
 * Saldo TIDAK disimpan per baris, melainkan dijumlahkan saat dibaca — keputusan
 * 29 Sep 2026. Karena tidak ada rantai saldo, baris lama boleh diperbaiki dan
 * dibatalkan tanpa merusak baris sesudahnya, dan tidak perlu penguncian saat
 * menulis. Volume kas divisi ini ratusan baris per tahun.
 *
 * `client` bisa diisi `tx` supaya saldo terbaca konsisten di dalam transaksi.
 */
const getBalance = async (client = prisma, where = {}) => {
  const rows = await client.equipmentCashTransaction.groupBy({
    by: ['transactionType'],
    where: { isVoided: false, ...where },
    _sum: { amount: true },
  });

  const sumOf = (type) =>
    Number(rows.find((row) => row.transactionType === type)?._sum.amount ?? 0);

  const totalIn = sumOf('cash_in');
  const totalOut = sumOf('cash_out');
  return { totalIn, totalOut, balance: totalIn - totalOut };
};

const buildDateRange = (dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) return undefined;
  return {
    ...(dateFrom && { gte: new Date(dateFrom) }),
    ...(dateTo && { lte: new Date(dateTo) }),
  };
};

/**
 * Saldo berjalan selalu seluruh riwayat — periode hanya menyaring MUTASI-nya.
 * Kalau saldo ikut disaring periode, angka yang muncul bukan uang yang ada.
 */
const getSummary = async ({ dateFrom, dateTo }) => {
  const dateRange = buildDateRange(dateFrom, dateTo);
  const periodWhere = dateRange ? { transactionDate: dateRange } : {};

  const [balance, movement, grouped, categories] = await Promise.all([
    getBalance(),
    getBalance(prisma, periodWhere),
    prisma.equipmentCashTransaction.groupBy({
      by: ['categoryId'],
      where: { isVoided: false, ...periodWhere },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.equipmentCashCategory.findMany(),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return {
    balance: balance.balance,
    totalIn: balance.totalIn,
    totalOut: balance.totalOut,
    period: {
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      totalIn: movement.totalIn,
      totalOut: movement.totalOut,
      net: movement.totalIn - movement.totalOut,
    },
    byCategory: grouped
      .map((row) => {
        const category = categoryById.get(row.categoryId);
        return {
          categoryId: row.categoryId,
          categoryName: category?.categoryName ?? null,
          transactionType: category?.transactionType ?? null,
          total: Number(row._sum.amount ?? 0),
          transactionCount: row._count._all,
        };
      })
      .sort((a, b) => b.total - a.total),
  };
};

// ============================================================
// KATEGORI KAS
// ============================================================

const findCategoryOrFail = async (id) => {
  const category = await prisma.equipmentCashCategory.findUnique({ where: { id } });
  if (!category) throw httpError('Kategori kas tidak ditemukan', 404);
  return category;
};

/**
 * `orderCategory` memetakan kategori order purchase request ke kategori kas ini.
 * Order hanya pernah MENGELUARKAN uang, jadi pemetaan pada kategori cash_in
 * akan membuat cash-out PR mendarat di kategori berarah salah.
 */
const assertOrderCategoryDirection = (orderCategory, transactionType) => {
  if (orderCategory && transactionType !== 'cash_out') {
    throw httpError(
      'orderCategory hanya berlaku untuk kategori cash_out — purchase request tidak pernah menambah kas',
      400
    );
  }
};

const listCategories = async ({ transactionType, isActive, orderCategory }) => {
  const rows = await prisma.equipmentCashCategory.findMany({
    where: {
      ...(transactionType && { transactionType }),
      ...(isActive !== undefined && { isActive }),
      ...(orderCategory && { orderCategory }),
    },
    include: { _count: { select: { transactions: true } } },
    orderBy: [{ transactionType: 'asc' }, { categoryName: 'asc' }],
  });
  return rows.map(shapeCategory);
};

const createCategory = async (payload) => {
  const { categoryName, transactionType, orderCategory = null, description = null } = payload;
  assertOrderCategoryDirection(orderCategory, transactionType);

  const duplicate = await prisma.equipmentCashCategory.findUnique({
    where: { categoryName_transactionType: { categoryName, transactionType } },
  });
  if (duplicate) {
    throw httpError(`Kategori "${categoryName}" untuk ${transactionType} sudah ada`, 409);
  }

  if (orderCategory) {
    const taken = await prisma.equipmentCashCategory.findUnique({ where: { orderCategory } });
    if (taken) {
      throw httpError(
        `Kategori order "${orderCategory}" sudah dipetakan ke kategori kas "${taken.categoryName}". Satu kategori order hanya boleh menunjuk satu kategori kas.`,
        409
      );
    }
  }

  const created = await prisma.equipmentCashCategory.create({
    data: { categoryName, transactionType, orderCategory, description },
  });
  return shapeCategory(created);
};

const updateCategory = async (id, payload) => {
  const category = await findCategoryOrFail(id);

  // Arah kategori menentukan arti setiap baris yang sudah memakainya.
  // Membaliknya akan mengubah makna riwayat, bukan memperbaikinya.
  if (payload.transactionType && payload.transactionType !== category.transactionType) {
    throw httpError(
      'Arah kategori (cash_in/cash_out) tidak bisa diubah karena riwayat yang sudah memakainya akan berubah arti. Nonaktifkan kategori ini dan buat yang baru.',
      409
    );
  }

  const orderCategory =
    payload.orderCategory === undefined ? category.orderCategory : payload.orderCategory;
  assertOrderCategoryDirection(orderCategory, category.transactionType);

  if (orderCategory && orderCategory !== category.orderCategory) {
    const taken = await prisma.equipmentCashCategory.findUnique({ where: { orderCategory } });
    if (taken && taken.id !== id) {
      throw httpError(
        `Kategori order "${orderCategory}" sudah dipetakan ke kategori kas "${taken.categoryName}"`,
        409
      );
    }
  }

  if (payload.categoryName && payload.categoryName !== category.categoryName) {
    const duplicate = await prisma.equipmentCashCategory.findUnique({
      where: {
        categoryName_transactionType: {
          categoryName: payload.categoryName,
          transactionType: category.transactionType,
        },
      },
    });
    if (duplicate) throw httpError(`Kategori "${payload.categoryName}" sudah ada`, 409);
  }

  const updated = await prisma.equipmentCashCategory.update({
    where: { id },
    data: {
      ...(payload.categoryName !== undefined && { categoryName: payload.categoryName }),
      ...(payload.orderCategory !== undefined && { orderCategory: payload.orderCategory }),
      ...(payload.description !== undefined && { description: payload.description }),
      ...(payload.isActive !== undefined && { isActive: payload.isActive }),
    },
  });
  return shapeCategory(updated);
};

/**
 * Kategori yang sudah dipakai TIDAK dihapus — baris kas yang menunjuknya akan
 * kehilangan artinya, dan FK-nya RESTRICT. Yang benar adalah menonaktifkannya:
 * riwayat tetap terbaca, tapi tidak bisa dipakai lagi.
 */
const removeCategory = async (id) => {
  const category = await findCategoryOrFail(id);

  // Cash-out purchase request MENURUNKAN kategorinya dari pemetaan ini. Kalau
  // pemetaannya hilang, order berkategori itu tidak bisa dicairkan lagi — dan
  // penghapusan tidak bisa dibatalkan, beda dengan menonaktifkan. Untuk
  // memindahkan pemetaan: kosongkan di sini dulu (PUT orderCategory=null),
  // baru pasang di kategori tujuan.
  if (category.orderCategory) {
    throw httpError(
      `Kategori ini memegang pemetaan kategori order "${category.orderCategory}", yang dipakai sistem untuk membuat cash-out saat order dicairkan. Kosongkan pemetaannya dulu (PUT orderCategory=null) kalau kategori ini memang mau dihapus.`,
      409
    );
  }

  const used = await prisma.equipmentCashTransaction.count({ where: { categoryId: id } });
  if (used > 0) {
    throw httpError(
      `Kategori ini sudah dipakai ${used} transaksi, jadi tidak bisa dihapus. Nonaktifkan dengan PUT isActive=false supaya riwayatnya tetap terbaca.`,
      409
    );
  }
  await prisma.equipmentCashCategory.delete({ where: { id } });
  return { id };
};

// ============================================================
// TRANSAKSI — PEMBACAAN
// ============================================================

const findTransactionOrFail = async (id) => {
  const row = await prisma.equipmentCashTransaction.findUnique({
    where: { id },
    include: transactionInclude,
  });
  if (!row) throw httpError('Transaksi kas tidak ditemukan', 404);
  return row;
};

const listTransactions = async ({
  page = 1,
  limit = 20,
  transactionType,
  categoryId,
  sourceType,
  dateFrom,
  dateTo,
  includeVoided = false,
  search,
}) => {
  const dateRange = buildDateRange(dateFrom, dateTo);
  const where = {
    ...(transactionType && { transactionType }),
    ...(categoryId && { categoryId }),
    ...(sourceType && { sourceType }),
    ...(dateRange && { transactionDate: dateRange }),
    // Baris batal disembunyikan secara default. Query ringkasan yang lupa
    // memfilternya akan langsung salah — jadi defaultnya yang aman.
    ...(includeVoided ? {} : { isVoided: false }),
    ...(search && {
      OR: [
        { transactionCode: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    prisma.equipmentCashTransaction.findMany({
      where,
      include: transactionInclude,
      orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.equipmentCashTransaction.count({ where }),
  ]);

  return { data: rows.map(shapeTransaction), total, page, limit };
};

const getTransactionById = async (id) => shapeTransaction(await findTransactionOrFail(id));

// ============================================================
// TRANSAKSI — PENULISAN MANUAL
// ============================================================

const assertManualSource = (sourceType) => {
  if (SYSTEM_SOURCE_TYPES.includes(sourceType)) {
    throw httpError(
      `Transaksi bersumber "${sourceType}" dibuat sistem dari dokumennya, tidak boleh dicatat manual. Kalau dokumennya salah, yang dibatalkan dokumennya.`,
      403
    );
  }
};

const assertSourceDirection = (sourceType, transactionType) => {
  const allowed = ALLOWED_TYPES_BY_SOURCE[sourceType];
  if (!allowed.includes(transactionType)) {
    throw httpError(
      `Sumber "${sourceType}" hanya boleh ${allowed.join(' atau ')}, bukan ${transactionType}`,
      400
    );
  }
};

/**
 * Kategori bermapping (orderCategory terisi) SENGAJA tetap boleh dipakai baris
 * manual di sini. Skenario A6 pada dokumen desain menetapkan mekanik yang beli
 * baut tunai di lokasi masuk kategori "Perbaikan Alat" lewat manual_expense,
 * karena kategori kas menjawab pos biaya, bukan prosedur yang dilalui.
 *
 * Untuk MVP jalur itu belum dibuka, tapi pembatasannya dipasang di frontend
 * (menyaring dropdown kategori), bukan di sini. Alasannya kalau client nanti
 * memintanya, perubahan cukup di frontend tanpa menyentuh backend. Yang dijaga
 * di situ adalah kebijakan "belanja harus lewat pengajuan", bukan invarian
 * data, jadi aman tinggal di frontend. Lihat backlog Divisi Alat bagian G2.
 */
const resolveCategoryForWrite = async (categoryId, transactionType) => {
  const category = await findCategoryOrFail(categoryId);
  if (!category.isActive) {
    throw httpError(`Kategori "${category.categoryName}" sedang nonaktif`, 409);
  }
  if (category.transactionType !== transactionType) {
    throw httpError(
      `Kategori "${category.categoryName}" adalah kategori ${category.transactionType}, tidak bisa dipakai transaksi ${transactionType}`,
      400
    );
  }
  return category;
};

const createTransaction = async (payload, userId) => {
  const { transactionType, categoryId, amount, sourceType, description } = payload;

  assertManualSource(sourceType);
  assertSourceDirection(sourceType, transactionType);
  await resolveCategoryForWrite(categoryId, transactionType);
  const transactionDate = assertNotFuture(payload.transactionDate, 'Tanggal transaksi');

  const row = await prisma.$transaction(async (tx) => {
    const transactionCode = await nextDocumentNumber(tx, CASH_DOC_TYPE, { pad: CASH_DOC_PAD });
    return tx.equipmentCashTransaction.create({
      data: {
        transactionCode,
        transactionDate,
        transactionType,
        categoryId,
        amount,
        sourceType,
        description,
        createdBy: userId,
      },
      include: transactionInclude,
    });
  }, TRANSACTION_OPTIONS);

  return shapeTransaction(row);
};

const assertManuallyWritable = (row, action) => {
  if (SYSTEM_SOURCE_TYPES.includes(row.sourceType)) {
    throw httpError(
      `Transaksi ${row.transactionCode} lahir dari dokumen ${row.sourceType} dan tidak bisa ${action} di sini. Batalkan dokumennya, bukan catatan kasnya.`,
      409
    );
  }
};

/**
 * Baris manual boleh diperbaiki langsung — tidak ada rantai saldo yang rusak
 * karenanya. Yang TIDAK bisa diubah adalah arah uang dan sumbernya: keduanya
 * menentukan arti baris, dan menggantinya sama saja dengan membuat baris lain.
 */
const updateTransaction = async (id, payload) => {
  const existing = await findTransactionOrFail(id);
  assertManuallyWritable(existing, 'diubah');
  if (existing.isVoided) {
    throw httpError('Transaksi yang sudah dibatalkan tidak bisa diubah', 409);
  }

  if (payload.categoryId !== undefined && payload.categoryId !== existing.categoryId) {
    await resolveCategoryForWrite(payload.categoryId, existing.transactionType);
  }

  const transactionDate =
    payload.transactionDate !== undefined
      ? assertNotFuture(payload.transactionDate, 'Tanggal transaksi')
      : undefined;

  const updated = await prisma.equipmentCashTransaction.update({
    where: { id },
    data: {
      ...(transactionDate && { transactionDate }),
      ...(payload.categoryId !== undefined && { categoryId: payload.categoryId }),
      ...(payload.amount !== undefined && { amount: payload.amount }),
      ...(payload.description !== undefined && { description: payload.description }),
    },
    include: transactionInclude,
  });
  return shapeTransaction(updated);
};

/**
 * Pembatalan tidak menghapus barisnya, supaya kalau ada yang bertanya "kok
 * catatan ini hilang" jejaknya masih ada beserta alasannya. Baris batal tidak
 * ikut dihitung ke saldo.
 */
const voidTransaction = async (id, { voidReason }, userId) => {
  const existing = await findTransactionOrFail(id);
  assertManuallyWritable(existing, 'dibatalkan');
  if (existing.isVoided) {
    throw httpError(`Transaksi ${existing.transactionCode} sudah dibatalkan sebelumnya`, 409);
  }

  const updated = await prisma.equipmentCashTransaction.update({
    where: { id },
    data: { isVoided: true, voidReason, voidedBy: userId, voidedAt: new Date() },
    include: transactionInclude,
  });
  return shapeTransaction(updated);
};

// ============================================================
// BARIS YANG DIBUAT SISTEM
// ============================================================
// Menerima `tx` dari modul pemanggil supaya baris kas dan perubahan status
// dokumennya bergerak bersama — kalau salah satu gagal, tidak ada order approved
// tanpa cash-out, maupun cash-out tanpa ordernya.
//
// Pengembalian dana order yang sudah dicairkan SENGAJA tidak ada di sini:
// pembatalannya ditutup untuk MVP karena wewenangnya belum diputuskan. Sementara
// ini koreksinya dicatat manual lewat POST /transactions (sourceType
// `adjustment`, kategori "Koreksi Masuk"). Lihat backlog bagian G1.

const createSystemTransaction = async (tx, { category, transactionType, ...data }) => {
  const transactionCode = await nextDocumentNumber(tx, CASH_DOC_TYPE, { pad: CASH_DOC_PAD });
  return tx.equipmentCashTransaction.create({
    data: {
      transactionCode,
      transactionDate: new Date(),
      transactionType,
      categoryId: category.id,
      ...data,
    },
    include: transactionInclude,
  });
};

const assertCategoryUsable = (category, label) => {
  if (!category) {
    throw httpError(
      `Kategori kas untuk ${label} belum ada. Jalankan "npm run db:seed" di apps/api, atau buat kategorinya lebih dulu.`,
      409
    );
  }
  if (!category.isActive) {
    throw httpError(
      `Kategori kas "${category.categoryName}" sedang nonaktif, jadi transaksi ini tidak bisa dicatat. Aktifkan kembali kategorinya.`,
      409
    );
  }
  return category;
};

/**
 * Cash-out saat Finance menyetujui order. Kategori kas DITURUNKAN dari
 * orderCategory, tidak dipilih manual — jadi tidak bisa bertentangan dengan isi
 * ordernya. Nominalnya memakai totalApprovedAmount (nominal aktual yang
 * dicairkan), BUKAN totalEstimatedAmount.
 */
const recordPurchaseRequestCashOut = async (tx, purchaseRequest, userId) => {
  const category = assertCategoryUsable(
    await tx.equipmentCashCategory.findUnique({
      where: { orderCategory: purchaseRequest.orderCategory },
    }),
    `kategori order "${purchaseRequest.orderCategory}"`
  );

  return createSystemTransaction(tx, {
    category,
    transactionType: 'cash_out',
    amount: purchaseRequest.totalApprovedAmount,
    sourceType: 'equipment_purchase_request',
    sourceId: purchaseRequest.id,
    description: `Pencairan order ${purchaseRequest.requestCode} (${purchaseRequest.orderCategory})`,
    createdBy: userId,
  });
};

module.exports = {
  getBalance, getSummary,
  listCategories, createCategory, updateCategory, removeCategory,
  listTransactions, getTransactionById, createTransaction, updateTransaction, voidTransaction,
  recordPurchaseRequestCashOut,
  shapeTransaction,
};
