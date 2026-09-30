# Backlog Frontend — ConstructERP

Berisi apa yang **backend sudah
sediakan** tapi FE belum pakai, dan di mana bentuk data FE berbeda dari API.

Terakhir diperbarui: 30 September 2026.

**Dokumen pendamping:**
- `purchase-request-schema.md` S7 — bentuk payload purchase request

---

## Cara memanggil API

Sudah ada dan jangan diubah: `apiRequest()` di `src/services/api.js` sudah
memasang `Authorization: Bearer <token>` dari localStorage dan melempar
`ApiError` berisi `status` dan `errors`. Prefix modul alat ada di
`alatService.js`:

```js
const ALAT_API_PREFIX = import.meta.env.VITE_ALAT_API_PREFIX || '/api/equipment';
```

Semua endpoint di dokumen ini memakai prefix itu.

### Bentuk response yang konsisten di seluruh API

```jsonc
// Satu objek — 200/201
{ "success": true, "message": "Berhasil", "data": { } }

// Daftar berhalaman — 200
{ "success": true, "data": [ ], "meta": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 } }

// Gagal validasi — 400
{ "success": false, "message": "Validasi gagal",
  "errors": [ { "field": "amount", "message": "Nominal harus lebih dari 0" } ] }

// Gagal lain — 401/403/404/409
{ "success": false, "message": "penjelasan yang bisa langsung ditampilkan ke pengguna" }
```

Pesan pada `message` ditulis untuk dibaca pengguna akhir, bukan hanya developer —
boleh ditampilkan apa adanya.

---

## Urutan pengerjaan yang disarankan

| Prioritas | Butir | Kenapa |
|---|---|---|
| 1 | **E4** Purchase Order | Satu-satunya yang **gagal 400 di layar pengguna** sekarang |
| 2 | **E4c** Kas Alat | Backend baru selesai; FE masih localStorage penuh |
| 3 | **E3** `hasPermission` | Akan bikin super_admin dapat 403 saat layar approval dibuat |
| 4 | E5, E6 | Kebersihan kode, tidak mendesak |

---

## E1. Kaitan order pembelian pada reset maintenance — SEBAGIAN BERES

`ResetMaintenancePage.jsx` dulu mengirim `purchaseOrderId` + `purchaseOrderCode`
ke `POST /equipment/maintenance-records`. Backend menamainya `purchaseRequestId`,
jadi keduanya diabaikan tanpa error — request balas `201` tapi
`purchase_request_id` tersimpan `null`.

**Sudah dikerjakan 28 Sep:** kedua field dihapus dari payload, bukan sekadar
diganti nama. Sebabnya `selectedPurchaseOrderId` berasal dari mock localStorage,
bukan id purchase request sungguhan — diuji, mengirimnya justru dibalas **409**
karena foreign key. Mengganti nama saja akan mengubah kehilangan data diam-diam
menjadi kegagalan total.

**Sisa pekerjaan:** aktifkan `purchaseRequestId: Number(selectedPurchaseOrderId)`
(ada sebagai TODO di file itu) begitu E4 selesai dan daftar PO berasal dari API.
Sampai itu terjadi, kaitan "servis ini dibiayai order yang mana" memang belum
tercatat — tapi sekarang jelas kenapa, bukan hilang tanpa jejak.

## E2. Reset jadwal servis lewat penyelesaian kerusakan — DITUTUP

Catatan sebelumnya keliru. FE tidak mengirim `maintenanceSettingId` saat resolve
kerusakan, dan itu **memang benar**: reset perawatan rutin adalah aksi manual
terpisah di halaman Maintenance, dan aspek perawatan tidak boleh menumpang order
perbaikan karena kategori ordernya berbeda.

Yang salah justru backend — `PUT /damage-logs/{id}/resolve` masih *menerima*
parameter itu dan akan mereset counter kalau dikirim. Pengamanan yang bergantung
pada kebetulan FE tidak mengirimnya.

**Sudah dikerjakan 28 Sep:** parameter dibuang dari service dan validator.
Mengirimnya sekarang dibalas 400 dengan pesan yang mengarahkan ke halaman
Maintenance. Aturannya ditegakkan, bukan diharapkan.

## E3. `hasPermission()` mem-bypass super_admin — akan bertabrakan dengan PR

`apps/web/src/services/permissions.js`:

