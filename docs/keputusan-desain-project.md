# Keputusan Desain — Modul Project

Dokumen terpisah dari `keputusan-desain-divisi-alat.md` dengan alasan yang sama
dipakai memindahkan catatan FE: satu fakta hidup di satu tempat, dan keputusan
Project dibaca orang serta berubah dengan irama yang berbeda.

Acuan ERD: `docs/claude_knowledge/ERD/MD File/Dokumentasi_ERD_Project.md`
(docx 11 September 2026, Revisi Progress Billing v2).

Terakhir diperbarui: 1 Oktober 2026, setelah Batch P1–P2.

---

## PERINGATAN — file DBML yang TIDAK BOLEH dipakai

`docs/claude_knowledge/DBML_Project_SubProject_Final_Terintegrasi_Request_Alat_FIXED.dbml`
**bukan versi terbaru meski tanggal file-nya paling baru** (1 Okt 2026 = waktu
disimpan, bukan waktu ditulis). Isinya versi SEBELUM Revisi Progress Billing v2:

| | DBML `_FIXED` | docx/MD 11 Sep (yang dipakai) |
|---|---|---|
| `sub_projects` | tanpa `contract_value`, `target_volume`, `sequence_order` | punya semuanya |
| `contract_volume_targets` | masih ada | dihapus |
| `daily_progress_logs` FK | `contract_volume_target_id` | `sub_project_id` |

Mengikuti DBML itu membuat aturan bisnis inti — "setiap sub_project punya kontrak
sendiri" dan "tagihan = progress % × sub_project.contract_value" — **tidak bisa
dibangun sama sekali**, karena kolomnya tidak ada. Sisa isinya identik dengan
docx, jadi tidak ada satu bagian pun yang lebih baru.

---

## Progress billing — hanya `validated` yang menjadi uang

ERD menulis rumusnya (`SUM(realized_volume) / target_volume × 100`) tapi **tidak
pernah menyebut status mana yang ikut dijumlahkan**, dan tidak pernah menyebut
siapa yang memvalidasi. Keempat sesi perumusan juga tidak. Ditetapkan 1 Oktober:

- **`billableProgress` dihitung dari baris `validated` saja.** Angka ini pengali
  langsung atas `contract_value` dan akan dibaca modul Income untuk menagih klien.
  Kalau baris `submitted` ikut dihitung, nominal tagihan bisa **turun** setelah
  validator menolak satu entri — padahal tagihannya mungkin sudah dikirim.
- **`pendingVolume` / `pendingProgress` dilaporkan terpisah** supaya lapangan tahu
  berapa yang belum diperiksa, tanpa pernah tercampur ke angka uang.
- **Validator = Admin**, permission `progress:validate`. Lapangan memegang
  `progress:create` saja — yang mencatat tidak memvalidasi catatannya sendiri,
  pemisahan yang sama dengan pengaju purchase request yang tidak boleh menyetujui
  pengajuannya sendiri. `progress:validate` sengaja TIDAK diberikan ke Lapangan.
- **`paidAmount` dilaporkan `null`, bukan 0** — nominal yang sudah dibayar klien
  milik modul Income (langkah 6). `0` akan terbaca "sudah ditagih, belum dibayar".

### Baris `validated` tidak bisa diedit

Angkanya sudah menjadi dasar tagihan; mengubahnya diam-diam mengubah nilai yang
mungkin sudah dikirim ke klien. Untuk memperbaikinya Admin mencabut validasinya
dulu (`PUT .../validate` dengan `status: "submitted"`), dan pencabutan itu ikut
tercatat di `validated_by`/`validated_at` — siapa yang membuka kunci sama
pentingnya dengan siapa yang menguncinya.

Polanya diambil dari `daily_labor_logs.locked_at` pada ERD Finance Field
("Catatan dikunci setelah masuk klaim upah"). Versi minimalnya saja sekarang:
tanpa kolom baru, dan pintunya sudah ada saat modul Income datang.

### Target volume tidak boleh turun di bawah realisasi tervalidasi

