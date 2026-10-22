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
- **Batas waktu** (17 Okt 2026, hasil security review): koneksi 3 dtk; tiap unggah/hapus
  punya batas TOTAL 10 dtk + 1 dtk per 512 KB (arsip ±11 dtk, berkas 50 MB ±110 dtk) lewat
  `abortSignal` — juga menghentikan percobaan ulang SDK. Bukan batas menganggur: terbukti
  memutus unggahan sah saat storage memproses body yang sudah terkirim. Storage gagal /
  menggantung / tak terjangkau → **503** dari `storage.put` (satu tempat), detail hanya di log.
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
`sweepOrphans` dan `purgeTrash` (sampah > 30 hari) sudah ada, dijalankan bersama oleh
`npm run files:cleanup` — tinggal dipasang di cron saat deploy diputuskan.

## L7. Berkas project menampilkan lampiran modul

Halaman Files (FE `admin/files`) menampilkan lampiran modul sebagai **folder sistem
baca-saja** per project — mis. "Surat Jalan" berisi surat jalan dari delivery
project itu. Isinya dibaca dari tabel delivery, **tidak disalin** (satu fakta di
satu tempat). Folder buatan user: satu tingkat, sesuai FE.

## Urutan pembangunan

1. Fondasi: tabel `files`, storage.service, validasi jenis, `GET /files/:id/url`.
2. RM-4 — pemakai pertama (lihat `keputusan-desain-request-material.md`).
3. Berkas project — kontrak disepakati 17 Okt 2026 (L8 di bawah), dibangun dalam tiga
   commit: (a) berkas project + folder sistem + sampah (DIBANGUN 17 Okt, migrasi
   `20261017150000_project_files`), (b) kunci tahapan/project
   selesai (DIBANGUN 17 Okt, tanpa migrasi), (c) arsip penutupan XLSX (DIBANGUN 17 Okt,
   migrasi `20261017180000_project_closing_archives`). Prasyarat rental (sesi & operator) sudah masuk `bf16510`.

## L8. Berkas Project (kontrak 17 Oktober 2026)

Kontrak endpoint: Swagger tag *Project Files*. Menggantikan `fileStore.js`
(localStorage + IndexedDB) di halaman FE `admin/files`.

### Susunan: Project → (Tahapan) → Folder → Berkas

| Jenis project | Tingkat project | Per tahapan |
|---|---|---|
| Konstruksi | Arsip Penutupan* (rekap tahapan), folder user | Surat Jalan, Bukti Penerimaan, Arsip Penutupan* (progress, alat, material), folder user |
| Supply | Surat Jalan, Bukti Penerimaan, Arsip Penutupan* (surat jalan), folder user | — |
| Rental | Arsip Penutupan* (timesheet per unit), folder user | — |

\* Muncul setelah tahapan/project itu ditutup.

- **Halaman atas = daftar project**, bukan grid folder. Folder sistem L7 per project butuh
  tingkat project; FE lama menyamakan folder dengan project (nama default folder = nama
  project) dan kategori dengan subfolder.
- **Folder tahapan & folder sistem tidak disimpan** — dibaca dari `sub_projects` dan tabel
  sumber, jadi muncul sendiri sejak tahapan/project dibuat dan tidak bisa basi.
- Surat jalan & bukti penerimaan sudah tercatat per tahapan (`material_requests.sub_project_id`),
  jadi di konstruksi folder sistem hidup di tahapan.
- Folder user satu tingkat, menempel ke project atau ke satu tahapan. Unggah tidak dikunci
  status project: dokumen (BAST, dsb.) justru datang setelah selesai.

### Skema (commit a)

```
project_file_folders
  id, construction_project_id?, external_rental_project_id?, external_supply_project_id?,
  sub_project_id?, name varchar(120), created_by, created_at, updated_at
  CHECK num_nonnulls(3 FK project) = 1                 -- tanpa owner_type: FK mana yang terisi sudah menjawabnya
  CHECK sub_project_id IS NULL OR construction_project_id IS NOT NULL
  FK (sub_project_id, construction_project_id) -> sub_projects(id, construction_project_id)
                                                       -- tahapan pasti milik project yang sama
  UNIQUE per tempat, lower(name)                       -- index ekspresi, ditulis di SQL
project_files
  id, folder_id -> project_file_folders, file_id -> files (unik), name varchar(150),
  description text, created_at, updated_at
```

- ERD `owner_type + owner_id` (tanpa FK) ditolak karena alasan L1. Kolom ERD `file_url`,
  `file_size`, `status`, `uploaded_by` sudah hidup di `files` — tidak disalin.
- `name` = nama tampilan yang bisa diubah; `files.original_name` tetap jadi nama unduhan.
- Kedua tabel `ENABLE ROW LEVEL SECURITY` (tanpa FORCE).
- `OWNERS` di `file.service.js` + satu baris: prefix `project-files`, permission `project-file:read`.

