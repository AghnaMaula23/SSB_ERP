# Backlog Frontend — ConstructERP

Terakhir diaudit: 9 Oktober 2026 terhadap `origin/feature/be-div-alat` (`5de0ebc`).

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

**Diperiksa ulang 9 Oktober 2026** terhadap kode di `origin/feature/be-div-alat`
(commit `5de0ebc`). Tiga butir prioritas lama sudah dikerjakan Rafi.

| Prioritas | Butir | Kenapa |
|---|---|---|
| 1 | **E3** `hasPermission` | super_admin kini read-only: bypass FE membuat semua tombol tulis berakhir 403 |
| 2 | **E4d** `maintenanceThresholdService` | Backend-nya SUDAH ADA, tapi FE masih localStorage penuh |
| 3 | **E4e** `maintenanceService` hibrida | Separuh API separuh localStorage — paling rawan salah baca |
| 1 | **E8** pool item "Jumlah" | **Memblokir migrasi contract** pool item |
| 1 | **E9** fallback data palsu | Data dummy ikut tersimpan ke database |
| 2 | **E10** data bisnis di localStorage (damage log) | Tidak terlihat user lain, hilang saat cache dibersihkan |
| 4 | E5, E6 | Kebersihan kode, tidak mendesak |
| — | E4b `incomeClaimService` | Tetap mock, **wajar** — backend Income baru langkah 6 |

**Sudah selesai, jangan dikerjakan lagi:** E4 (Purchase Order), E4c (Kas Alat),
dan bagian Project pada E4b.

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

## E3. `hasPermission()` mem-bypass super_admin — WAJIB DIPERBAIKI (15 Okt 2026)

`apps/web/src/services/permissions.js`:

```js
return user.roles?.includes('super_admin') || user.permissions?.includes(permission);
```

**Kebijakan backend berubah 15 Okt 2026: super_admin hanya memantau** — `*:read`
di semua modul, CRUD hanya di manajemen akun. Backend tidak lagi punya bypass
apa pun (`authorizeStrict` dihapus), dan 36 permission tulis super_admin sudah
dicabut dari database.

Akibatnya bypass di FE sekarang salah **di semua modul**: super_admin melihat
tombol tambah/ubah/setujui di mana-mana, menekannya, lalu dapat 403 dengan pesan
"super_admin hanya bisa melihat data dan mengelola akun sistem".

Perbaikan: hapus `user.roles?.includes('super_admin') ||` — cukup
`user.permissions?.includes(permission)`. Permission super_admin di
`/api/auth/me` sudah mencerminkan hak aksesnya yang sebenarnya.
`ModuleSelection.jsx` (`isSuperAdmin`) juga perlu ditinjau: super_admin boleh
masuk semua modul, tapi hanya untuk melihat.

Ikut berubah: role akun sendiri tidak bisa diubah (403), dan super_admin tidak
bisa digabung role lain (409) — layar manajemen user perlu menampilkan pesan itu.

## E4. Integrasi Purchase Order — BERES (commit 2d6b0c9, 33d0070)

`purchaseOrderService.js` sekarang memakai kontrak baru: `orderCategory` di
header plus tabel item per kategori (`repairItems` / `maintenanceItems` /
`stockItems`). Diverifikasi 9 Okt: 20 kemunculan pola kontrak baru, nol
localStorage.

Catatan lama tentang payload bentuk ERD lama yang menyebabkan 400 sudah tidak
berlaku dan dihapus dari dokumen ini.

## E4b. `incomeClaimService` masih mock — WAJAR, bukan utang FE

`incomeClaimService.js` sepenuhnya localStorage (5 pemanggilan, nol API).
**Ini belum bisa dikerjakan** — backend Income & Klaim Pendapatan Alat baru
Build Order langkah 6. Biarkan sampai modulnya ada.

**KOREKSI 13 Okt 2026:** catatan sebelumnya menyebut `projectService.js` (modul
alat) "tidak lagi mock". Itu keliru. Ia memanggil `/api/projects?status=accepted`
— path itu tidak ada, dan `accepted` bukan nilai status project — lalu jatuh ke
`DUMMY_PROJECTS` diam-diam. Lihat **E9**.

## E4c. Kas Alat — BERES (commit 33d0070)

`kasService.js` sudah tidak ada; digantikan `cashService.js` yang memanggil
`/api/equipment/cash`. Diverifikasi 9 Okt: nol localStorage.

## E4d. `maintenanceThresholdService` masih localStorage — backendnya SUDAH ADA

Ditemukan 9 Oktober 2026. Berbeda dari E4b: ini **bisa dikerjakan sekarang**.