Kalau boleh, progress jadi >100% dan tagihannya melebihi nilai kontrak. Ditolak 409.

---

## Nomor project dibuat sistem

`PRJ-000001`, `RNT-000001`, `SPL-000001` lewat `document_sequences` — counter
atomik, bukan `MAX(...)+1`. Swagger versi awal memperlakukan `projectCode` sebagai
isian klien (`PRJ-001`); itu **diperbaiki**, bukan diikuti, karena bertentangan
dengan aturan nomor dokumen di CLAUDE.md dan membuka pintu kode kembar saat dua
orang input bersamaan.

Override manual hanya untuk `super_admin`, dipakai memigrasi project lama yang
harus tetap memakai kode aslinya. Kebijakannya hidup di service (403 kalau bukan
super_admin), validator hanya memeriksa bentuknya — pola identik dengan `assetCode`.

Identitas dari klien tetap punya tempatnya sendiri: `contract_no`.

---

## Urutan tahapan: peringatan, bukan blokir

ERD menyebut tahapan berjalan berurutan **"atau berdasarkan kesepakatan kontrak
baru"**. Kalimat kedua itu yang memutuskan: perusahaan bisa hanya dapat kontrak
tahapan akhir, jadi urutan tidak bisa ditegakkan keras.

Mengaktifkan tahapan yang pendahulunya belum selesai **berhasil**, dan response
memuat `sequenceWarning` berisi daftar tahapan pendahulu yang masih terbuka.
Preseden: `balanceWarning` pada purchase request — kasih tahu, jangan halangi.

---

## Penyimpangan dari ERD (semuanya arah yang murah dibatalkan)

Prinsip yang dipakai memilih arah: **menambah kolom atau nilai enum itu migrasi
aditif yang aman; menghapusnya destruktif di database yang dipakai bersama.**
Jadi kalau ragu, jangan dibuat dulu.

### `total_used_hours` DIHAPUS dari `equipment_pool_items` dan `sub_project_equipment_allocations`

Angkanya persis `SUM(equipment_workhour_logs.total_workhour)` dan dihitung saat
dibaca. Counter tersimpan memaksa ada yang meng-increment tiap log masuk, dan
sekali tidak sinkron (log dibatalkan, increment gagal, tanggal mundur) tidak ada
yang tahu mana yang benar. Alasan yang sama dipakai saldo Kas Alat.

Diperiksa lintas 9 ERD: **nol modul membacanya** — Income membaca
`equipment_workhour_log_id` langsung, bukan counter di alokasi.

Bedanya dari `equipment_items.total_workhour` yang TETAP disimpan: kolom itu punya
konsumen di dalam transaksi tulisnya (`applyWorkhourToSettings` menggerakkan hitung
mundur maintenance dan bisa mengubah status jadi `due`/`overdue`). Dia menggerakkan
keputusan, bukan cuma dilaporkan. Alokasi tidak punya konsumen seperti itu.

### `equipment_allocation_status` diciutkan 6 → 4

| ERD | Nasib | Alasan |
|---|---|---|
| `assigned` | tetap | |
| `received_at_site` | **dibuang** | Sudah terekam penuh `received_at`/`received_by` — alasan identik dengan dibuangnya `damage_status.reviewed` |
| `in_use` | **dibuang** | Turunan: sudah diterima + ada workhour log = sedang dipakai. Tidak ada keputusan yang berubah karenanya |
| `completed` | tetap | Pekerjaan tahapan selesai |
| `returned` | tetap | Unit kembali ke Divisi Alat — kejadian berbeda dari `completed`, dan yang menentukan unit bebas dipakai lagi |
| `cancelled` | tetap | |

### `equipment_workhour_logs.equipment_item_id` DIPERTAHANKAN

Definisi tabel di ERD Project tidak mencantumkannya (§12 hanya menyuruh
menyelaraskan `project_id`/`sub_project_id`). Tetap dipertahankan karena:

1. `source_type = 'manual_adjustment'` tidak lewat alokasi maupun pool item —
   tidak punya jalan lain menyebut unitnya. Itu **45 dari 45 baris** yang ada
   sekarang di database.
2. Akumulator `equipment_items.total_workhour` perlu tahu unitnya di dalam
   transaksi, dan `GET /items/{id}/workhour-logs` akan jadi UNION dua jalur join.
3. **ERD Divisi Alat, pemilik tabel ini,** punya
   `Ref: equipment_items.id < equipment_workhour_logs.equipment_item_id` eksplisit.

Risiko duplikasi dimatikan dengan menjadikannya **kolom terkelola sistem**: untuk
`internal_project`/`external_rental`, service membacanya DARI alokasi/pool item dan
menolak kiriman klien yang tidak cocok. Bertentangan jadi mustahil. Pola yang sama
dengan aturan cache `assigned_to_location`.

### `equipment_pool_items.equipment_request_item_id` belum dibuat

Tabel `equipment_request_items` baru ada di Build Order langkah 4. Kolom FK tanpa
tabel tujuan hanya perancah. Ditambahkan bersama modul Request Alat, lengkap FK-nya.

### `equipment_pool_item_status` tetap 6 nilai ERD

`pending` dan `rejected` **belum bisa tercapai** sampai Request Alat ada — keduanya
lahir dari approval `equipment_request_items`. Pool item yang dibuat langsung mulai
dari `available`. Nilainya tetap dibuat karena Request Alat memang akan memakainya,
jadi ini bukan nilai mati, hanya belum terjangkau.

---

## Tambahan di luar ERD

- **`daily_progress_logs.validated_by` / `validated_at`** — ERD tidak punya jejak
  aktor untuk perubahan status. Alasannya sama dengan `admin_validated_by` pada
  purchase request: perubahan status tanpa aktor tidak bisa ditelusuri.
- **CHECK constraint `equipment_pools_owner_discriminator_check`** — ditulis manual
  di migrasi (Prisma tidak bisa menyatakan CHECK). Tanpa ini satu baris bisa
  mengisi KEDUA FK atau tidak satu pun; dua keadaan yang tidak punya arti bisnis.
  Sudah diuji: tiga kombinasi salah ditolak `23514`, kombinasi sah diterima.
- **`utils/shape.js`** — `toNumber`/`toDateOnly` sebelumnya disalin **identik**
  di 5 service Divisi Alat (dipastikan dengan md5). Disatukan saat modul Project
  dibangun daripada membuat salinan keenam. `coerceDates` ditambahkan karena
  kolom `@db.Date` menolak string dan konversinya harus terjadi di batas service.
- **Endpoint status terpisah** (`PUT .../status`) untuk project dan sub-project —
  perubahan status tidak boleh pernah terjadi sebagai efek samping edit data biasa.

---

## P3 — Equipment pool & alokasi (4 Oktober 2026)

### Pool item TIDAK melacak status sendiri secara independen

Enum `equipment_pool_item_status` dari ERD punya 6 nilai termasuk `assigned`.
Pembacaannya bisa salah: kalau `status` kolom ini bebas ditulis klien, dia bisa
BERTENTANGAN dengan keadaan alokasi yang sebenarnya — pool item mengaku
`available` padahal ada alokasi `assigned` yang menunjuknya, atau sebaliknya.

**Keputusan: pool item TIDAK PERNAH diubah langsung oleh endpoint "ubah status".**
Transisi `available ↔ assigned` HANYA terjadi sebagai efek samping sistem dari
transaksi alokasi:

- `POST .../allocations` → pool item `available → assigned`, dalam TRANSAKSI
  YANG SAMA dengan pembuatan baris alokasi
- `PUT .../allocations/{id}/status` (completed/returned/cancelled) → pool item
  `assigned → available`, dalam transaksi yang sama

Endpoint `PUT .../items/{itemId}/close` (menuju `completed`/`cancelled`) hanya
boleh dipanggil saat pool item **sedang `available`** — mustahil menutup item
yang masih terikat alokasi aktif. Ini menjaga **satu fakta hidup di satu
tempat**: alokasi adalah sumber kebenaran "sedang dipakai atau tidak", pool item
hanya mencerminkannya.

