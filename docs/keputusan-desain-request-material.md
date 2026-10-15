# Keputusan Desain — Modul Request Material

Acuan ERD: `docs/claude_knowledge/ERD/MD File/Dokementasi ERD Request Material.md`
(Final v2, 27 Agustus 2026) dan bagian material pada
`Dokumentasi_ERD_Project.md`.

Modul dipecah menjadi lima tahap. RM-1 & RM-2 dikerjakan di branch `feature/rm-*`;
sejak 15 Okt 2026 sisanya langsung di `module/project` (satu commit per tahap):

| Tahap | Isi | Status |
|---|---|---|
| RM-1 | Master jenis material & supplier, material pool, ~~PIC supply project~~ (dibuang 16 Okt) | **Dibangun 13 Okt 2026** |
| RM-2 | Material request + meja Admin (sesuaikan kuantitas / tolak) | **Dibangun 14 Okt 2026** |
| RM-3 | Biaya + approval paket oleh Finance | **Dibangun 15 Okt 2026** — lihat bagian RM-3 di bawah |
| — | Lampiran bersama (surat jalan, bukti receipt, damage, PR, project files) | **Fondasi dibangun 16 Okt 2026** — `docs/keputusan-desain-lampiran.md` |
| RM-4 | Delivery + surat jalan | **Dibangun 16 Okt 2026** — lihat bagian RM-4 |
| RM-5 | Receipt + inventori + stock movement (dibaca Income) | Belum |

---

## D1. Satuan hanya disimpan di jenis material

ERD menaruh `unit` di **lima** tabel: `material_types.default_unit`,
`material_pool_items`, `material_request_items`, `material_delivery_items`,
`material_receipt_items`. Satu material bisa tercatat dalam satuan berbeda di
tiap baris, dan jumlahannya tidak bermakna:

| Langkah | Satuan per baris (ERD) | Satuan di jenis material (D1) |
|---|---|---|
| Request | Pasir Urug **20 m³** | Pasir Urug 20 (m³) |
| Delivery, surat jalan per rit | **3 rit** | 24 m³ (3 rit × 8 m³, nomor surat jalan tetap disimpan) |
| Receipt, ditimbang | **36 ton** | dalam m³ |
| "Sudah terpenuhi berapa?" | 20 vs 3 vs 36 — tidak bisa dibandingkan | 24 dari 20 m³ |

**Keputusan (13 Okt 2026):** `unit` hanya di `material_types`. Semua kuantitas
mengikutinya. **Konversi menjadi tanggung jawab penginput** — tidak ada tabel
konversi. Material yang wajib dicatat dalam satuan lain dibuat sebagai jenis
material terpisah.

Karena tanggung jawabnya di manusia, sistem mempersempit peluang salahnya:

1. **Satuan selalu ikut di response** di samping setiap angka (pool item: field
   `unit`; nanti juga request, delivery, receipt) — FE menampilkannya tepat di
   samping kotak input.
2. **Klien tidak bisa mengirim satuan.** `unit` ditolak 400 pada pool item, dan
   mulai RM-2 pada request/delivery/receipt — dengan pesan yang menyebut satuan
   yang berlaku.
3. **Daftar satuan baku** (`src/modules/material/material.constants.js`):
   m³, ton, kg, liter, sak, roll, batang, unit. Disediakan juga lewat
   `GET /api/materials/units` supaya dropdown FE dan validator memakai sumber
   yang sama. **"rit" sengaja tidak ada** — muatan truk berbeda-beda, jadi rit
   bukan ukuran yang stabil.
4. **Satuan terkunci begitu dipakai.** Mengubah m³ ke ton membuat angka lama
   terbaca salah. Di RM-1 kuncinya "sudah ada di pool item"; tahap berikutnya
   menambah rujukan lain.
5. **Nama unik tanpa melihat huruf besar-kecil** — "Pasir Urug" dan "pasir urug"
   akan memecah stok ke dua baris. Kode disimpan uppercase sehingga `@unique`
   menjaganya; nama dijaga pemeriksaan service (`mode: 'insensitive'`), karena
   index fungsional `lower(nama)` tidak bisa dinyatakan Prisma dan akan diusulkan
   di-DROP oleh setiap `migrate diff`.

## D2. `supplier_id` pada header material pool tidak dibuat