```js
return user.roles?.includes('super_admin') || user.permissions?.includes(permission);
```

Untuk semua modul lama ini benar. **Untuk purchase request ini salah**: backend
memakai `authorizeStrict()` yang sengaja TIDAK mem-bypass super_admin pada
`validate` dan `approve`.

Akibatnya nanti: super_admin melihat tombol "Validasi" dan "Setujui", menekannya,
lalu dapat 403. Diverifikasi lewat login sungguhan — permission super_admin
memang hanya `read, create, update`.

Perbaikan saat membangun halaman approval: untuk dua aksi itu cek
`user.permissions.includes(...)` langsung, jangan lewat `hasPermission()`. Atau
tambahkan parameter kedua, mis. `hasPermission('purchase-request:approve', { allowSuperAdmin: false })`.

## E4. Integrasi Purchase Order FE memakai bentuk lama — gagal 400 — PRIORITAS

**Koreksi catatan sebelumnya:** FE *sudah* memanggil endpoint purchase request.
`purchaseOrderService.js` memanggilnya di tiga tempat (baris 132, 161, 227) dengan
path literal `/api/equipment/purchase-requests`.

Masalahnya payloadnya mengikuti desain ERD **lama**, dari swagger sebelum struktur
per-kategori dirombak. Diuji langsung dengan payload aslinya:

```
POST /api/equipment/purchase-requests  ->  400
   orderCategory: Kategori order wajib diisi
```

Perbandingan bentuknya:

| | FE kirim sekarang | Backend harapkan |
|---|---|---|
| Kategori | *(tidak ada)* | `orderCategory`: `repair` / `maintenance` / `stock` — **wajib** |
| Tujuan | `purpose`, `description` | *(dihapus — kategori order sudah menjawabnya)* |
| Item | satu array datar `items` | `repairItems` / `maintenanceItems` / `stockItems`, sesuai kategori |
| Jenis barang | `itemType` per item | *(dihapus — struktur tabel yang membedakan)* |
| Satuan | `unit` per item | *(tidak ada kolomnya)* |
| Acuan | `damageLogId` **atau** `maintenanceSettingId` bercampur dalam satu array | terpisah: `repairItems[].damageLogId`, `maintenanceItems[].maintenanceSettingId` |
| Sparepart | sejajar dengan item lain | **bersarang**: `repairItems[].spareparts[]` |

Bentuk yang benar per kategori ada di
`purchase-request-schema.md` S7.

Catatan: `catch` di `createPurchaseOrderRequest` hanya jatuh ke localStorage untuk
status 404/405/501/0. **400 diteruskan sebagai error**, jadi kegagalan ini terlihat
di layar pengguna, bukan tersembunyi.

**Yang sudah benar dan jangan diubah:** `normalizeApiOrder()` sudah memetakan
`requestCode` dari API menjadi `orderCode` di dalam FE (baris 69). Itu pola yang
tepat — nama data model boleh berbeda dari istilah tampilan. Keputusan 28 Sep:
backend tetap memakai `requestCode`, `repairItems`, `maintenanceItems`,
`stockItems`; FE bebas menampilkannya sebagai "Purchase Order".

## E4b. Income Claim dan Project masih mock localStorage

`incomeClaimService.js` dan `maintenanceThresholdService.js` sepenuhnya
localStorage, dan backendnya memang belum ada — Income langkah 6, Project
langkah 2.

## E4c. `kasService.js` masih localStorage — PRIORITAS

Diperiksa 29 September 2026, setelah Batch 5 selesai. **Tidak ada satu pun
pemanggilan `/api/equipment/cash` di seluruh `apps/web/`.** `kasService.js`
(241 baris) sepenuhnya localStorage dengan 5 baris seed dummy, dan
`KasPage.jsx` (408 baris) memakainya langsung.

### Bagian yang memang hanya penamaan

| FE sekarang | Backend |
|---|---|
| `date` | `transactionDate` |
| `nominal` | `amount` |
| `type: 'masuk' / 'keluar'` | `transactionType: 'cash_in' / 'cash_out'` |

Seam-nya sudah ada: `normalizeTransaction()` di `kasService.js` tinggal diubah
memetakan dari bentuk API, persis pola `normalizeItem()` di `alatService.js`.
Pemanggilnya pakai `apiRequest` dari `services/api.js` dengan prefix
`ALAT_API_PREFIX` — sama seperti service alat yang sudah tersambung.

