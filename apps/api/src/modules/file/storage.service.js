const {
  S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { httpError } = require('../../utils/error.js');

// ============================================================
// SATU-SATUNYA tempat yang menyentuh penyimpanan file (L2,
// docs/keputusan-desain-lampiran.md). Protokol S3 standar — sekarang Supabase
// Storage; pindah ke AWS S3 / R2 / MinIO cukup mengganti .env.
// Modul lain menyimpan KUNCI file, tidak pernah URL penyedia.
// ============================================================

const env = (name) => process.env[name]?.trim() || null;

let client = null;
let bucket = null;

/** Dibuat saat pertama dipakai: server tetap jalan walau .env storage kosong. */
const getClient = () => {
  if (client) return client;
  const endpoint = env('STORAGE_ENDPOINT');
  const accessKeyId = env('STORAGE_ACCESS_KEY_ID');
  const secretAccessKey = env('STORAGE_SECRET_ACCESS_KEY');
  bucket = env('STORAGE_BUCKET');
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw httpError('Penyimpanan file belum dikonfigurasi (STORAGE_* di .env)', 503);
  }
  client = new S3Client({
    endpoint,
    region: env('STORAGE_REGION') || 'ap-southeast-1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true, // wajib untuk Supabase / MinIO
  });
  return client;
};

const put = async (key, buffer, contentType) => {
  const s3 = getClient();
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }));
};

const remove = async (key) => {
  const s3 = getClient();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
};

/**
 * Link sementara untuk membuka/mengunduh file dari bucket private (L5).
 * `inline` untuk PDF/gambar supaya terbuka di browser, selebihnya diunduh.
 */
const signedUrl = async (key, { fileName, inline, expiresIn }) => {
  const s3 = getClient();
  // Nama file dari pengguna — kutip & karakter non-ASCII disandikan (RFC 5987)
  const disposition = `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: disposition }), { expiresIn });
};

/** Semua objek di bawah prefix, untuk penyapu file yatim. */
const list = async (prefix = '') => {
  const s3 = getClient();
  const objects = [];
  let ContinuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }));
    objects.push(...(page.Contents ?? []).map((o) => ({ key: o.Key, lastModified: o.LastModified })));
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects;
};

module.exports = { put, remove, signedUrl, list };