ERD menaruh supplier di `material_pools` **dan** `material_deliveries`. Supplier
di header berarti satu project hanya punya satu supplier, padahal satu kontrak
supply nyata dipasok lebih dari satu quarry (data contoh FE sendiri memakai dua).
Siapa yang mengirim adalah fakta milik delivery (RM-4).

## D3. Penghitung `total_*` pada pool item tidak dibuat

`total_requested/approved/delivered/received_quantity` semuanya jumlahan tabel
lain. Penghitung tersimpan hanya benar kalau SETIAP jalur tulis memperbaruinya —
buat, edit, batal, pindah item, koreksi lewat SQL/seed — sekitar delapan jalur
di RM-2..RM-5 untuk empat angka. Satu jalur terlewat dan angkanya menyimpang
tanpa jejak, padahal angka ini dibaca Income untuk menagih klien.

Bukan risiko teoretis: 13 Okt 2026 counter servis (`current_value_since_reset`,
penghitung tersimpan) terbukti kehilangan reset 8 dari 8 kali saat ada log jam
kerja bersamaan.

Volume proyek ini ratusan–ribuan baris per tahun, jadi satu `GROUP BY` untuk
seluruh pool selesai dalam milidetik — prinsip yang sama dengan saldo Kas Alat.
Kalau kelak terbukti lambat, tambahkan cache atau view **tanpa mengubah API**;
arah sebaliknya (membuang penghitung yang sudah menyimpang) jauh lebih mahal.

Akibatnya pool item tinggal pasangan (pool, jenis material) — **satu baris per
jenis material per pool** (`@@unique`), beda dengan equipment pool item yang satu
baris per unit.

## D4. Kode material manual, unik, wajib

Mengikuti `equipment_types.type_code` (mis. `AGG-BA`). Kode material bukan nomor
dokumen, jadi tidak lewat counter. Tidak bisa diubah setelah dibuat.

## D5. PIC Lapangan pada supply project — DIBUANG 16 Oktober 2026

~~`external_supply_projects.field_pic_id` (FK users, nullable). Aturan "hanya PIC
yang boleh mengajukan request material untuk kontrak ini" ditegakkan di RM-2.~~

Dibuang karena sistem tidak punya proses menugaskan orang Divisi Lapangan ke
project mana pun — PIC hanya isian bebas Admin, jadi aturan yang bersandar padanya
tidak bisa ditegakkan jujur. Request material dan delivery supply sekarang terbuka
untuk pemegang permission Lapangan mana pun, sama seperti konstruksi. Kolom sudah
keluar dari schema & kode; **DROP COLUMN ditunda** ke migrasi terpisah karena
database dev dipakai bersama (backend rekan yang belum pull masih membacanya).

## Wewenang

| Role | Permission |
|---|---|
| admin | `material`, `supplier`, `material-pool`: read, create, update |
| lapangan | read ketiganya (memilih material saat request, RM-2) |
| finance | read ketiganya (menyetujui dana material, RM-3) |
| divisi_alat | — |

## Yang sengaja belum

- Menutup pool yang masih punya item **tidak dibatasi** di RM-1 — belum ada
  request/inventori yang merujuknya. Aturannya menyusul di RM-2/RM-5.
- Menghapus material dari pool diizinkan selama pool hidup; mulai RM-2 item yang
  sudah dirujuk wajib ditolak.
- **Harga material tidak disimpan di pool.** ERD Income mengambil harga saat
  income record dibuat (`rate_snapshot`), bukan dari master.

## Seeder (`src/database/seeders/material.seed.js`)

Idempoten **per bagian** (beda dengan `project.seed.js` yang melewati semua kalau
sudah ada data), dan semuanya lewat service:

- 10 jenis material + 3 supplier (dari daftar di layar supply/inventori FE)
- Supply project: PIC = user `lapangan`, material pool berisi 4 material
- Construction project aktif: material pool berisi 4 material
- Rental project aktif: equipment pool, 2 unit terikat, 5 log jam kerja
  `external_rental` per unit — lewat `createWorkhourLog`, sehingga total jam
  alat dan counter servis ikut benar. Menggantikan `rentalDemoService` di FE
  (`backlog-fe.md` E11).

---

# RM-2 — Request material & meja Admin (14 Oktober 2026)

Migrasi: `20261014090000_add_material_request`.

**Batas RM-2/RM-3.** ERD mewajibkan paket dana dibuat sebelum request diteruskan
ke Finance (aturan 4–5). Jadi RM-2 berhenti di meja Admin: Lapangan/PIC
mengajukan, Admin menyesuaikan kuantitas atau menolak, pengaju bisa membatalkan.
Meneruskan ke Finance lahir bersama funding di RM-3.