### Lima hal yang BUKAN penamaan

**1. Semua fungsi sinkron → asinkron.** `getKasSummary()`,
`getKasTransactions()`, `createKasTransaction()`, `deleteKasTransaction()`
semuanya sinkron sekarang, dan `KasPage.jsx` memanggilnya langsung di dalam
`try/catch` biasa (`loadData`, `handleSaveTransaction`, `handleDelete`). Begitu
jadi panggilan API, ketiganya harus `await` + butuh state loading. Ini menyentuh
KasPage, bukan cuma service-nya.

**2. Kategori: dari enum hardcode jadi data dari API.** `CATEGORY_OPTIONS` di FE
berisi 3 nilai tetap (`income_claim`, `purchase_request`, `other`) yang **tidak
ada padanannya** di backend. Backend punya 8 kategori di tabel master yang boleh
ditambah/dinonaktifkan Divisi Alat lewat API. Yang perlu dikerjakan:
- ambil `GET /cash/categories` sekali saat halaman dibuka, simpan sebagai state
- dropdown kategori pada form **disaring per arah transaksi** — kategori
  `cash_in` hanya muncul saat type `masuk`. Backend menolak 400 kalau tidak cocok
- form sekarang mengunci kategori (`value="other" disabled`) — itu harus jadi
  dropdown sungguhan
- filter kategori di tabel ikut memakai daftar yang sama, bukan enum

**Kategori bermapping JANGAN ditawarkan untuk catatan manual** . Saring dropdown supaya kategori yang punya `orderCategory`
(`Perbaikan Alat`, `Perawatan Berkala`, `Stok Gudang`) tidak muncul saat
mencatat transaksi manual. Untuk sekarang pembelian semacam itu wajib lewat
purchase request, sekalipun barangnya sudah terlanjur dibeli dan pengajuannya
jadi formalitas belakangan.

Kategori yang tersisa untuk form manual: **Saldo Awal / Injeksi Dana**,
**Koreksi Masuk**, **Operasional Divisi**, **Koreksi Keluar**.

Catatan penting: **backend tetap mengizinkannya.** Pembatasan ini murni di FE,
sengaja, supaya kalau client nanti minta jalur pencatatan tunai langsung,
perubahannya cukup melepas saringan di dropdown tanpa menyentuh backend sama
sekali. Yang dijaga di sini kebijakan ("belanja harus lewat pengajuan"), bukan
kebenaran data, jadi aman tinggal di FE.

**3. `sourceType` konsep yang belum ada sama sekali di FE.** Wajib diisi saat
create. Untuk catatan manual pilihannya `opening_balance`, `manual_expense`,
`adjustment` — yang lain milik sistem dan ditolak 400.
**Saran:** satu dropdown "Sumber" berisi 3 pilihan itu, disaring per arah
(`opening_balance` hanya untuk masuk, `manual_expense` hanya untuk keluar,
`adjustment` dua-duanya). Menurunkannya dari nama kategori terlihat lebih ringkas
tapi rapuh — nama kategori boleh diubah Divisi Alat kapan saja.

**4. Hapus → batalkan.** Backend tidak punya DELETE; yang ada
`PUT /transactions/{id}/void` dengan `voidReason` **wajib** (maks 500 karakter).

Ini bukan sekadar ganti tulisan tombol, tapi juga bukan pekerjaan besar:
`confirm()` hanya mengembalikan true/false sehingga tidak bisa menampung alasan,
jadi fungsinya diganti `prompt()`. Satu baris lebih panjang:

```js
const reason = window.prompt(`Alasan membatalkan ${row.transactionCode}?`);
if (!reason?.trim()) return;               // pengguna batal, atau alasan kosong
await voidKasTransaction(row.id, reason.trim());
```

Modal kecil lebih rapi kalau sempat, tapi **bukan syarat** — `prompt` sudah
memenuhi kontraknya. Baris yang dibatalkan tidak hilang; backend
menyembunyikannya kecuali `includeVoided=true`.

**5. Filter dan pagination pindah ke server.** Sekarang semuanya di browser:
`getKasTransactions()` memfilter array di JS, `KasPage` memotong sendiri dengan
`PAGE_SIZE = 8`. Backend sudah paginated dan mengembalikan
`meta.total/page/limit/totalPages`. Kalau dibiarkan client-side, FE harus menarik
seluruh tabel kas setiap kali halaman dibuka.