`maintenanceThresholdService.js` sepenuhnya localStorage (2 pemanggilan, nol
API), padahal backend maintenance setting sudah selesai sejak Batch 2 dan
endpoint-nya ada di `/api/equipment/items/{itemId}/maintenance-settings`.

**Akibatnya:** ambang servis yang diubah lewat layar ini tidak pernah sampai ke
database, jadi hitung mundur maintenance di backend tidak ikut bergerak. Operator
mengira sudah mengubah jadwal servis padahal tidak.

## E4e. `maintenanceService` setengah API setengah localStorage — PALING RAWAN

Ditemukan 9 Oktober 2026. `maintenanceService.js` punya 1 pemanggilan API DAN 2
pemanggilan localStorage di file yang sama.

Ini lebih berbahaya daripada mock penuh: layar yang sebagian datanya nyata dan
sebagian lagi dari localStorage **terlihat benar** sampai dua sumber itu tidak
sepakat. Mock penuh setidaknya jujur bahwa datanya belum nyata.

Perlu ditelusuri bagian mana yang masih localStorage, lalu disambungkan ke
endpoint yang sudah ada — bukan dibiarkan hibrida.

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

---

# Temuan audit 13 Oktober 2026

Dari audit `feature/be-div-alat` dan push Rafi `72c455a` (modul Admin). Build
dan lint FE bersih; semua path API yang dipanggil modul Admin cocok dengan route.

## E8. Pool item mengirim dan menampilkan kuantitas — MEMBLOKIR CONTRACT

- `admin/project/pages/PoolItemFormPage.jsx` punya input **"Jumlah"**, dan
  `projectService.addPoolItem` mengirim `requestedQuantity`.
- `admin/project/pages/EquipmentPoolPage.jsx` menampilkan
  `approvedQuantity || requestedQuantity`.

**Satu pool item = satu unit** (`docs/keputusan-desain-request-alat.md`): ia
memegang satu `equipmentItemId` dan satu alokasi menghabiskannya. "Jumlah: 3"
pada satu slot tidak punya arti. Butuh 3 unit → tambah 3 pool item. Kolom
`requested_quantity`/`approved_quantity` pool item dijadwalkan di-DROP; begitu
itu jalan, form ini ditolak backend. **Hapus input dan kolomnya dulu.**

`requestedQuantity` pada Request Alat (`rentalService` → `/api/request-alat`)
**tetap sah** — itu kuantitas item permintaan, bukan pool item.

## E9. `catch` yang diam-diam mengembalikan data palsu — FATAL

Data palsu yang ditampilkan seolah asli ikut tersimpan ke database.

1. **"Dikerjakan oleh" (maintenance & resolve damage).**
   `maintenanceService.getMaintenancePerformedByOptions()` memanggil
   `/api/users`; Divisi Alat tidak punya `user:read` → selalu 403 → FE diam-diam
   menawarkan "Tim Mekanik Internal" / "Admin Divisi Alat", dan nilai itu
   tersimpan ke `maintenance_records.performed_by`.
   **Keputusan 13 Okt: nama mekanik TIDAK dicatat** — tidak ada data master
   mekanik internal maupun eksternal. **Hapus input itu**, jangan kirim
   `performedBy`. Backend sudah opsional, tidak perlu perubahan API.
   Kolomnya dijadwalkan di-DROP bersama contract pool item.
2. **`alat/services/projectService.js`** — path yang benar
   `/api/projects/construction?status=active`. Hapus `DUMMY_PROJECTS`.

Pola umumnya: kalau API gagal, **tampilkan errornya**. Fallback ke data contoh
hanya pantas di layar yang backend-nya memang belum ada, dan harus kelihatan
sebagai contoh.

## E10. Data bisnis damage log disimpan di localStorage

`alat/information/services/damageLogActionService.js`:

- **`damage_log_action_status`** — tombol "selesaikan tindakan" pada riwayat
  tindakan hanya menulis ke browser. User lain tidak melihatnya. Konsepnya juga
  bertentangan dengan desain: `maintenance_record_status` hanya
  `completed`/`cancelled` karena record adalah histori pekerjaan yang SUDAH
  dilakukan, bukan pelacak pekerjaan berjalan. Kalau pelacakan itu dibutuhkan,
  itu keputusan desain baru — bahas dulu.
- **`damage_log_resolve_purchase_refs`** — PO yang dipilih saat resolve
  disimpan lalu **tidak pernah dibaca lagi** (`getResolvePurchaseReferences`
  tidak dipanggil di mana pun). Tautan PO ↔ damage log sudah ada di backend
  (`repairItems[].damageLogId`) dan halaman detail sudah membacanya lewat
  `ordersForDamageLog`.
