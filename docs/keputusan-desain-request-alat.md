# Keputusan Desain — Modul Request Alat

Acuan ERD: `docs/claude_knowledge/ERD/MD File/Dokementasi ERD Request Alat.md`
(Final Request Alat, 27 Agustus 2026).

Dibangun 10 Oktober 2026 di branch `module/project` (Build Order langkah 4).
Migrasi: `20261010090000_add_request_alat` (expand, aditif).

---

## Ukuran yang dipakai memangkas enum

Sama dengan dua pemangkasan sebelumnya (Divisi Alat 8→3, alokasi 6→4): sebuah
status hanya layak ada kalau ia **mengubah keputusan atau antrean seseorang**.
Status yang bisa dijawab kolom lain adalah salinan, dan salinan bisa bertentangan
dengan aslinya.

## `equipment_request_status`: 9 → 5

| Nilai ERD | Keputusan | Alasan |
|---|---|---|
| `submitted` | tetap | Antrean Admin (internal saja) |
| `admin_review` | **dibuang** | "Admin sedang membuka" — tidak ada yang menunggu status ini. Kasus yang sama dengan `admin_validated` pada purchase request (dibuang 27 Sep) |
| `equipment_review` | tetap | Antrean Divisi Alat. External rental mulai di sini |
| `approved` | tetap | |
| `partially_approved` | **dibuang** | Diturunkan dari kuantitas item; response memuat `approvalOutcome: full / partial` |
| `rejected_by_admin` + `rejected_by_equipment_division` | **disatukan → `rejected`** | Siapa yang menolak terjawab dari kolom reviewer yang terisi; response memuat `rejectedBy: admin / equipment_division`. Alasan di `admin_notes` / `equipment_notes` |
| `fulfilled` | **dibuang** | Pool item dibuat dalam transaksi yang sama dengan approval — status itu tidak pernah mengendap |
| `cancelled` | tetap | Oleh pengaju, hanya selama `submitted` / `equipment_review` |

### Konsekuensi yang diterima sadar: pola penolakan berbeda dari purchase request

PR memakai `rejected_by_admin` / `rejected_by_finance`; Request Alat memakai satu
`rejected`. Argumen "aktor sudah terekam di kolom" berlaku juga untuk PR, jadi
yang kurang efisien adalah PR, bukan modul ini. Biayanya: layar lintas modul
(Approval Center, langkah 5) mengenal dua kosakata penolakan.

**Belum dikerjakan:** menyamakan enum PR. Itu perubahan enum destruktif di modul
yang sudah stabil, jadi tidak dilakukan diam-diam di batch ini. Tinjau saat
Approval Center dirancang — kalau keseragaman ternyata lebih berharga, itu
alasan sah untuk memilih salah satu pola dan menyamakan keduanya.

## `equipment_request_item_status` dan `decision_status`: dibuang seluruhnya

Kelimanya diturunkan dari kuantitas. `approved_quantity` dibuat **nullable**:

| `approved_quantity` | `decision` (turunan) |
|---|---|
| `NULL` | pending |
| `0` | rejected |
| `< requested` | partially_approved |
| `= requested` | approved |

Ikut dibuang:
- **`rejected_quantity`** — ERD sendiri menulis `rejected = requested − approved`
- **`checked_by` / `checked_at` per item** — Divisi Alat memutuskan semua item
  dalam satu aksi; aktornya sudah di `equipment_reviewed_by` header
- `fulfilled` pada item — alasan yang sama dengan header

`decision_notes` per item tetap: alasan persetujuan parsial memang per item.

## `equipment_request_status_logs`: TIDAK DIBUAT

Alurnya linear dan tiap langkah terjadi paling banyak sekali, sehingga kolom
aktor di header (`requested_by`, `admin_reviewed_*`, `equipment_reviewed_*`,
`cancelled_*`) sudah merekam seluruh riwayat. Tabel log akan menyimpan fakta
yang sama di tempat kedua. Purchase request berjalan dengan pola yang persis sama.

**Kapan log dibutuhkan:** kalau sebuah langkah bisa berulang — misalnya "Admin
mengembalikan ke Lapangan untuk revisi, lalu diajukan ulang". Header hanya
menyimpan putaran terakhir. ERD tidak punya alur itu; kalau nanti diminta,
menambah tabel adalah migrasi aditif yang murah.

---

## Approval melahirkan pool item — satu per unit

Pool item terbukti mewakili **satu slot unit**: ia memegang satu
`equipment_item_id`, dan satu alokasi menghabiskan seluruh pool item. Karena
itu request "3 Excavator, disetujui 2" melahirkan **2 pool item**, bukan satu
pool item berkuantitas 2 (yang tidak mungkin diikat ke dua unit maupun dikirim
terpisah).

Pool item hasil approval: status `available`, unit belum ditentukan
(`equipment_item_id` null), `equipment_request_item_id` terisi. Divisi Alat
memilih unitnya lewat `bind-unit`, lalu mengalokasikan seperti biasa.

**Pool tujuan di-resolve sistem**: pool `draft`/`active` milik project pemilik
request. Belum ada → dibuat di transaksi yang sama. Lebih dari satu → klien wajib
mengirim `equipmentPoolId`; sistem tidak menebak.

### Utang modul Project yang tertutup