### Kolom "Unit" — DIHAPUS (keputusan 29 September 2026)

FE menampilkan kolom "Unit" dan dropdown unit alat pada form. Tabel
`equipment_cash_transaction` tidak punya kolom itu, dan **diputuskan tidak
ditambahkan** — bukan dengan kolom nullable sekalipun.

Alasannya sejalan dengan prinsip "satu fakta hidup di satu tempat": belanja stok
gudang memang tidak terikat unit mana pun, dan biaya perbaikan sudah terikat unit
lewat `damage_logs` pada purchase request-nya. Kolom nullable hanya akan
menghasilkan kolom yang kadang terisi kadang tidak, tanpa ada yang bisa memastikan
artinya — dan laporan biaya per unit tetap tidak bisa dipercaya karena baris
otomatis tidak akan pernah mengisinya.

Yang perlu dibuang dari FE: kolom "Unit" di tabel, dropdown unit di form,
`unitAlat` di state form dan di `normalizeTransaction()`, `UNIT_OPTIONS`, dan
`getEquipmentUnitOptions()` (satu-satunya pemakainya adalah form ini).

### Yang sudah benar dan jangan diubah

Larangan mengubah/menghapus baris otomatis sudah ada di FE
(`updateKasTransaction` dan `deleteKasTransaction` menolak `source !== 'manual'`).
Niatnya sama persis dengan `isSystemGenerated` dari backend — tinggal sumber
kebenarannya dipindah dari tebakan FE ke field yang dikirim API.

### Kontrak API Kas Alat

Semua contoh di bawah **diambil dari API yang berjalan**, bukan ditulis dari
ingatan. Prefix `/api/equipment`. Semua butuh header
`Authorization: Bearer <token>`.

| Method | Path | Permission |
|---|---|---|
| GET | `/cash/balance` | `cash:read` |
| GET | `/cash/summary?dateFrom=&dateTo=` | `cash:read` |
| GET | `/cash/categories?transactionType=&isActive=&orderCategory=` | `cash:read` |
| GET | `/cash/transactions?page=&limit=&transactionType=&categoryId=&sourceType=&dateFrom=&dateTo=&includeVoided=&search=` | `cash:read` |
| GET | `/cash/transactions/{id}` | `cash:read` |
| POST | `/cash/transactions` | `cash:create` |
| PUT | `/cash/transactions/{id}` | `cash:update` |
| PUT | `/cash/transactions/{id}/void` | `cash:update` |

Kategori juga bisa dikelola (`POST`/`PUT`/`DELETE /cash/categories`), tapi untuk
layar Kas cukup `GET` saja.

**Role yang punya aksesnya:** `divisi_alat` (read/create/update/delete),
`admin` dan `finance` (read saja), `lapangan` tidak sama sekali.

#### GET /cash/balance

```jsonc
{ "success": true, "message": "Success",
  "data": { "totalIn": 25000000, "totalOut": 450000, "balance": 24550000 } }
```

`balance` **boleh negatif** — itu disengaja, bukan bug. Divisi Alat boleh
mengajukan order melebihi saldo; Finance yang memutuskan mencairkannya atau
tidak, dengan proyeksi saldo ditampilkan di layar approval. Jadi jangan
memblokir tampilan atau menolak render saat saldo minus.

#### GET /cash/summary?dateFrom=2026-09-01&dateTo=2026-09-30

```jsonc
{ "success": true, "data": {
    "balance": 24550000, "totalIn": 25000000, "totalOut": 450000,
    "period": { "dateFrom": "2026-09-01", "dateTo": "2026-09-30",
                "totalIn": 25000000, "totalOut": 450000, "net": 24550000 },
    "byCategory": [
      { "categoryId": 2, "categoryName": "Saldo Awal / Injeksi Dana",
        "transactionType": "cash_in", "total": 25000000, "transactionCount": 1 },
      { "categoryId": 7, "categoryName": "Operasional Divisi",
        "transactionType": "cash_out", "total": 450000, "transactionCount": 1 }
    ] } }
```

