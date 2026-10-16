# Keputusan Desain — Approval Center

Disepakati & **dibangun 17 Oktober 2026** (migrasi `20261017090000_approval_queue`,
kode `src/modules/approval-center/`). Kontrak endpoint ada di Swagger (tag *Approval
Center*, `GET /api/approval-queue` dan `GET /api/approval-queue/summary`); dokumen ini
memuat alasannya dan perubahan pada modul sumber.

Acuan ERD: `docs/claude_knowledge/ERD/MD File/Dokumentasi ERD Approval Center.md`
(30 Agustus 2026, "hybrid approval index").

---

## A1. Antrean dibaca dari VIEW, bukan tabel `approval_tasks`

ERD merancang tabel `approval_tasks` berisi snapshot (`reference_code`, `title`,
`summary_text`, `summary_json`) + `task_state`, ditambah `approval_task_logs`.
Alasannya dicatat di diskusi 30 Agustus (`AIsession/1-session.md` ±baris 30059–30500):
tabel generic yang hanya berisi `source_type` + `source_id` tidak mengurangi query,
jadi list butuh snapshot supaya cukup membaca **satu tabel**.

**Tujuannya dipertahankan, caranya diganti.** Antrean dibaca dari VIEW PostgreSQL
`approval_queue` — `UNION ALL` tabel sumber dengan kolom seragam. Backend tetap
membaca "satu tabel", tetapi tidak ada salinan:

| | Tabel snapshot (ERD) | VIEW |
|---|---|---|
| List dari satu sumber, urut & paginasi lintas modul | ya | ya |
| Wajib diperbarui di setiap jalur yang mengubah status | ya (±12 jalur hari ini, bertambah tiap modul) | tidak |
| Bisa berbeda dari tabel sumber | ya, kalau satu jalur terlewat | tidak mungkin |
| Ikut basi saat isi dokumen berubah (Admin mengurangi kuantitas, menyusun biaya) | ya | tidak |
| Riwayat aksi | `approval_task_logs` | kolom aktor/notes di header sumber |

Sebab utamanya prinsip yang sama dengan D3 (Request Material): penghitung/salinan
tersimpan hanya benar kalau setiap jalur tulis ikut memperbaruinya, dan 13 Okt 2026
counter servis terbukti kehilangan reset 8 dari 8 kali. Volume ratusan baris per
tahun membuat VIEW cukup cepat — index tambahan pada `status` sengaja tidak dibuat
sebelum ada keluhan. Kalau kelak terbukti lambat, VIEW dijadikan materialized
view/tabel **tanpa mengubah API**.

**Prisma mengabaikan VIEW — terbukti 17 Okt 2026.** Di Postgres sementara (Docker)
berisi tabel + VIEW, `migrate diff --from-schema-datasource` menghasilkan migrasi
kosong; diff ke database kosong hanya mengusulkan `DROP TABLE`, VIEW-nya tidak
terlihat sama sekali. Jadi VIEW aman ditulis tangan di `migration.sql`, tidak
dinyatakan di `schema.prisma`, dan dibaca service lewat `$queryRaw`.

### `security_invoker` — WAJIB untuk setiap VIEW di proyek ini

VIEW biasa berjalan dengan hak **pemiliknya** (`postgres`, BYPASSRLS). Supabase
membuka schema `public` lewat REST API, jadi VIEW biasa melewati RLS yang sudah
dinyalakan di semua tabel. Terbukti di replika: role `anon` dengan hak default
Supabase membaca **5 baris PR** lewat VIEW biasa, dan **0 baris** lewat
`approval_queue` yang dibuat `WITH (security_invoker = true)`. Backend tidak
terdampak (postgres pemilik tabel + BYPASSRLS).

### Pemetaan permission hanya di kode

VIEW tidak memuat kolom permission. Pemetaan `(sourceType, stage)` → permission aksi
& endpoint aksi ada di SATU tempat, `QUEUES` di `approval-queue.service.js` — dibutuhkan
kode juga untuk `summary` (antrean berjumlah 0 tetap tampil) dan `actionEndpoints`.

## A2. Approval Center baca-saja — aksi tetap di modul sumber

Draf Swagger lama (`/approvals/{id}/approve|reject`) dan ERD (`POST /approval-tasks/{id}/actions`)
**dibuang**:

- Baris VIEW tidak punya `id` sendiri yang stabil; identitasnya `(sourceType, sourceId, stage)`.
- Aksi tiap sumber berbeda bentuk (PR approve wajib nominal aktual; request material
  punya kuantitas & rincian biaya; progress punya cabut validasi). Endpoint generic
  hanya akan meneruskan ke endpoint sumber sambil menggandakan validatornya.
- Endpoint sumber sudah ada, sudah memakai `claimTransition`, dan sudah diuji race-nya.

Setiap baris antrean membawa `detailPath` dan `actionEndpoints`; FE memakai kontrak
endpoint sumber apa adanya.

## A2b. Penamaan

- **"Approval Center"** = nama fitur/halaman. FE punya dua layar: *Approval Center Admin*
  dan *Approval Center Finance*.
- **`/api/approval-queue`** = nama resource API, sama dengan nama VIEW. Bukan `/approvals`,
  karena endpoint ini tidak menyetujui apa pun, hanya daftar antrean.
- **Satu endpoint untuk kedua role**, dibedakan `stage=admin|finance`. Tidak dipecah
  `/admin` & `/finance`: isi antrean ditentukan permission, bukan nama role (E3), dan user
  yang memegang dua tahap otomatis melihat keduanya.

## A3. Isi antrean