- `equipment_pool_items.equipment_request_item_id` — **dibuat**, FK nullable.
  Pool item yang dimasukkan manual Divisi Alat tetap sah (kolom null).
- `approvedQuantity` standin pada pool item — keputusan kuantitas kini hidup di
  `equipment_request_items`. Kolom pool item tinggal sisa (selalu 1).
- `pending` / `rejected` pada pool item — **tidak akan pernah terjangkau**. Pool
  item baru dibuat sesudah disetujui, dan hanya untuk unit yang disetujui. Unit
  yang ditolak tercatat di request item ("2 dari 3"), bukan sebagai pool item.

### TERTUNDA — tahap contract, menunggu konfirmasi tim

Migrasi destruktif yang **belum** dijalankan:

```sql
ALTER TABLE equipment_pool_items DROP COLUMN requested_quantity, DROP COLUMN approved_quantity;
-- + buang nilai 'pending' dan 'rejected' dari enum equipment_pool_item_status
--   (Postgres tidak bisa DROP VALUE: buat tipe baru, ALTER COLUMN ... USING, drop tipe lama)
```

Saat batch ini selesai: 2 baris pool item, keduanya 1/1; 0 baris memakai
`pending`/`rejected`. Data yang hilang praktis nol. Yang ditunggu adalah **kode**:
API pool masih mengembalikan `requestedQuantity`/`approvedQuantity`, dan FE atau
cabang developer lain bisa saja membacanya. Ditahan dengan alasan yang sama
dengan DROP kolom workhour 5 Oktober.

---

## Wewenang

| Role | Permission | Catatan |
|---|---|---|
| lapangan | read, create | Pengaju internal |
| admin | read, create, review | Mereview internal; membuat external rental. Tanpa `approve` |
| divisi_alat | read, approve | Memutuskan kuantitas. Tanpa `create`/`review` |
| super_admin | read | Sejak 15 Okt 2026 hanya memantau (tanpa bypass) |

**External rental hanya boleh dibuat pemegang `equipment-request:review`.** Request
itu melewati review Admin karena pembuatnya Admin. Tanpa syarat ini, siapa pun
yang bisa membuat request bisa melompati review cukup dengan memilih
`requestType: external_rental`.

Pengaju tidak boleh mereview maupun memutuskan request sendiri (403) — pola yang
sama dengan purchase request.

## Guard yang ditegakkan kode

- Tepat satu konteks sesuai `request_type` — service menolak 400 dengan pesan
  jelas, **CHECK `equipment_requests_context_check`** menutup jalan masuk lain.
- `0 ≤ approved_quantity ≤ requested_quantity`, `requested_quantity > 0` —
  **CHECK `equipment_request_items_quantity_check`**. Kedua CHECK diuji dengan
  SQL mentah yang menembus service: ditolak `23514`.
- Satu jenis alat sekali per request (gabungkan kuantitasnya).
- Tahapan / project / rental yang `completed`/`cancelled` tidak bisa meminta alat.
  Tahapan `planned` boleh — alat wajar diminta sebelum pekerjaan dimulai.
- Semua item wajib diputuskan dalam satu aksi; menolak semuanya wajib beralasan.
- **Transisi status memakai `updateMany ... WHERE status IN (...)`.** Dua aksi
  bersaing (dua keputusan, atau batal vs keputusan) tidak bisa sama-sama lolos:
  yang kalah 409. Diuji: dua keputusan bersamaan → satu 200, satu 409, tepat 2
  pool item di database (tidak ganda).
- Request `approved` tidak bisa dibatalkan — pool item-nya ditutup lewat pool.

## Perbaikan sampingan

### Alokasi pool item tanpa unit — ditolak 409

`allocation.create` dulu menerima pool item yang unitnya belum ditentukan.
Alokasi mengubah pool item jadi `assigned`, sementara `bind-unit` hanya menerima
pool item `available` — jadi alokasi tanpa unit **tidak akan pernah bisa diikat**,
dan workhour-nya ditolak 409 selamanya. Belum ada datanya (0 baris), tapi pool
item hasil Request Alat lahir tanpa unit, jadi jebakan ini langsung terjangkau.
Secara fisik pun tidak ada "unit belum ditentukan" yang bisa dikirim ke lokasi.

### Timeout transaksi Prisma — dipasang sekali di client

Default 5 detik terlalu pendek lewat pooler Supabase. Dulu dinaikkan per service
(`TRANSACTION_OPTIONS` disalin di cash dan purchase-request); 7 transaksi modul
Project dan 8 transaksi Divisi Alat lain belum. Sekarang
`transactionOptions: { maxWait: 15000, timeout: 30000 }` dipasang di constructor
`PrismaClient` (`src/config/database.js`) dan kedua salinan dihapus. Diuji:
transaksi yang tidur 6 detik lolos.

## Tidak dibuat (sadar)

- **Edit request sebelum direview.** Batalkan lalu buat baru. Tambahkan kalau
  Lapangan memintanya.
- **Memilih unit saat approval** (`assignedEquipmentIds` di swagger versi awal).
  `bind-unit` yang sudah ada sudah mengerjakannya; dua jalan untuk hal yang sama
  berarti dua tempat menjaga aturan "unit tidak boleh dipegang dua pool".
- **Integrasi Approval Center** — langkah 5.