- FE **mewajibkan** memilih PO approved untuk resolve; backend tidak. Perbaikan
  oleh mekanik internal tanpa pembelian sah di-resolve. Kalau aturan ini
  diinginkan, tempatnya di backend — putuskan dulu.

## E11. Data demo rental & supply tampil bercampur data asli

`rentalDemoService` dan `demoSupplyService` menambahkan baris `demo-N` ke daftar
project asli. Penandanya jelas (`isDemo`, dibersihkan saat logout), jadi bukan
fallback diam-diam — tapi **butuh sakelar untuk mematikannya sebelum produksi**.
Mock delivery, kas lapangan, dan tenaga kerja wajar: backend-nya belum ada.

## E12. Perubahan perilaku backend yang perlu diikuti FE (13 Okt 2026)

- **Alokasi pool item tanpa unit → 409.** Layar alokasi sebaiknya hanya
  menawarkan pool item yang `equipmentItemId`-nya terisi.
- **Aksi bersamaan → 409** pada approve/validate/reject/cancel PR, resolve/cancel
  damage log, void/edit kas, cancel maintenance record, dan semua aksi Request
  Alat. Tangani 409 dengan memuat ulang data, bukan menampilkannya sebagai gagal
  biasa.
- **`POST /api/auth/register` sekarang butuh login + `user:create`**
  (super_admin). FE tidak memakainya; dicatat supaya tidak ada yang membangun
  layar daftar mandiri.

## E13. API Request Material RM-1 tersedia (13 Okt 2026)

Detail keputusan: `docs/keputusan-desain-request-material.md`.

- **Master:** `GET/POST/PUT /api/materials/types`, `/api/materials/suppliers`,
  dan `GET /api/materials/units`. **Dropdown satuan WAJIB dari `/units`**, jangan
  hardcode `INVENTORY_UNITS` — validator backend memakai daftar yang sama.
- **Satuan milik jenis material (keputusan D1).** Tidak ada input satuan di
  request/delivery/receipt nanti, dan backend menolak `unit` kalau dikirim.
  Tampilkan `unit` dari response **tepat di samping setiap angka kuantitas** —
  itu pengaman utama supaya penginput sadar harus mengonversi (mis. rit → m³).
- **Material pool:** `/api/projects/material-pools` (+ items). Satu baris per
  jenis material per pool. Tidak ada angka total — jangan tampilkan kolom
  "diminta/terkirim/diterima" dari pool; angkanya datang dari modul berikutnya.
- **Supply project:** ~~field `fieldPicId`~~ — dibuang 16 Okt 2026; sekarang
  ditolak 400 kalau dikirim.
- **Data seed asli menggantikan demo (E11):**
  - `RNT-000001` sudah punya equipment pool `POOL-000004` dengan 2 unit
    (SSB-DT-001, SSB-DT-002) dan 10 log jam kerja `external_rental` —
    `rentalDemoService` untuk unit & timesheet bisa diganti
    `/api/projects/equipment-pools?externalRentalProjectId=` dan
    `/api/equipment/items/:id/workhour-logs?sourceType=external_rental`.
  - `SPL-000001` sudah punya material pool `MPL-000001`.
  - `PRJ-000001` punya material pool `MPL-000002`.
  - Delivery, inventori, kas lapangan, dan pekerja **tetap mock** — backendnya
    RM-4, RM-5, dan langkah 7.

## E14. API Request Material RM-2 + guard tahapan (14 Okt 2026)

- **`/api/request-material`**: list, detail, create, cancel, `PUT /:id/admin-validation`
  (Admin mengurangi kuantitas per item, status tetap `submitted`), `PUT /:id/reject`
  (alasan wajib). Diteruskan ke Finance & approval menyusul di RM-3.
- **Material dipilih bebas dari master** (`/api/materials/types?isActive=true`),
  tidak harus ada di pool. Satu jenis material sekali per request.
- **Jangan kirim `unit`** — ditolak 400. Tampilkan `unit` dari response di samping
  setiap kuantitas; tampilkan `effectiveQuantity` sebagai kuantitas yang berlaku
  (= `adminValidatedQuantity` kalau Admin mengubahnya, selain itu = diminta).
- **Supply:** ~~hanya PIC~~ — sejak 16 Okt 2026 Lapangan mana pun boleh mengajukan.
- **`rejectedBy`** (`admin`/`finance`) menggantikan dua status penolakan ERD.
- **Tahapan:** mengaktifkan tahapan saat tahapan lain di project yang sama masih
  `active` sekarang **409**. Tawarkan "tutup tahapan aktif dulu" di layar.

