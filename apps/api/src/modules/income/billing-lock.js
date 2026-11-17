const { httpError } = require('../../utils/error.js');
const { toDateOnly } = require('../../utils/shape.js');

// ============================================================
// KUNCI BARIS YANG SUDAH DITAGIH (docs/claude_knowledge/plan-divisi-finance.md 5e).
//
// Fakta yang menjadi dasar tagihan AKTIF (submitted/verified) tidak boleh berubah:
// angka yang sudah dikirim ke klien harus tetap bisa dijelaskan. Dipanggil jalur tulis
// modul lain DI DALAM transaksinya — pola assertLogUnclaimed (klaim upah).
// Modul ini sengaja tanpa dependensi ke income-record.service supaya tidak melingkar.
// ============================================================

const ACTIVE_STATUSES = ['submitted', 'verified'];
/** Klaim alat yang mengikat log: menunggu Finance atau sudah disetujui (final, F23). */
const ACTIVE_CLAIM_STATUSES = ['submitted', 'approved'];

/**
 * Void jam kerja: kunci barisnya lalu cek item tagihan aktif dan klaim alat. Pembuat tagihan mengunci
 * baris yang sama (FOR UPDATE), jadi keduanya tidak bisa saling melewati.
 */
const assertWorkhourLogUnbilled = async (tx, logId) => {
  await tx.$queryRaw`SELECT id FROM equipment_workhour_logs WHERE id = ${logId} FOR UPDATE`;
  const item = await tx.incomeRecordItem.findFirst({
    where: { equipmentWorkhourLogId: logId, incomeRecord: { status: { in: ACTIVE_STATUSES } } },
    select: { incomeRecord: { select: { incomeCode: true, status: true } } },
  });
  if (item) {
    throw httpError(`Jam kerja ini sudah ditagihkan di ${item.incomeRecord.incomeCode} (${item.incomeRecord.status}) dan terkunci. Batalkan/tolak tagihannya dulu.`, 409);
  }
  // Juga terkunci selama ada di klaim pendapatan alat aktif/approved (G4) — termasuk jam
  // tahapan konstruksi yang tidak pernah ditagih per jam
  const claimed = await tx.equipmentIncomeClaimItem.findFirst({
    where: { equipmentWorkhourLogId: logId, claim: { status: { in: ACTIVE_CLAIM_STATUSES } } },
    select: { claim: { select: { claimCode: true, status: true } } },
  });
  if (claimed) {
    throw httpError(`Jam kerja ini sudah diklaim Divisi Alat di ${claimed.claim.claimCode} (${claimed.claim.status}) dan terkunci.`, 409);
  }
};

/** Batal penerimaan supply — sama dengan jam kerja. */
const assertReceiptUnbilled = async (tx, receiptId) => {
  await tx.$queryRaw`SELECT id FROM material_receipts WHERE id = ${receiptId} FOR UPDATE`;
  const item = await tx.incomeRecordItem.findFirst({
    where: { materialReceiptId: receiptId, incomeRecord: { status: { in: ACTIVE_STATUSES } } },
    select: { incomeRecord: { select: { incomeCode: true, status: true } } },
  });
  if (item) {
    throw httpError(`Penerimaan ini sudah ditagihkan di ${item.incomeRecord.incomeCode} (${item.incomeRecord.status}) dan terkunci. Batalkan/tolak tagihannya dulu.`, 409);
  }
};

/**
 * Cabut validasi progress: volume kumulatif s.d. periode tagihan aktif terakhir sudah
 * ditagih (F11), jadi log bertanggal ≤ periodEnd-nya tidak boleh berubah. Pemanggil sudah
 * memegang kunci tahapan (assertContextOpen, FOR SHARE) yang bentrok dengan kunci
 * FOR UPDATE pembuat tagihan konstruksi.
 */
const assertProgressUnbilled = async (tx, subProjectId, progressDate) => {
  const record = await tx.incomeRecord.findFirst({
    where: { subProjectId, status: { in: ACTIVE_STATUSES }, periodEnd: { gte: progressDate } },
    orderBy: { periodEnd: 'desc' },
    select: { incomeCode: true, status: true, periodEnd: true },
  });
  if (record) {
    throw httpError(`Progress tanggal ${toDateOnly(progressDate)} sudah masuk tagihan ${record.incomeCode} (${record.status}, s.d. ${toDateOnly(record.periodEnd)}). Validasinya tidak bisa dicabut selama tagihan itu aktif.`, 409);
  }
};

/**
 * Void pembayaran klien (F20, F23): tagihan yang lunasnya menjadi dasar klaim alat aktif/
 * approved tidak boleh kembali tidak lunas. Rental: klaim merujuk item tagihan ini.
 * Konstruksi: klaim atas jam tahapan bertanggal di dalam periode tagihan ini (setelah
 * tagihan aktif sebelumnya). Pemanggil sudah mengunci baris income record FOR UPDATE;
 * pembuat klaim mengunci tagihan lunas yang dipakainya FOR SHARE.
 */
const assertRecordNotClaimed = async (tx, record) => {
  let where;
  if (record.externalRentalProjectId) {
    where = { incomeRecordItem: { incomeRecordId: record.id } };
  } else if (record.subProjectId) {
    const previous = await tx.incomeRecord.aggregate({
      where: { subProjectId: record.subProjectId, status: { in: ACTIVE_STATUSES }, periodEnd: { lt: record.periodEnd } },
      _max: { periodEnd: true },
    });
    where = { equipmentWorkhourLog: {
      subProjectEquipmentAllocation: { subProjectId: record.subProjectId },
      workDate: { lte: record.periodEnd, ...(previous._max.periodEnd && { gt: previous._max.periodEnd }) },
    } };
  } else {
    return; // supply tidak pernah menjadi dasar klaim alat
  }
  const claimed = await tx.equipmentIncomeClaimItem.findFirst({
    where: { ...where, claim: { status: { in: ACTIVE_CLAIM_STATUSES } } },
    select: { claim: { select: { claimCode: true, status: true } } },
  });
  if (claimed) {
    throw httpError(`Pelunasan tagihan ${record.incomeCode} sudah menjadi dasar klaim alat ${claimed.claim.claimCode} (${claimed.claim.status}), jadi pembayarannya tidak bisa dibatalkan.`, 409);
  }
};

module.exports = {
  ACTIVE_STATUSES, ACTIVE_CLAIM_STATUSES,
  assertWorkhourLogUnbilled, assertReceiptUnbilled, assertProgressUnbilled, assertRecordNotClaimed,
};