## R1. Status 6 → 5

| ERD | Dipakai | Alasan |
|---|---|---|
| `waiting_admin_validation` | `submitted` | Antrean Admin; nama disamakan dengan PR & Request Alat |
| `waiting_finance_approval` | tetap | Antrean Finance (RM-3) |
| `approved`, `cancelled` | tetap | |
| `rejected_by_admin` + `rejected_by_finance` | `rejected` | Siapa yang menolak terbaca dari kolom reviewer; dikembalikan sebagai field turunan `rejectedBy` — sama dengan Request Alat |

## R2. Tabel status log & enum `action_type` tidak dibuat

Alur linear, tiap langkah paling banyak sekali, dan ERD menegaskan *revisi =
request baru*. Kolom aktor di header (`requested_by`, `admin_reviewed_*`,
`finance_reviewed_*`, `cancelled_*`) sudah memuat seluruh riwayat.

## R3. Material dipilih bebas dari master — TIDAK wajib dari pool

Usulan awal (wajib dari pool) **ditolak**: tidak ada tahap Admin menyusun daftar
material di awal proyek, baik konstruksi maupun supply. Akibatnya:

- Item request menyimpan `material_type_id` (wajib, harus aktif). Satuan tetap
  dibaca dari jenis material (D1).
- **Pool menjadi hasil, bukan syarat.** Di RM-3, material yang disetujui Finance
  masuk ke material pool project (pool dibuat otomatis kalau belum ada), lewat
  `material_pool_item_id` yang di RM-2 masih null.

## R4. Kuantitas validasi Admin

Boleh **dikurangi**; tidak boleh **dinaikkan** melebihi permintaan (butuh lebih =
request baru, supaya permintaan tetap milik pengaju) dan tidak boleh **0** (untuk
mencoret item, tolak request-nya — ERD: tidak ada partial approve). NULL = Admin
belum mengubah; kuantitas berlaku (`effectiveQuantity`) = diminta. Dijaga
service **dan** CHECK `material_request_items_quantity_check`.

## R5. Siapa boleh mengajukan

- **Supply:** ~~hanya PIC Lapangan project itu (D5)~~ — sejak 16 Okt 2026 pemegang
  `material-request:create` mana pun, untuk kontrak yang belum ditutup.
- **Konstruksi:** pemegang `material-request:create`, untuk tahapan `planned`
  atau `active` — material wajar dipesan sebelum pekerjaan dimulai.

## Wewenang

| Role | Permission |
|---|---|
| lapangan | `material-request`: read, create |
| admin | `material-request`: read, validate |
| finance | `material-request`: read (approve menyusul di RM-3) |

Pengaju tidak boleh memvalidasi atau menolak request sendiri. Penolakan diatur
per status & permission (pola purchase request) supaya RM-3 cukup menambah
aturan untuk Finance. Semua transisi lewat `claimTransition`.

## Guard ikutan: satu tahapan aktif per project

Dikonfirmasi 14 Okt 2026: tahapan dalam satu project **tidak pernah berjalan
bersamaan** — satu selesai dulu, baru berikutnya. Mengaktifkan tahapan saat
tahapan lain masih `active` kini **ditolak 409**. Urutan tetap peringatan
(`sequenceWarning`), karena perusahaan bisa hanya mendapat kontrak tahapan akhir.
Baris project dikunci (`SELECT … FOR UPDATE`) saat aktivasi supaya dua aktivasi
bersamaan tidak lolos; index unik parsial tidak dipakai karena Prisma tidak bisa
menyatakannya dan setiap `migrate diff` akan mengusulkan DROP-nya.

---

## Keputusan awal untuk tahap berikutnya (14 Oktober 2026)

### RM-3 — dana material

- **Dana keluar langsung dari rekening perusahaan**, bukan Kas Alat (itu kas
  Divisi Alat) dan bukan kas lapangan. Jejaknya kelak jurnal GL. Karena modul GL
  baru Build Order langkah 9, RM-3 menyimpan funding yang disetujui sebagai
  **dokumen sumber** yang nanti dibaca GL — pola yang sama dengan income
  verified → jurnal.
- **Finance tidak mengisi nominal aktual**; yang disetujui adalah estimasi Admin.
  Berbeda dengan purchase request (di sana Finance wajib mengisi aktual).
  Konsekuensi yang diterima sadar: angka di pembukuan bisa berbeda dari uang yang
  benar-benar keluar; selisihnya dikoreksi lewat `financial_correction_requests`
  di modul GL.
