const crypto = require('crypto');
const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const storage = require('./storage.service.js');
const { isInline } = require('./file-types.js');

// ============================================================
// LAMPIRAN — fondasi file lintas modul (docs/keputusan-desain-lampiran.md).
// Modul bisnis tidak menyentuh storage langsung: unggah lewat
// `withUploadedFile`, unduh lewat GET /api/files/:id/url.
// ============================================================

const SIGNED_URL_SECONDS = 5 * 60; // L5: link bisa diteruskan, jadi dibuat pendek
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Siapa pemilik sebuah file dan permission apa yang dibutuhkan untuk
 * membacanya — mengikuti permission READ modul sumbernya (L5). Pemakai baru
 * (receipt RM-5, berkas project, ...) menambah satu baris di sini.
 * `prefix` = folder kunci storage milik pemakai itu; penyapu file yatim hanya
 * menyentuh prefix yang terdaftar di sini.
 */
const OWNERS = [
  {
    prefix: 'delivery-notes',
    permission: 'material-request:read',
    find: (fileId) => prisma.materialDelivery.findUnique({ where: { deliveryNoteFileId: fileId }, select: { id: true } }),
  },
];

const buildKey = (prefix, ext) => {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix}/${now.getUTCFullYear()}/${month}/${crypto.randomUUID()}.${ext}`;
};

/**
 * Unggah file lalu jalankan `fn(tx, fileRow)` di SATU transaksi bersama baris
 * `files`-nya (L4). File & database tidak bisa satu transaksi, jadi kalau
 * transaksi gagal, objek storage dihapus di sini. Kalau server mati tepat di
 * antaranya, sisanya disapu `sweepOrphans`.
 *
 * `upload` = hasil middleware upload: { buffer, originalName, type }.
 */
const withUploadedFile = async (upload, { prefix, userId }, fn) => {
  if (!OWNERS.some((o) => o.prefix === prefix)) throw new Error(`Prefix lampiran "${prefix}" belum terdaftar di OWNERS`);
  const key = buildKey(prefix, upload.type.ext);
  await storage.put(key, upload.buffer, upload.type.mime);
  try {
    return await prisma.$transaction(async (tx) => {
      const file = await tx.file.create({
        data: {
          storageKey: key,
          originalName: upload.originalName,
          mimeType: upload.type.mime,
          sizeBytes: upload.buffer.length,
          sha256: crypto.createHash('sha256').update(upload.buffer).digest('hex'),
          uploadedBy: userId,
        },
      });
      return fn(tx, file);
    });
  } catch (err) {
    await storage.remove(key).catch((e) => console.error(`[FILE] gagal menghapus file yatim ${key}: ${e.message}`));
    throw err;
  }
};

/** File lama dipertahankan sebagai riwayat, ditandai penggantinya (L6). */
const markSuperseded = (tx, oldFileId, newFileId) =>
  tx.file.update({ where: { id: oldFileId }, data: { status: 'superseded', replacedById: newFileId } });

/** Dari file yang sudah diganti, telusuri sampai file yang masih dirujuk dokumennya. */
const resolveOwner = async (file) => {
  let current = file;
  for (let hop = 0; current.status === 'superseded' && hop < 100; hop++) {
    current = await prisma.file.findUnique({ where: { id: current.replacedById } });
  }
  for (const owner of OWNERS) {
    if (current.storageKey.startsWith(`${owner.prefix}/`) && await owner.find(current.id)) return owner;
  }
  return null;
};

const shapeFile = (file) => ({
  id: file.id,
  originalName: file.originalName,
  mimeType: file.mimeType,
  sizeBytes: file.sizeBytes,
  status: file.status,
  uploadedAt: file.uploadedAt,
});

const getDownloadUrl = async (id, user) => {
  const file = await prisma.file.findUnique({ where: { id } });
  // File tanpa pemilik (mis. yatim) diperlakukan sama dengan tidak ada
  const owner = file && file.status !== 'trashed' ? await resolveOwner(file) : null;
  if (!owner) throw httpError('File tidak ditemukan', 404);
  if (!user.permissions.includes(owner.permission)) throw httpError('Tidak memiliki akses ke file ini', 403);

  const url = await storage.signedUrl(file.storageKey, {
    fileName: file.originalName, inline: isInline(file.mimeType), expiresIn: SIGNED_URL_SECONDS,
  });
  return { ...shapeFile(file), url, expiresInSeconds: SIGNED_URL_SECONDS };
};

/**
 * Hapus objek storage berumur > 24 jam yang tidak punya baris `files` (L6) —
 * sisa unggahan yang transaksinya gagal ketika server mati sebelum `catch`.
 * Fungsi biasa: penjadwalnya dipasang saat keputusan deploy diambil.
 */
const sweepOrphans = async () => {
  const cutoff = Date.now() - ORPHAN_AGE_MS;
  let removed = 0;
  for (const { prefix } of OWNERS) {
    const objects = (await storage.list(`${prefix}/`)).filter((o) => o.lastModified.getTime() < cutoff);
    if (!objects.length) continue;
    const known = new Set((await prisma.file.findMany({
      where: { storageKey: { in: objects.map((o) => o.key) } }, select: { storageKey: true },
    })).map((f) => f.storageKey));
    for (const o of objects.filter((obj) => !known.has(obj.key))) {
      await storage.remove(o.key);
      removed++;
    }
  }
  return { removed };
};

module.exports = { withUploadedFile, markSuperseded, getDownloadUrl, sweepOrphans, shapeFile };