### Yang dibuang dari FE

| FE | Keputusan | Alasan |
|---|---|---|
| Kategori (9 nilai) | dibuang | Setelah susunan di atas, kategori = folder. "Surat Jalan" bahkan bentrok dengan folder sistem |
| Tag | dibuang | Pencarian nama + deskripsi menutup kebutuhannya; tag butuh tabel sendiri |
| Tahun folder (isian manual) | turunan tanggal mulai project | Satu fakta |
| Arsip folder manual | turunan status project | Satu fakta; unggah tidak dikunci |
| Hapus "tidak bisa dibatalkan" | ke sampah 30 hari + pulihkan | L6 |
| `.xls`, `.doc` di daftar accept | ditolak | L3 (WebP justru diterima) |

### Siklus berkas

- **Rename, deskripsi, pindah folder** (dalam project yang sama): ya. **Ganti isi / versi:
  tidak** — revisi diunggah sebagai berkas baru; `superseded` khusus lampiran bukti.
- **Hapus = sampah** (`files.status = trashed`). Pulihkan kembali ke folder asal. Folder
  hanya bisa dihapus kalau kosong TERMASUK sampah, sehingga folder asal selalu ada.
- **Pembersih**: `purgeTrash()` di `file.service.js` — berkas yang masuk sampah > 30 hari:
  hapus baris `project_files` + `files` dulu, baru objek storage. Kalau storage gagal,
  objeknya jadi yatim dan tersapu `sweepOrphans` 24 jam kemudian; tidak ada jalur yang
  meninggalkan baris DB tanpa file. Dijalankan `npm run files:cleanup` (sweepOrphans +
  purgeTrash) dari cron apa pun; penjadwal dalam proses tetap menunggu keputusan deploy.

### Permission

`project-file:read|create|update|delete` — **admin** keempatnya, **super_admin** read
(otomatis lewat filter seeder), role lain belum (menu Files hanya di AdminLayout; membuka
untuk Lapangan cukup satu baris seeder). Folder sistem lampiran modul tampil hanya kalau
user memegang permission read modul sumbernya — aturan yang sama dengan `OWNERS`.

### Tahapan / project selesai = terkunci (commit b)

Arsip penutupan hanya benar kalau data tahapan tidak berubah lagi setelah ditutup — dan
ternyata kode belum menegakkannya (17 Okt): membuat data baru sudah ditolak, tapi
mengubah/memvalidasi progress, mutasi stok, penerimaan, delivery, dan approval request
material masih lolos.

- **Syarat menutup** (`completed` DAN `cancelled`, keduanya final): tidak ada progress
  `submitted`, request material `submitted`/`waiting_finance_approval`, request alat
  `submitted`/`equipment_review`, delivery aktif tanpa penerimaan aktif, alokasi
  `assigned` (sudah ada). Project konstruksi sudah mensyaratkan semua tahapannya tertutup.
  Supply: request material & delivery. Rental: request alat.
- **Sesudahnya semua jalur tulis menolak 409**: ubah/validasi progress, catat/batal mutasi
  stok, catat/batal penerimaan, ganti surat jalan/batal delivery, validasi/biaya/approve
  request material. Jam kerja & operator rental sudah terkunci sejak `bf16510`.
- **Konkurensi** (`src/modules/project/context-lock.js`): setiap jalur tulis mengunci baris
  tahapan/kontrak `FOR SHARE` lalu mengecek status; penutupan mengunci baris yang sama
  `FOR UPDATE` lalu menghitung urusan terbuka. Tulis & tutup bersamaan tidak bisa
  sama-sama lolos — diuji 6× catat progress vs tutup tahapan bersamaan.
- Tolak & batal request (keduanya mengurangi urusan terbuka) sengaja tidak dikunci.
- **Perubahan perilaku:** membatalkan project konstruksi kini juga mensyaratkan semua
  tahapannya sudah ditutup (dulu hanya `completed`), dan membatalkan tahapan memakai
  syarat yang sama dengan menyelesaikannya.

### Arsip Penutupan XLSX (commit c) — revisi 17 Okt 2026

**Keputusan:** file XLSX dibuat **sekali, saat tahapan/project ditutup** (`completed`
maupun `cancelled`), dan disimpan di folder sistem "Arsip Penutupan". Sebelum ditutup,
data diunduh dari halaman sumbernya masing-masing (CSV di FE — lihat backlog-fe E24).

| Ditutup | Arsip |
|---|---|
| Tahapan | `stage-progress`, `stage-equipment`, `stage-material`, `stage-labor` (sejak 19 Okt 2026, modul Pekerja) |
| Project konstruksi | `project-summary` (rekap tahapan) |
| Supply | `supply-deliveries` |
| Rental | `rental-timesheet`, satu file per pool item yang pernah terikat unit |