- **Material konstruksi dan material supply dicatat berbeda di akuntansi**:
  konstruksi = biaya proyek (dipakai sendiri); supply = harga pokok penjualan
  (dijual lagi, dipasangkan dengan pendapatan material dari klien, untuk margin
  per kontrak). **Tidak butuh kolom baru** — `request_type` di request material
  sudah membedakannya; GL memilih akun berdasarkan itu.

### Lampiran — arah penyimpanan file

> Rancangan lengkapnya sekarang di `docs/keputusan-desain-lampiran.md` (16 Okt 2026).

Untuk fase development: **Supabase Storage lewat protokol S3** (klien S3
standar, bukan SDK Supabase), dengan dua aturan supaya pindah penyedia di
production murah:

1. Database menyimpan **kunci file** (`delivery-notes/2026/10/SJ-0012.pdf`),
   **bukan URL penyedia**.
2. Semua akses file lewat **satu modul** (`storage.service.js`); modul lain tidak
   memanggil SDK penyimpanan langsung.

Dengan itu, pindah ke AWS S3 / Cloudflare R2 / MinIO cukup mengganti
konfigurasi `.env` dan menyalin file lama. Rincian lain (tabel generic vs per
modul, batas ukuran/jenis, siapa boleh mengunduh) diputuskan di sesi desain
lampiran sebelum RM-4.

---

# RM-3 — Dibangun 15 Oktober 2026 (migrasi `20261015090000_add_material_request_costs`)

Skema rinci (DBML + CHECK) ada di `claude_knowledge/ERD/Revisi/05_Request_Material.md`.

## F1. Tabel header `material_funding_requests` TIDAK dibuat

Hubungannya 1:1 dengan request, dan setiap kolom headernya sudah dijawab tempat lain:

| Kolom ERD | Kenapa tidak perlu |
|---|---|
| `status` | Cermin status request — ERD sendiri: "disetujui/ditolak sebagai satu paket" |
| `reviewed_by/at`, `finance_notes` | Sudah ada `material_requests.finance_reviewed_*` |
| `approved_total_amount` | Finance tidak mengisi nominal aktual → selalu = total diajukan |
| `requested_total_amount` | Jumlahan baris biaya, dihitung saat dibaca (D3) |
| `funding_code` | = `request_code` (MRQ-…) |

Gantinya satu tabel **`material_request_costs`** yang menempel ke request. Saat Approval
Center dibangun, sumbernya `material_request` pada tahap Finance (bukan
`material_funding_request` seperti di ERD Approval Center).

## F2. Jenis biaya

6 nilai ERD dipertahankan (`material_cost`, `driver_fee`, `delivery_fee`,
`loading_unloading_fee`, `fuel_cost`, `other`) — kelak dipakai GL memilih akun.
`approved_amount` per baris dan `payee_type` dibuang.

## F3. Syarat "lengkap" sebelum diteruskan ke Finance

- Setiap item material punya **tepat satu** baris `material_cost` yang menunjuk item itu
  (unique). Biaya lain opsional dan TIDAK menunjuk item (CHECK).
- Semua nominal > 0 (CHECK).
- Admin menyusun biaya selama `submitted`, mengganti seluruh daftar sekaligus. Setelah
  diteruskan, kuantitas dan biaya terkunci.

## F4. Alur & wewenang

- `PUT /:id/costs` dan `PUT /:id/submit-to-finance` — Admin (`material-request:validate`).
- `PUT /:id/approve` — Finance (**permission baru `material-request:approve`**). Satu
  transaksi: status → `approved`, `finance_reviewed_*`, material masuk material pool.
- `PUT /:id/reject` — tambah aturan untuk `waiting_finance_approval` → `material-request:approve`.
- Tidak ada "kembalikan ke Admin": revisi = request baru (ERD aturan 10).
- super_admin TIDAK memegang approve (kebijakan read-only 15 Okt 2026).

## F5. Pool saat approval

Konstruksi → pool milik construction project dari tahapannya; supply → pool milik supply
project. Dibuat otomatis kalau belum ada; lebih dari satu pool hidup → wajib
`materialPoolId`; material yang sudah ada di pool memakai pool item yang sama
(`@@unique(material_pool_id, material_type_id)`).

## Uji yang wajib saat dibangun