**Konsekuensi yang diterima sadar:** `pending` dan `rejected` pada enum pool item
tetap tidak tercapai sampai Request Alat ada (sudah dicatat di P1). `requestedQuantity`
vs `approvedQuantity` — tanpa alur approval terpisah, `approvedQuantity` disamakan
dengan `requestedQuantity` saat pool item dibuat. Ini standin, bukan keputusan akhir;
Request Alat (langkah 4) akan memberi approvedQuantity makna yang sebenarnya.

### Satu pool item bisa dipakai beberapa alokasi berurutan — diuji, bukan diasumsikan

ERD menyatakan relasi `equipment_pool_items → sub_project_equipment_allocations`
sebagai 1:N. Diuji langsung: pool item yang alokasinya sudah `completed` berhasil
dialokasikan lagi ke tahapan yang sama, menghasilkan baris alokasi kedua yang
independen. Ini yang membuat penggantian unit bekerja benar (lihat CLAUDE.md
"Utang Desain" poin 1) — unit lama dan penggantinya tetap punya baris alokasi
masing-masing dengan jam kerja masing-masing (disambungkan penuh di P4).

### `allocation:receive` dipisah dari `allocation:create`

Yang mengalokasikan (Divisi Alat, keputusan administratif) dan yang menerima
fisik unit di lokasi (Lapangan, konfirmasi lapangan) adalah dua wewenang
berbeda — pola yang sama dengan pemisahan pengaju/penyetuju di purchase
request. `receive` BUKAN transisi status: `status` tetap `assigned` sebelum dan
sesudah, hanya `receivedAt`/`receivedBy` yang terisi. Ini menggantikan nilai
enum `received_at_site` yang sudah dihapus di P1 — kapan dan siapa yang
menerima sudah terjawab penuh oleh dua kolom timestamp ini.

### Guard unit alat dipakai dari pola yang sudah ada

Unit yang boleh masuk pool (lewat `addItem` atau `bindItemUnit`) tunduk pada
pemeriksaan yang SAMA dengan `createWorkhourLog`: tidak boleh `maintenance`
atau `retired`. Alasannya identik — merencanakan alat yang sedang ditangani
untuk pekerjaan baru tidak masuk akal, sama seperti mencatat jam kerja untuknya
tidak masuk akal. Ditambah satu guard baru yang tidak ada presedennya: satu unit
fisik tidak boleh terikat ke pool item lain yang masih hidup
(`available`/`assigned`) di pool manapun — dua pool aktif tidak boleh mengklaim
unit yang sama.

### C3/C4 — SENGAJA BELUM dikerjakan di P3

Tabel dan endpoint alokasi sudah hidup dan teruji penuh, tapi:
- **C3** (field turunan `assignment` pada `GET /equipment/items`) dan
- **C4** (cek alokasi aktif sebelum arsip alat di `divisi-alat.service.js`)

keduanya menyentuh modul Divisi Alat yang sudah stabil, dan ditahan sampai **P4**
supaya perubahannya satu paket dengan migrasi *contract* `equipment_workhour_logs`
— menghindari menyentuh file yang sama dua kali di dua commit terpisah untuk
alasan yang sebenarnya satu.

---

## P4 — Rework workhour & penutupan backlog C (4 Oktober 2026)

### Aturan konteks ditegakkan DUA KALI, sengaja

`CONTEXT_BY_SOURCE` di `divisi-alat.service.js` menolak lebih dulu dengan pesan
yang menyebut apa yang kurang dan kenapa. CHECK constraint di database menjaga
tidak ada jalan masuk lain yang melanggarnya — seeder, skrip migrasi data, atau
query manual sekalipun.