**Penting:** `balance` di level atas SELALU seluruh riwayat — itu uang yang
benar-benar ada. `dateFrom`/`dateTo` hanya menyaring `period` dan `byCategory`.
Untuk kartu "pemasukan/pengeluaran bulan ini" yang sekarang dihitung
`getKasSummary()` di FE, pakai `period` dengan rentang bulan berjalan.

#### GET /cash/categories

```jsonc
{ "success": true, "data": [
    { "id": 2, "categoryName": "Saldo Awal / Injeksi Dana", "transactionType": "cash_in",
      "orderCategory": null, "description": "Saldo pembuka dan penambahan dana langsung dari Finance",
      "isActive": true, "transactionCount": 0,
      "createdAt": "...", "updatedAt": "..." },
    { "id": 4, "categoryName": "Perbaikan Alat", "transactionType": "cash_out",
      "orderCategory": "repair", "description": "Sparepart dan jasa untuk menangani kerusakan",
      "isActive": true, "transactionCount": 0, "createdAt": "...", "updatedAt": "..." }
  ] }
```

Delapan kategori hasil seed, urut per `transactionType` lalu nama:

| id | Arah | Nama | orderCategory |
|---|---|---|---|
| 1 | cash_in | Alokasi Dana dari Klaim Pendapatan | — |
| 3 | cash_in | Koreksi Masuk | — |
| 2 | cash_in | Saldo Awal / Injeksi Dana | — |
| 8 | cash_out | Koreksi Keluar | — |
| 7 | cash_out | Operasional Divisi | — |
| 5 | cash_out | Perawatan Berkala | `maintenance` |
| 4 | cash_out | Perbaikan Alat | `repair` |
| 11 | cash_out | Stok Gudang | `stock` |

**Jangan hardcode id-nya** — Divisi Alat boleh menambah kategori lewat API, dan
id di atas hanya potret database dev hari ini. Saring dropdown dengan
`transactionType` dan `isActive`, bukan dengan daftar id.

`orderCategory` menandai kategori yang dipakai sistem saat mencairkan order.
Backend mengizinkan kategori ini dipakai baris manual juga, tapi **untuk sekarang
FE menyaringnya keluar dari form manual** — lihat keputusan di E4c. Jadi:
tampilkan di tabel dan filter, sembunyikan di dropdown form.

#### GET /cash/transactions?page=1&limit=20

```jsonc
{ "success": true,
  "data": [ { /* bentuk transaksi, lihat di bawah */ } ],
  "meta": { "total": 2, "page": 1, "limit": 2, "totalPages": 1 } }
```

Urut `transactionDate` desc lalu `id` desc. Baris yang dibatalkan
**disembunyikan** kecuali `includeVoided=true`.

#### Bentuk satu transaksi

```jsonc
{
  "id": 13,
  "transactionCode": "KAS-000001",      // dibuat sistem, jangan dikirim
  "transactionDate": "2026-09-30",      // YYYY-MM-DD
  "transactionType": "cash_in",         // cash_in | cash_out
  "category": { "id": 2, "categoryName": "Saldo Awal / Injeksi Dana",
                "transactionType": "cash_in", "orderCategory": null },
  "amount": 25000000,                   // number, bukan string
  "sourceType": "opening_balance",
  "sourceId": null,                     // terisi hanya pada baris sistem
  "description": "Injeksi dana awal Oktober",
  "isSystemGenerated": false,           // true -> sembunyikan tombol ubah & batalkan
  "isVoided": false,
  "voidReason": null,
  "voidedBy": null,                     // { id, username, fullName } saat dibatalkan
  "voidedAt": null,
  "createdBy": { "id": 6, "username": "alat", "fullName": "Staf Divisi Alat" },
  "createdAt": "2026-09-30T13:42:41.722Z",
  "updatedAt": "2026-09-30T13:42:41.722Z"
}
```

`isSystemGenerated` menggantikan tebakan `source !== 'manual'` yang sekarang
dipakai FE. Pakai field ini, jangan hitung sendiri.

#### POST /cash/transactions

```jsonc
// request — SEMUA field di bawah wajib
{
  "transactionDate": "2026-09-30",
  "transactionType": "cash_in",
  "categoryId": 2,
  "amount": 25000000,
  "sourceType": "opening_balance",
  "description": "Injeksi dana awal Oktober"
}
// 201 -> { "success": true, "message": "Transaksi kas berhasil dicatat", "data": { ...transaksi } }
```