---

## E15. Form ritase / surat jalan pindah ke Divisi Lapangan (16 Okt 2026)

`admin/supply/pages/DeliveryFormPage.jsx` + `deliveryMockService.js` mencatat ritase
supply dari menu **Admin** dan di localStorage. Keputusan RM-4: delivery dicatat
**Divisi Lapangan** untuk konstruksi maupun supply (tanpa PIC).
Saat API RM-4 tersedia:

- Form pindah ke menu Lapangan; Admin cukup melihat.
- Wajib melampirkan **file surat jalan** (PDF/JPG/PNG/WebP, maks 10 MB; HEIC ditolak).
- Delivery terikat ke **request material yang sudah approved** dan satu item-nya —
  material tidak lagi dipilih bebas dari daftar `MATERIALS`.
- Supplier wajib; nomor surat jalan unik per supplier (bukan per project).
- Tidak ada edit bebas: koreksi = batalkan (dengan alasan) lalu catat ulang.

**API tersedia (16 Okt 2026)** — detail di Swagger tag *Material Delivery* & *Files*:

- `POST /api/material-deliveries` — **multipart/form-data**: field teks +
  file di field `deliveryNote`. Jangan set header `Content-Type` manual (biarkan
  browser menambahkan boundary). Wajib: `materialRequestItemId`, `supplierId`,
  `deliveredQuantity`, `deliveryNoteNumber`, `deliveryNoteDate`, `vehicleNumber`,
  `driverName`.
- `GET /api/material-deliveries?materialRequestId=&externalSupplyProjectId=&subProjectId=&cancelled=`
  — pengganti `listDeliveries(projectId)` di mock.
- `PUT /:id/delivery-note` (multipart, ganti file) dan `PUT /:id/cancel` `{ reason }` —
  hanya pencatatnya.
- Menampilkan file: `GET /api/files/{deliveryNoteFile.id}/url` → buka `data.url`
  (berlaku 5 menit; minta ulang setiap kali dibuka, JANGAN disimpan).
- Detail request material kini memuat per item `deliveredQuantity` &
  `deliveryCount` — boleh melebihi `effectiveQuantity`.
- `suggestNoteNo` di mock tidak punya padanan: nomor surat jalan diterbitkan
  supplier, jadi diketik dari dokumen fisiknya.

---

## E16. Penerimaan material & Inventory tahapan pakai API (16 Okt 2026)

API RM-5 tersedia (Swagger tag *Material Receipt* & *Material Stock*).

**Penerimaan** — layar baru di menu Lapangan, dari daftar delivery yang `receipt: null`:
- `POST /api/material-receipts` **multipart**: `materialDeliveryId`, `receivedAt`
  (waktu), `receivedQuantity` (yang datang), `acceptedQuantity` (diterima baik),
  bukti **wajib 1–5 file** di field `proofs`. Supply: `externalReceiverName` wajib
  (penerima di klien); konstruksi: jangan kirim kolom penerima eksternal.
- Delivery yang sudah diterima tidak bisa dibatalkan/diganti surat jalannya — sembunyikan
  tombolnya kalau `delivery.receipt` terisi.

**Inventory tahapan** (`admin/project/pages/Inventory*.jsx` + `fieldMockService.js`)
perlu dirombak, bukan sekadar diganti endpoint:
- Tidak ada "Tambah Barang": material berasal dari **master jenis material**, dan
  baris stok muncul sendiri begitu ada receipt atau mutasi. Nama bebas, kategori,
  satuan sendiri, dan **stok awal** dibuang — stok awal = `adjustment_in` beralasan.
- **Stok minimum** belum ada di backend (future feature) — sembunyikan dulu.
- Saldo: `GET /api/material-stock?subProjectId=` → `received`, `adjustmentIn`,
  `used`, `adjustmentOut`, `balance` per material.
- Mutasi: `POST /api/material-stock/movements` dengan `movementType`
  `used` | `adjustment_in` | `adjustment_out` (koreksi wajib `notes`). Stok tidak
  boleh minus → 409, tampilkan pesannya.
- Salah input: `PUT /api/material-stock/movements/:id/cancel` `{ reason }` — bukan
  mencatat mutasi lawan.
- Riwayat stok masuk = `GET /api/material-receipts?subProjectId=`; riwayat mutasi =
  `GET /api/material-stock/movements?subProjectId=`. Gabungkan di layar kalau perlu.