**Kenapa disimpan, bukan dibuat setiap diunduh** (rancangan awal kontrak ini, dibalik
atas usul pemilik project):
- Data terkunci saat ditutup dan `completed`/`cancelled` final → file dibuat tepat sekali
  dan tidak bisa basi. Keberatan "banyak versi" tidak berlaku.
- **Arsip dibekukan terhadap perubahan KODE**, bukan hanya data. Ekspor yang dibuat saat
  diunduh bergantung pada kode hari itu: kolom yang dibuang atau logika progress yang
  diubah tahun depan ikut mengubah — atau merusak — ekspor project lama. Untuk dokumen
  yang dipakai saat sengketa/audit (retensi 10 tahun, L6), yang benar adalah salinan
  saat serah terima.
- Modul Pekerja yang dibangun belakangan tidak merugikan: tahapan yang ditutup sebelum
  modul itu ada memang tidak punya data pekerja.
- Berkas jadi berkas biasa: diunduh lewat `GET /files/:id/url` seperti yang lain. Tidak
  perlu endpoint ekspor, fetch+blob, atau penanda SEMENTARA/FINAL.

**Cara membuatnya — di dalam penutupan, bukan sesudahnya** (pola L4):
kunci baris tahapan/project → susun XLSX → unggah ke storage → SATU transaksi: status
+ baris arsip → transaksi gagal, file dihapus. Tidak ada keadaan "sudah ditutup tapi
arsipnya hilang", jadi tidak perlu status pending atau job pengulang. Konsekuensi yang
diterima: storage mati = tahapan/project tidak bisa ditutup (503, coba lagi); request
penutupan lebih lambat ±1–3 detik. Menutup itu jarang.

**Skema:**

```
project_closing_archives
  id, construction_project_id?, external_rental_project_id?, external_supply_project_id?,
  sub_project_id?, equipment_pool_item_id?, archive_key varchar(40), file_id -> files (unik),
  created_at
  CHECK num_nonnulls(3 FK project) = 1
  FK (sub_project_id, construction_project_id) -> sub_projects   -- sama dengan folder
  UNIQUE (cakupan, archive_key, equipment_pool_item_id)          -- sekali per cakupan
```

Terpisah dari `project_files` karena sifatnya beda: arsip tidak bisa di-rename, dipindah,
atau dibuang ke sampah (setara lampiran bukti final, L6). Siapa & kapan = `files.uploaded_by/at`
(yang menutup). RLS aktif. `OWNERS` + prefix `closing-archives`, permission `project-file:read`.
Isi tiap arsip: tabel di Swagger (`GET .../system-folders/closing-archive`). Baris kepala
sheet pertama: project, tahapan/unit, "Diarsipkan saat penutupan <waktu> oleh <user>",
status akhir. Log/dokumen yang dibatalkan tidak ikut.

Dependency baru: `exceljs`. CSV tidak dipakai untuk arsip — Excel berlocale Indonesia
salah membaca pemisah koma.

**Dibangun 17 Okt 2026** (`src/modules/project-file/closing-archive.service.js`):
- Dipasang di `changeStatus` tahapan & project, di dalam transaksi yang sama dengan
  `assertStageClosable`/`assertProjectClosable` — data dibaca lewat `tx` setelah baris
  dikunci FOR UPDATE. File disimpan lewat `generatedFileStore` (`file.service.js`):
  unggah di dalam transaksi; gagal → `discard()` menghapus objeknya.
- Storage mati → 503, status tidak berubah, tidak ada baris/objek tertinggal (diuji
  dengan mematikan storage). Dua penutupan bersamaan → satu 200, satu 409, arsip tidak dobel.
- Rental: satu timesheet per pool item yang pernah terikat unit. Log lama tanpa
  `work_session` masuk kolom "Tanpa sesi" — tidak ditebak.
- Jenis arsip baru (mis. `stage-labor`) = baris baru di `STAGE_ARCHIVES` + migrasi yang
  memperluas `project_closing_archives_scope_check`.
- Catatan dependency: `exceljs@4.4.0` membawa `uuid` versi lama (advisory moderate: cek
  batas buffer pada v3/v5/v6 saat argumen buffer diberikan). exceljs hanya memakainya
  untuk ID internal tanpa input kita — dampak praktis nihil; dipantau sampai exceljs
  memperbarui dependency-nya.
- Waktu penutupan di replika (storage lokal): 0,02–0,08 detik. Di Supabase Storage
  bertambah satu unggahan jaringan per file (tahapan = 3 file).

**Belum masuk:** sheet Pekerja (bersama modul Pekerja), income/outcome/laba per tahapan
(setelah GL; "laba per tahapan" butuh aturan PM membagi biaya alat, gaji staf & overhead),
nomor timesheet rental (bersama Income rental).