Aturan yang ditegakkan backend:

- `amount` harus **> 0**. Arah uang ditentukan `transactionType`, bukan tanda minus
- `transactionDate` tidak boleh di masa depan. **Tanggal mundur dibolehkan**
- `sourceType` untuk catatan manual hanya `opening_balance`, `manual_expense`,
  `adjustment`. Dua lainnya milik sistem dan dibalas 400
- arah sumber: `opening_balance` hanya `cash_in`, `manual_expense` hanya
  `cash_out`, `adjustment` dua-duanya
- `category.transactionType` harus sama dengan `transactionType` barisnya
- `transactionCode`, `sourceId`, `isVoided`, `voidReason` **ditolak 400** kalau
  dikirim — semuanya diisi sistem

#### PUT /cash/transactions/{id}

Hanya `transactionDate`, `categoryId`, `amount`, `description` yang boleh
dikirim, semuanya opsional. `transactionType` dan `sourceType` ditolak 400 —
keduanya menentukan ARTI baris; kalau salah, batalkan lalu catat yang benar.
Baris sistem dan baris yang sudah dibatalkan ditolak 409.

#### PUT /cash/transactions/{id}/void

```jsonc
// request
{ "voidReason": "Salah catat, nota dobel" }   // wajib, maks 500 karakter
// 200 -> data.isVoided = true, voidReason/voidedBy/voidedAt terisi
```

**Tidak ada DELETE.** Barisnya tidak dihapus supaya jejaknya tetap ada; yang
dibatalkan tidak ikut dihitung ke saldo. Alasannya wajib karena justru itu yang
membuat pembatalan lebih berguna daripada penghapusan: baris mati tanpa
keterangan sama tidak bergunanya, hanya lebih berantakan. Contoh pemakaiannya
ada di E4c poin 4.

#### Bentuk galat yang perlu ditangani

```jsonc
// 400 gagal validasi — ada array errors per field
{ "success": false, "message": "Validasi gagal",
  "errors": [ { "field": "description",
                "message": "Keterangan wajib diisi — tanpa itu baris kas tidak bisa ditelusuri" } ] }

// 400 aturan bisnis — hanya message, tidak ada errors
{ "success": false,
  "message": "Kategori \"Operasional Divisi\" adalah kategori cash_out, tidak bisa dipakai transaksi cash_in" }

// 403 permission kurang
{ "success": false, "message": "Tidak memiliki akses" }

// 409 baris sistem / sudah dibatalkan
{ "success": false, "message": "Transaksi KAS-000003 lahir dari dokumen equipment_purchase_request dan tidak bisa diubah di sini. Batalkan dokumennya, bukan catatan kasnya." }
```

`ApiError` dari `services/api.js` sudah membawa `status` dan `errors`, jadi
penanganannya: kalau ada `errors` tempelkan per field di form; kalau tidak,
tampilkan `message` apa adanya — pesannya memang ditulis untuk pengguna akhir.

#### Yang perlu dicek sebelum mulai

Jalankan `npm run db:seed` di `apps/api` lebih dulu. Tanpa itu permission
`cash:*` belum ada di database dan **semua panggilan dibalas 403**. Seeder ini
idempoten — aman dijalankan berkali-kali, data demo dilewati otomatis.

## E5. Field `level` dikirim tapi tidak ada di backend — ringan

`DamageLogFormPage.jsx` mengirim `level: 'minor'|'critical'` yang diabaikan
backend. Ini **sesuai desain** — level cuma tampilan FE, dan pemetaannya ke
`stopsOperation: form.level === 'critical'` sudah benar. Cukup dibuang dari
payload supaya tidak menyesatkan pembaca kode.

## E6. Kode mati: `DamageLogModal.jsx`

Sudah tidak diimpor siapa pun sejak halaman form menggantikannya. Versi ini tidak
punya input tanggal dan memaksa `damageDate = hari input` — kalau suatu saat
dipakai lagi tanpa diperiksa, tanggal kejadian akan salah. Sebaiknya dihapus.

## E7. Status dropdown — SUDAH BERES

Catatan sebelumnya soal `available`/`assigned_to_location` **sudah tidak berlaku**.
`EQUIPMENT_STATUS_OPTIONS` kini `operational`/`maintenance`/`retired`, lengkap
dengan peta alias untuk nilai lama.

---
