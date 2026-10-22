/**
 * Nomor dokumen berurutan, mis. MTN-000001, PRQ-000042, KAS-000007.
 *
 * Increment-nya atomik di database (UPDATE ... SET last_sequence + 1), BUKAN
 * `MAX(...)+1` — dua input bersamaan dengan MAX akan menghasilkan nomor kembar.
 * Selalu dipanggil dengan `tx` dari transaksi pemanggilnya supaya nomor tidak
 * terpakai kalau dokumennya sendiri gagal dibuat.
 *
 * Period 'ALL' = deret tunggal tanpa reset periodik.
 */
const nextDocumentNumber = async (tx, docType, { period = 'ALL', pad = 6 } = {}) => {
  const sequence = await tx.documentSequence.upsert({
    where: { docType_period: { docType, period } },
    update: { lastSequence: { increment: 1 } },
    create: { docType, period, lastSequence: 1 },
  });
  return `${docType}-${String(sequence.lastSequence).padStart(pad, '0')}`;
};

module.exports = { nextDocumentNumber };