Ini bukan duplikasi yang dilarang prinsip "satu fakta hidup di satu tempat".
Yang diduplikasi bukan FAKTA melainkan PENJAGAANNYA, dan keduanya menjaga pada
lapisan berbeda: service menjaga pengalaman pengguna API, CHECK menjaga
integritas tabel dari semua penulis.

### `equipment_item_id` jadi kolom terkelola sistem

Untuk `internal_project` dan `external_rental`, unit alat dibaca DARI
alokasi/pool item. Kiriman klien yang tidak cocok **ditolak 400**, bukan
diam-diam ditimpa — supaya salah input ketahuan pengirimnya, bukan terkubur.

`manual_adjustment` tetap menerima `equipmentItemId` dari klien karena memang
tidak lewat proyek manapun. Inilah yang membuat kolom ini tidak bisa dihapus
(sudah dijelaskan di bagian P1), dan sekarang terbukti terpakai: 45 dari 47 baris
di database adalah `manual_adjustment`.

### Guard tambahan di luar ERD

- **Alokasi harus masih `assigned`.** Mencatat jam kerja pada alokasi yang sudah
  `completed`/`returned` berarti menambah angka ke pekerjaan yang sudah ditutup.
- **Konteks harus terikat unit spesifik.** Pool item "TBD" (belum ditentukan
  unitnya) ditolak 409 — tidak mungkin mencatat jam kerja alat yang belum
  diketahui alatnya yang mana.
- **`sourceType` dan pemilik pool harus searah.** Pool item milik construction
  project ditolak untuk `external_rental` dengan pesan yang mengarahkan ke
  alokasi. Tanpa ini, satu pekerjaan bisa tercatat lewat dua jalur berbeda.
- **Jeda tidak boleh melebihi rentang kerjanya.** Tanpa guard ini
  `paused_duration_minutes` bisa diisi angka yang membuat jam kerja bersih
  negatif tanpa ada yang menolak.

### `assignment` dibuat batch, bukan per baris

`findActiveAssignment(itemIds)` mengambil satu query untuk sehalaman alat dan
mengembalikan Map. Kalau dibuat per baris, `GET /equipment/items` dengan limit 20
akan menembak 40 query. Alokasi internal ditulis belakangan ke Map supaya menang
atas pool item kalau sebuah unit terbaca di dua jalur — konsisten dengan aturan
"alokasi adalah sumber kebenaran penugasan".

### Bug P3 yang ketahuan saat pengujian P4

Pool yang sudah `closed` masih menahan unitnya: item-nya tertinggal berstatus
`available` di dalam pool mati, dan karena satu unit fisik tidak boleh dipegang
dua pool item hidup sekaligus, unitnya **terkunci selamanya**.

Lolos dari pengujian P3 karena penutupan pool diuji sebagai langkah terakhir —
tidak pernah dicoba memakai lagi unitnya sesudah itu. Diperbaiki dua sisi:
menutup pool sekarang meng-cascade item `available` menjadi
`completed`/`cancelled`, dan pemeriksaan "dipegang pool lain" hanya menghitung
pool berstatus `draft`/`active`. Dua baris yang terlanjur tertinggal dirapikan.

### Migrasi contract — dijalankan 5 Oktober 2026

`DROP COLUMN project_id, sub_project_id` + 2 CHECK constraint per `source_type`.
Sempat ditahan sehari di luar `prisma/migrations/` menunggu konfirmasi developer
lain yang memakai database dev bersama — bukan karena ragu desainnya, tapi karena
`DROP COLUMN` tidak bisa dibatalkan dan cabang kerja orang lain bisa ikut rusak.

**Keputusan desainnya sendiri sudah bulat jauh sebelumnya.** Ditelusuri ke
`AIsession/1-session.md`: pembahasannya berevolusi tiga kali, dari "simpan
ketiganya" menjadi "cukup alokasi saja", dengan alasan paling konkret berupa
contoh inkonsistensi yang mungkin terjadi — alokasi menunjuk Excavator EXC-001
sementara `equipment_item_id` menunjuk Dump Truck DT-001. `session1.md` bahkan
sudah menyebut eksplisit: *"project_id/sub_project_id lama dihapus total, bukan
dibiarkan nganggur"*.

