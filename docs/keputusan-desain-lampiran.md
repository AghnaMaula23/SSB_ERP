# Keputusan Desain — Lampiran (file) lintas modul

Disepakati 15–16 Oktober 2026. **Fondasi dibangun 16 Oktober 2026** bersama RM-4
(migrasi `20261016090000_add_files_and_material_deliveries`), surat jalan sebagai
pemakai pertama. Kode: `src/modules/file/` (storage, jenis file, service, endpoint
unduh) + `src/middleware/upload.js`.

## Siapa saja pemakainya

ERD menyimpan file di tujuh tempat. Fondasi ini dirancang sekali untuk semuanya:

| Pemakai | Modul | Banyaknya |
|---|---|---|
| Surat jalan | Request Material RM-4 | tepat 1 per delivery |
| Bukti penerimaan | Request Material RM-5 | banyak per receipt |
| Berkas project | Project (`project_file_folders`, `project_files`) | banyak per folder |
| Nota pengeluaran lapangan | Finance Field | banyak |
| Bukti bayar payroll | Payroll | banyak |
| Bukti bayar klien | Income | 1 |
| Lampiran jurnal | Finance Accounting | banyak |

## L1. Satu tabel `files` + penghubung ber-FK per modul

```
files
  id, storage_key (unik), original_name, mime_type, size_bytes, sha256,
  status: active | superseded | trashed,
  uploaded_by, uploaded_at, trashed_by, trashed_at
```

Modul menunjuk file lewat FK asli: kolom (`material_deliveries.delivery_note_file_id`)
kalau tepat satu, tabel penghubung (`material_receipt_attachments(receipt_id, file_id)`)
kalau banyak.

**Kenapa bukan satu tabel generic `attachments(source_type, source_id)`:** database
tidak bisa menjaga FK polymorphic, jadi lampiran bisa menunjuk dokumen yang tidak
ada. **Kenapa bukan tabel file penuh per modul (seperti ERD):** penyimpanan,
validasi, unduhan, dan pembersihan akan ditulis ulang tujuh kali. Gabungannya:
logika file satu tempat, integritas tetap dijaga database.

## L2. Penyimpanan

- Supabase Storage lewat protokol **S3 standar** (`@aws-sdk/client-s3`), bukan SDK
  Supabase. Pindah ke AWS S3 / R2 / MinIO = ganti `.env`.
- Database menyimpan **kunci**, bukan URL: `delivery-notes/2026/10/<uuid>.pdf`.
  Nama asli tidak pernah masuk path (aman dari path traversal & nama kembar).
- Semua akses lewat **satu** `src/modules/file/storage.service.js`.
- Bucket **private**. Konfigurasi `.env`: `STORAGE_ENDPOINT`, `STORAGE_REGION`,
  `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET`. Kalau
  kosong, hanya endpoint unggah yang gagal dengan pesan jelas — server tetap jalan.

## L3. Jenis & ukuran — dua profil

| Profil | Dipakai | Jenis | Maks |
|---|---|---|---|
| `evidence` | surat jalan, bukti receipt, nota, bukti bayar | PDF, JPG, PNG, WebP | 10 MB |
| `project` | berkas project | PDF, JPG, PNG, WebP, DWG, XLSX, DOCX | 50 MB |

- Jenis diperiksa dari **isi file** (byte awal), bukan ekstensi atau header
  `Content-Type` dari klien. Fungsi kecil sendiri, tanpa dependency.
- **HEIC ditolak** dengan pesan "atur kamera ke Most Compatible" — Chrome di
  Windows tidak bisa menampilkannya.
- Selalu ditolak: SVG/HTML (bisa membawa skrip), Office ber-makro, executable, arsip.

## L4. Unggah lewat backend, satu request

`multer` (memori) di endpoint bisnisnya — form + file dalam satu multipart. Bukan
"unggah dulu, rujuk belakangan": form yang ditinggalkan di tengah melahirkan file
yatim. Urutan: file ke storage → transaksi DB → kalau DB gagal, file dihapus di `catch`.

Catatan deploy: di serverless (body ~4,5 MB) jalur ini harus diganti unggah
langsung dari browser. Perubahannya terbatas di endpoint unggah + storage.service;
skema tidak berubah. Keputusan VPS/serverless ditunda ke akhir project.

## L5. Unduh

`GET /api/files/:id/url` — backend mencari pemilik file lewat daftar `OWNERS` di
`file.service.js` (satu baris per pemakai: prefix kunci, permission, cara mencari
dokumennya), memeriksa **permission read modul sumbernya** (surat jalan →
`material-request:read`), lalu memberi
**signed URL berlaku 5 menit**. Siapa pun yang memegang link selama masa itu bisa
membukanya tanpa login, jadi dibuat pendek; kalau kedaluwarsa, klik lagi.
PDF & gambar dibuka inline, selebihnya diunduh.

## L6. Siklus hidup

| Kasus | Aturan |
|---|---|
| Lampiran bukti, dokumennya belum final | Boleh **diganti**; file lama `superseded`, tidak dihapus |
| Lampiran bukti, dokumennya final | Terkunci. Alasan: dasar pembayaran/tagihan & sengketa, dan dokumen pendukung pembukuan wajib disimpan 10 tahun (UU KUP Pasal 28) |
| Dokumen dibatalkan | Lampirannya tetap — pembatalan juga riwayat |
| Berkas project | Boleh ke sampah (`trashed`); dihapus permanen **30 hari setelah masuk sampah** (dihitung per file, bukan "sebulan sekali") |
| File yatim (upload sukses, DB gagal) | Dihapus di `catch`; sisanya disapu job harian: objek storage > 24 jam tanpa baris `files` |

Job pembersih ditulis sebagai fungsi biasa; penjadwalnya (node-cron di VPS / cron
platform di serverless) dipasang saat deploy diputuskan. **Status saat ini:**
`sweepOrphans` sudah ada (hanya menyapu prefix yang terdaftar di `OWNERS`);
pembersih sampah 30 hari menyusul bersama berkas project — saat ini belum ada
pemakai yang membuang file ke sampah.

## L7. Berkas project menampilkan lampiran modul

Halaman Files (FE `admin/files`) menampilkan lampiran modul sebagai **folder sistem
baca-saja** per project — mis. "Surat Jalan" berisi surat jalan dari delivery
project itu. Isinya dibaca dari tabel delivery, **tidak disalin** (satu fakta di
satu tempat). Folder buatan user: satu tingkat, sesuai FE.

## Urutan pembangunan

1. Fondasi: tabel `files`, storage.service, validasi jenis, `GET /files/:id/url`.
2. RM-4 — pemakai pertama (lihat `keputusan-desain-request-material.md`).
3. API berkas project + folder sistem, menggantikan localStorage di halaman Files.