| sourceType | stage | Masuk saat | Permission aksi | `submittedAt` | `amount` |
|---|---|---|---|---|---|
| `purchase_request` | admin | `submitted` | `purchase-request:validate` | `created_at` | estimasi total |
| `purchase_request` | finance | `waiting_finance_approval` | `purchase-request:approve` | `admin_validated_at` | estimasi total |
| `material_request` | admin | `submitted` | `material-request:validate` | `created_at` | — (biaya belum lengkap) |
| `material_request` | finance | `waiting_finance_approval` | `material-request:approve` | `admin_reviewed_at` | jumlah `material_request_costs` |
| `equipment_request` | admin | `submitted` (internal_project) | `equipment-request:review` | `created_at` | — |
| `progress_log` | admin | `submitted` | `progress:validate` | `updated_at` | — |

- **`progress_log` tidak ada di ERD Approval Center** — ditambahkan. Progress tervalidasi
  adalah dasar tagihan klien, pemvalidasinya hanya Admin, dan antrean lintas project
  ("log menunggu validasi di semua tahapan") tidak ada di layar mana pun hari ini.
  `submittedAt` = `updated_at` karena log bisa kembali ke `submitted` (diajukan ulang
  setelah ditolak, atau validasinya dicabut).
- **Tidak masuk:** keputusan Divisi Alat atas Request Alat (ERD: Approval Center hanya
  Admin & Finance); penerimaan alokasi (Lapangan); semua yang modulnya belum ada.
- **Menyusul, bentuk response tidak berubah** (cukup menambah `UNION ALL` di VIEW):
  Income verification & klaim pendapatan alat (Build Order 6), permintaan dana
  operasional, laporan pengeluaran & klaim upah lapangan (Build Order 7).

## A4. Siapa melihat apa

- **Tanpa permission baru.** Baris tampil kalau user memegang permission aksi tahap itu.
  Tab FE ditentukan dari `GET /approval-queue/summary`, bukan dari nama role (sejalan
  dengan E3: tidak ada logika berbasis nama role di FE).
- **Disembunyikan:** dokumen yang user ajukan/catat sendiri, dan pada tahap finance,
  dokumen yang user teruskan sendiri di tahap admin (pemisahan tugas, `db16571`).
  Endpoint sumber tetap penjaga sebenarnya (403); antrean hanya tidak menawarkan
  pekerjaan yang pasti ditolak.
- **super_admin:** tidak memegang permission aksi, jadi antreannya kosong. Memantau
  tetap lewat list tiap modul (kebijakan read-only 15 Okt 2026).

## A5. Alasan keputusan disimpan di tabel sumber — menutup backlog B1 & C6

ERD menaruh `decision_notes` di `approval_tasks`. Karena tabel itu tidak dibuat,
catatan keputusan disimpan di header sumber — pola yang sudah berjalan di Request
Alat (`admin_notes`, `equipment_notes`) dan Request Material (`admin_notes`, `finance_notes`).

| Sumber | Kolom baru | Perubahan endpoint |
|---|---|---|
| `equipment_purchase_requests` | `admin_notes`, `finance_notes` (text, null) | `validate` & `approve`: `notes` opsional. `reject`: `notes` **WAJIB** (ditulis ke kolom milik tahap yang menolak). `cancel` tidak berubah |
| `daily_progress_logs` | `validation_notes` (text, null) | `validate` dengan `status=rejected`: `notes` **WAJIB**; `validated` & cabut validasi: opsional. Kembali ke `submitted` (diajukan ulang/dicabut) **menimpa** catatan lama — kolom memuat keputusan terakhir, sama seperti `validated_by/at` |

Konsekuensi yang diterima sadar: riwayat keputusan berulang pada satu progress log
(tolak → ajukan ulang → tolak lagi) hanya menyimpan yang terakhir. Sama dengan
alasan tidak membuat tabel status log (R2): alurnya pendek dan dikoreksi dengan
mencatat ulang.

**Perubahan yang memutus FE:** tombol tolak PR (`PurchaseRequestQueue`/`Detail`) saat ini
mengirim tanpa body → mulai modul ini dibalas 400. FE wajib menambah isian alasan
(`backlog-fe.md` E22).

### Ikut diperbaiki: validasi progress kini atomik

`setValidationStatus` dulu memakai `update` biasa, sehingga dua Admin yang bertindak
bersamaan pada log yang sama saling menimpa. Karena aksinya kini juga dipanggil dari
Approval Center, transisinya dipindah ke `claimTransition` — terbukti: validasi +
tolak bersamaan → satu 200, satu 409.

## Sengaja belum

- **Riwayat "yang sudah saya proses"** (UI History di ERD). Bisa dibangun dari kolom aktor
  header sumber dengan VIEW kedua (`GET /approval-queue/history`); ditunda karena FE belum
  punya layarnya.

## A6. Pengujian (17 Okt 2026)

Seluruhnya di **replika lokal** — struktur database bersama disalin lewat
`pg_dump --schema-only` ke Postgres 17 di Docker, migrasi baru diterapkan, lalu seed.
Database bersama tidak disentuh. 38 cek end-to-end lulus:

- Visibilitas: admin 4 antrean, finance 2, super_admin/lapangan/divisi_alat kosong;
  admin yang dirangkap finance melihat 6, tapi PR yang dia teruskan sendiri tidak
  muncul di antrean finance-nya (muncul bagi finance lain).
- Baris hilang dari antrean tepat setelah aksi di endpoint sumber; request material
  pindah ke antrean finance dengan `amount` = jumlah rincian biaya.
- Tolak PR & progress tanpa alasan → 400; catatan tersimpan di kolom tahapnya; progress
  yang dibuka kembali mengosongkan catatannya dan kembali ke antrean.
- Race validasi progress, paginasi, urutan, pencarian (kode & konteks), 401 tanpa token.
- `security_invoker` (lihat A1).