Satu hal berevolusi di tengah jalan: sesi sempat menyebut
`external_rental_project_item_id`, lalu diganti `equipment_pool_item_id` saat
pool dibuat generic. Yang dipakai adalah yang kedua.

**Diverifikasi sebelum dijalankan** (49 baris: 46 `manual_adjustment`,
3 `internal_project`): 0 baris memakai kolom lama, 0 melanggar kedua CHECK.
**Diverifikasi sesudahnya:** kolom hilang, 2 CHECK terpasang, 49 baris utuh,
drift schema↔database nol, dan CHECK terbukti menolak pelanggaran lewat SQL
mentah yang menembus service.

---

## Jebakan Express 5 — `.toInt()` pada query tidak berfungsi (4 Oktober 2026)

Ditemukan saat menguji `sandbox/api-tester`, bukan saat menulis kode.

Express 5 menjadikan `req.query` **getter read-only**. Sanitizer express-validator
seperti `.toInt()` pada `query('limit')` karena itu **tidak bisa menulis balik** —
tidak melempar error, tidak ada peringatan, nilainya tetap string. Prisma lalu
menolaknya di kedalaman:

```
Argument `take`: Invalid value provided. Expected Int, provided String.
```

**Kenapa lolos dari seluruh pengujian P2–P5:** saya tidak pernah mengirim
`?limit=` ke endpoint modul Project. Default `limit = 20` dari destructuring
adalah angka sungguhan, jadi semuanya terlihat benar. Yang pertama mengirim
`?limit=50` adalah tester — dan langsung gagal.

Modul Divisi Alat tidak kena karena sejak awal mengkonversi di controller
(`pageParams(req)`), tidak mengandalkan sanitizer. Pola itu benar; modul Project
yang menyimpang.

**Perbaikannya di akar, bukan di tempat kejadian:**
- `utils/query.js` berisi `pageParams`, `numQuery`, `boolQuery` dengan jebakannya
  ditulis panjang di komentar
- Tiga salinan `pageParams`/`boolQuery` di controller Divisi Alat disatukan ke sana
- **`.toInt()` dihapus dari semua `query(...)`** — membiarkannya lebih buruk
  daripada tidak ada, karena menipu pembaca berikutnya seolah konversi sudah ditangani
- `param(...)` dan `body(...)` tetap memakai `.toInt()`: `req.params` dan
  `req.body` objek biasa yang bisa ditulis, jadi di sana sanitizernya sungguhan jalan
- Dicatat di `CLAUDE.md` bagian Coding Conventions supaya modul berikutnya tidak
  mengulanginya

---

## Dokumen terkait

- **`../skema-tenaga-kerja-harian.md`** — spesifikasi tenaga kerja harian untuk
  Build Order langkah 7. Menyentuh modul ini lewat `sub_projects`, dan menyimpang
  dari ERD Finance Field secara sadar (model per-orang menggantikan model agregat).
  Ditulis sekarang supaya keputusannya tidak hilang sampai langkah 7 dikerjakan.

---

## Guard yang ditegakkan kode, bukan diharapkan

- Progress harian hanya bisa dicatat pada tahapan berstatus `active`. `planned`
  berarti pekerjaannya belum dimulai secara kontrak.
- Construction project tidak bisa ditutup kalau masih ada tahapan `planned`/`active`.
- Tahapan tidak bisa ditutup kalau masih ada alat teralokasi (`status='assigned'`).
- `completed` dan `cancelled` bersifat FINAL untuk project maupun tahapan; datanya
  tidak bisa diubah lagi.
- `subProjectType` dan `progressDate` immutable — keduanya bagian dari identitas
  unique barisnya. Salah berarti barisnya salah, bukan nilainya perlu digeser.
- **Tahapan `cancelled` tidak ikut menghitung `totalContractValue`** project —
  pekerjaannya tidak akan dikerjakan. Dilaporkan terpisah sebagai
  `cancelledContractValue`.