Approve ganda bersamaan → satu 200, satu 409, pool item tidak dobel. Approve + cancel
bersamaan. CHECK lewat SQL mentah. Tabel baru `ENABLE ROW LEVEL SECURITY`.

---

# RM-4 — Dibangun 16 Oktober 2026 (migrasi `20261016090000_add_files_and_material_deliveries`)

Dibangun di atas fondasi lampiran (`docs/keputusan-desain-lampiran.md`).
Endpoint: `/api/material-deliveries` (list, detail, catat, ganti file surat jalan, batal).

## G1. Satu delivery = satu surat jalan = satu truk = satu material

Dikonfirmasi: satu truk tidak membawa campuran material. Karena itu
**`material_delivery_items` tidak dibuat** — delivery menunjuk langsung satu item
request. Sesuai juga dengan "ritase" di FE.

```
material_deliveries
  id, delivery_code            -- DLV-NNNNNN, dibuat sistem
  material_request_id, material_request_item_id, delivered_quantity (> 0, CHECK)
  supplier_id (WAJIB), delivery_note_number, delivery_note_date (tidak di masa depan)
  delivery_note_file_id (WAJIB, unik) -> files
  vehicle_type, vehicle_number, driver_name, driver_phone
  origin_location, destination_location, notes
  created_by, cancelled_by, cancelled_at, cancel_reason
  UNIQUE (supplier_id, delivery_note_number)
```

Item request wajib milik request yang sama — dijaga composite FK
`(material_request_item_id, material_request_id)`. Nomor surat jalan unik per
supplier **di antara delivery aktif**: index unik `(supplier_id, delivery_note_number,
cancelled_at) NULLS NOT DISTINCT`, supaya koreksi "batalkan lalu catat ulang" bisa
memakai nomor yang sama. Nomor surat jalan & plat dinormalisasi huruf besar.
CHECK: kuantitas > 0; kolom pembatalan terisi bersamaan.

## G2. Selisih terhadap ERD

| ERD | Revisi | Alasan |
|---|---|---|
| `material_delivery_items` | tidak dibuat | G1 |
| `unit`, `material_type_id`, `material_pool_item_id` | dibuang | terbaca dari item request (D1, satu fakta) |
| `material_delivery_status` 5 nilai | **tanpa kolom status**, hanya kolom pembatalan | `planned`/`shipped` tak pernah terjadi (surat jalan baru ada saat truk berangkat); `partially_received`/`received` diturunkan dari receipt (RM-5). Pola sama dengan `is_voided` Kas Alat |
| `planned_delivery_date`, `shipped_at`, `estimated_arrival_at` | dibuang | tidak ada tahap perencanaan |
| `delivery_note_file_url` | `delivery_note_file_id` -> `files` | lampiran bersama (L1) |
| `uploaded_by/at` | di `files` | |
| nomor surat jalan unik global | unik **per supplier** | nomor diterbitkan supplier; dua quarry bisa memakai nomor sama |
| — | `vehicle_type`, `origin_location`, `destination_location` | sudah ada di form FE |

## G3. Siapa mencatat

**Divisi Lapangan untuk semua jenis request** — merekalah yang memegang surat jalan
(diputuskan 16 Okt 2026; FE saat ini menaruh form ritase supply di menu Admin, lihat
backlog-fe E15).

- Permission baru `material-delivery:create` → lapangan.
- Berlaku sama untuk `internal_project` dan `external_supply` — tanpa PIC (D5 dibuang).
- Pembatalan: pencatatnya, alasan wajib, hanya selama belum ada receipt (RM-5
  menambahkan pengecekan itu).
- Baca: `material-request:read` (delivery adalah bagian dari request).

## G4. Aturan

- Hanya untuk request `approved` (ERD aturan 11), tahapan/kontrak belum ditutup.
- Surat jalan wajib dilampirkan saat dicatat, profil `evidence`. Selama belum ada
  receipt, file boleh diganti (L6).
- Detail request menampilkan per item **total terkirim** (dihitung saat dibaca,
  delivery batal tidak dihitung).

## G5. Kelebihan kiriman — FUTURE FEATURE

Total terkirim boleh melebihi kuantitas disetujui: volume per truk perkiraan, truk
terakhir tidak bisa setengah muat. Sistem **tidak menolak** — truk yang benar-benar
datang harus bisa dicatat. Penandaan "lebih X m³" untuk Finance dan penyelesaian
uangnya (lewat `financial_correction_requests`) ditunda sebagai fitur antisipasi.

