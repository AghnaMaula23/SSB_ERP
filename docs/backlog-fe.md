# Backlog Frontend — ConstructERP

Terakhir diperbarui: 19 Oktober 2026 (audit ulang FE↔BE, lihat E27).

Berisi apa yang **backend sudah
sediakan** tapi FE belum pakai, dan di mana bentuk data FE berbeda dari API.

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

Urutan prioritas ada di **E17**.

**Sudah selesai, jangan dikerjakan lagi:** E1, E2, E4 (Purchase Order), E4c (Kas Alat),
E8, E22 bagian 1, dan bagian Project pada E4b. E3 tinggal `ModuleSelection.jsx`.

---

## E1. Kaitan order pembelian pada reset maintenance — BERES

`ResetMaintenancePage.jsx` dulu mengirim `purchaseOrderId` + `purchaseOrderCode`
ke `POST /equipment/maintenance-records`. Backend menamainya `purchaseRequestId`,
jadi keduanya diabaikan tanpa error — request balas `201` tapi
`purchase_request_id` tersimpan `null`.

**Sudah dikerjakan 28 Sep:** kedua field dihapus dari payload, bukan sekadar
diganti nama. Sebabnya `selectedPurchaseOrderId` berasal dari mock localStorage,
bukan id purchase request sungguhan — diuji, mengirimnya justru dibalas **409**
karena foreign key. Mengganti nama saja akan mengubah kehilangan data diam-diam
menjadi kegagalan total.

**Selesai:** `ResetMaintenancePage.jsx` sekarang mengirim `purchaseRequestId` dari
PO hasil `GET /api/equipment/purchase-requests`, jadi kaitan "servis ini dibiayai
order yang mana" tercatat.

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

## E3. `hasPermission()` mem-bypass super_admin — SEBAGIAN BERES (19 Okt 2026)

> **Status 19 Okt 2026:** `permissions.js` sudah beres (hanya membaca `permissions`).
> **Sisa:** `ModuleSelection.jsx:17-19` masih memakai `isSuperAdmin` untuk membuka
> kartu modul. Ganti dengan cek permission `equipment:read` / `project:read` saja —
> super_admin sudah memegang semua `:read`, jadi aksesnya tidak berubah.

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

`projectService.js` (modul alat) yang dipakai layar klaim **masih mock terselubung** —
lihat **E9** butir 2.

## E4c. Kas Alat — BERES (commit 33d0070)

`kasService.js` sudah tidak ada; digantikan `cashService.js` yang memanggil
`/api/equipment/cash`. Diverifikasi 9 Okt: nol localStorage.

## E4d. `maintenanceThresholdService` masih localStorage — endpoint TERSEDIA 16 Okt 2026

`maintenanceThresholdService.js` sepenuhnya localStorage, jadi ambang servis yang
diubah lewat layar ini tidak pernah sampai ke database dan hitung mundur
maintenance di backend tidak ikut bergerak. Sejak 16 Okt 2026 backend memakai
model yang sama dengan layar ini (ambang per **jenis alat × aspek**), dan layarnya
**dipertahankan**. Yang perlu dikerjakan:

| Fungsi di `maintenanceThresholdService.js` | Ganti dengan |
|---|---|
| `getTypeThresholds()` | `GET /api/equipment/maintenance-thresholds` (bentuk baris sama: `equipmentTypeId`, `maintenanceAspectId`, `thresholdValue`, `updatedAt`) |
| `getTypeThreshold(typeId, aspectId)` | cari dari hasil list di atas |
| `saveTypeThreshold({ equipmentTypeId, maintenanceAspectId, thresholdValue })` | `PUT /api/equipment/types/{typeId}/maintenance-thresholds/{aspectId}` `{ thresholdValue }` — tambah atau ubah |
| `deleteTypeThreshold(typeId, aspectId)` | `DELETE` path yang sama |

- Ketiganya jadi `async` → tambahkan `await` di `MaintenanceThresholdPage.jsx`.
- Form "buat aspek" di layar yang sama: **buang isian default threshold** — dikirim
  `defaultThresholdValue` sekarang ditolak 400. Fallback localStorage di
  `createMaintenanceAspect` dibuang juga (E4e).
- Prefill `aspect?.defaultThresholdValue` di `MaintenanceThresholdPage.jsx:59`
  selalu kosong (kolomnya sudah tidak ada di respons) — buang juga.
- Setting per unit **tidak lagi dibuat/dihapus manual**: backend membuatkannya
  otomatis saat unit didaftarkan. `POST /items/:itemId/maintenance-settings` dan
  `DELETE /maintenance-settings/:id` sudah tidak ada; `thresholdValue` di
  `PUT /maintenance-settings/:id` ditolak (yang tersisa hanya `isActive`).
- `thresholdValue` di respons setting tetap ada (turunan dari jenis) — grid status
  maintenance tidak perlu diubah.

## E4e. `maintenanceService` setengah API setengah localStorage — PALING RAWAN

Ditemukan 9 Oktober 2026. `maintenanceService.js` punya 1 pemanggilan API DAN 2
pemanggilan localStorage di file yang sama.

Ini lebih berbahaya daripada mock penuh: layar yang sebagian datanya nyata dan
sebagian lagi dari localStorage **terlihat benar** sampai dua sumber itu tidak
sepakat. Mock penuh setidaknya jujur bahwa datanya belum nyata.

Lokasinya (kunci `maintenance_custom_aspects`):

- `createMaintenanceAspect` — kalau request gagal tanpa status HTTP (koneksi),
  aspek disimpan ke localStorage dan dianggap berhasil.
- `getMaintenanceAspects` (baris 95) — **menggabungkan** hasil API dengan aspek
  localStorage. Inilah yang membuat datanya tampak benar padahal dua sumbernya bisa
  bertentangan: aspek yang tidak pernah ada di database ikut muncul di daftar.

Buang keduanya; kalau API gagal, tampilkan errornya — bukan dibiarkan hibrida.

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

## E8. Pool item mengirim dan menampilkan kuantitas — BERES (19 Okt 2026)

> **Status 19 Okt 2026:** input "Jumlah" dan pengiriman `requestedQuantity` pool item
> sudah dihapus dari FE. DROP kolom pool item di backend **tidak lagi terblokir FE**.

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
   Kolomnya dijadwalkan di-DROP bersama contract pool item. Semua lokasinya:
   - `DamageLogActionModal.jsx` — input saat resolve kerusakan
   - `ResetMaintenancePage.jsx` — input, riwayat nama (`performerHistory`), dan payload
   - `DamageLogDetailPage.jsx` — kolom tampilan di riwayat tindakan
   - `alatService.resolveDamageIssue` — **kode mati** (tidak dipanggil di mana pun,
     lihat E17): hapus fungsinya, jangan diperbaiki.
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
  - Delivery dan inventori: API-nya sudah tersedia — lihat E15/E16.
    Kas lapangan dan pekerja **tetap mock** — lihat E21.

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

---

# Hasil audit FE↔BE 16 Oktober 2026 (report.md)

## E17. Daftar perbaikan WAJIB — mencegah bug, tanpa fitur baru

Kriteria: merusak data, menampilkan data palsu, atau membuat alur macet. Urutan =
prioritas.

| # | Butir | Bug yang dicegah |
|---|---|---|
| 1 | **E9a** `alat/services/projectService.js` `getClaimableProjects`: memanggil `/api/projects?status=accepted` (tidak ada) lalu jatuh ke `DUMMY_PROJECTS`. Yang benar: `/api/projects/construction?status=active`, dan **hapus fallback dummy** | Klaim dibuat untuk project palsu |
| 2 | **E9b** buang isian "dikerjakan oleh" (`performedBy`) maintenance beserta `getMaintenancePerformedByOptions` (`/api/users` selalu 403 untuk divisi_alat lalu jatuh ke nama palsu) | Nama palsu tersimpan; kolom `performed_by` dijadwalkan DROP |
| 3 | **E4e** hapus fallback localStorage di `maintenanceService.js` | Aspek "tersimpan" padahal tidak ada di database |
| 4 | **E10** status tindakan damage & kaitan PO di localStorage; aturan FE "wajib PO approved untuk resolve" tidak ada di backend | Tidak terlihat user lain; aturan berbeda |
| 5 | ~~**E8** hapus input "Jumlah" pool item~~ — **BERES 19 Okt** | Memblokir migrasi backend |
| 6 | **E3** bypass super_admin — `hasPermission` **beres**, sisa `ModuleSelection` | Tombol tulis selalu berakhir 403 |
| 7 | **E4d** sambungkan layar ambang per jenis ke API (lihat E4d) | Angka ambang tidak pernah sampai ke database |
| 8 | **E11** data demo rental/supply bercampur data asli | User tidak bisa membedakan kontrak asli dari contoh |

**Tidak perlu sekarang** (tidak menimbulkan bug, bersihkan sambil lalu): kode mati
`resolveDamageIssue` di `alatService.js` (mengirim `maintenanceSettingId` yang
ditolak 400 kalau terisi), `sort/order` di `maintenanceService.js` (tidak dibaca
backend), E5 (`level`), E6, log aktivitas.

**Fitur pertama setelah daftar di atas:** layar **Finance approve PR**
(`PUT /api/equipment/purchase-requests/:id/approve` + nominal aktual, dan reject
oleh Finance). Tanpa ini alur Divisi Alat tidak pernah selesai — PR berhenti di
`waiting_finance_approval`, jadi cash-out Kas Alat dan reset maintenance berbasis PO
tidak pernah terjadi.

## E18. Form "Unit Baru" rental & form supply disederhanakan

Form terlalu detail dan masih merujuk konteks project konstruksi. Untuk request alat
`external_rental`, backend hanya butuh: `equipmentTypeId`, `requestedQuantity`,
`neededDate`, `locationDetail`, `estimatedWorkhours` (opsional), catatan.

- **Preferensi merek/model dibuang** — wewenang Divisi Alat memilih unit, bukan
  Admin/Lapangan saat mengajukan.
- **Operator & paket (include solar / supir saja)** tetap dititipkan di catatan
  untuk sekarang. Keduanya menentukan **biaya internal** (bayaran supir, BBM
  ditanggung atau tidak), bukan tagihan klien — tarif alat ke klien hanya
  workhour × rate. Kolom aslinya dirancang bersama modul pemakainya: Finance Field
  & Labor Payroll (Build Order 7).
- Form supply: buang isian yang merujuk tahapan/project konstruksi dengan cara yang sama.

## E19. API Request Material RM-3 tersedia (15 Okt 2026) — belum punya entri sebelumnya

Detail di Swagger tag *Request Material* dan `docs/keputusan-desain-request-material.md` (F1–F5).

- **Admin — rincian biaya** `PUT /api/request-material/:id/costs` `{ costs: [...] }`:
  MENGGANTI seluruh daftar, hanya selama `submitted`. `costType`:
  `material_cost` | `driver_fee` | `delivery_fee` | `loading_unloading_fee` |
  `fuel_cost` | `other`. `material_cost` wajib menunjuk `materialRequestItemId`
  (tepat satu per item); jenis lain TIDAK boleh menunjuk item. `amount` > 0.
- **Admin — teruskan** `PUT /:id/submit-to-finance` `{ notes? }`: ditolak 400 kalau
  ada item tanpa `material_cost` (pesan menyebut itemnya). Setelah ini kuantitas &
  biaya terkunci.
- **Finance — setujui** `PUT /:id/approve` `{ notes?, materialPoolId? }`
  (permission `material-request:approve`). Nominal yang disetujui = yang diajukan —
  **tidak ada isian nominal aktual** (beda dengan PR Divisi Alat). `materialPoolId`
  hanya wajib kalau project punya lebih dari satu material pool aktif (400 menyebut
  pilihannya).
- **Finance — tolak** `PUT /:id/reject` `{ notes }` pada status `waiting_finance_approval`.
- **Pemisahan tugas:** Admin yang meneruskan paket tidak bisa menyetujuinya walau
  akunnya juga ber-role finance (403). Sembunyikan tombol approve kalau
  `adminReviewedBy.id` = user login.
- Respons detail memuat `costs[]` dan `totalCostAmount` (dihitung, tidak disimpan);
  list memuat `totalCostAmount` per baris untuk antrean Finance.

## E20. API tersedia, belum ada layarnya (audit 16 Okt 2026)

Bukan bug — fitur yang menunggu layar. Dikelompokkan menurut pemakai; kartu
**Divisi Lapangan** dan **Divisi Finance** di `ModuleSelection.jsx` masih
placeholder, dan sebagian besar butir di bawah milik dua role itu.

**Alur bisnis (prioritas):**

| Layar | Endpoint | Pemakai |
|---|---|---|
| Finance approve/reject PR + nominal aktual | `PUT /api/equipment/purchase-requests/:id/approve` \| `/reject` | Finance — **paling mendesak**, lihat E17 |
| Request Alat — review Admin | `PUT /api/request-alat/:id/admin-review` | Admin |
| Request Alat — keputusan Divisi Alat | `PUT /api/request-alat/:id/equipment-review` | Divisi Alat |
| Request Alat — pengajuan `internal_project` (sekarang hanya `external_rental`) | `POST /api/request-alat` | Lapangan |
| Request Material RM-2/RM-3 | E14, E19 | Lapangan, Admin, Finance |
| Delivery, Penerimaan, Stok | E15, E16 | Lapangan |
| Master material & supplier | `/api/materials/types` \| `/units` \| `/suppliers` | Admin |
| Material pool | `/api/projects/material-pools` | Admin |

**Administrasi & pelengkap:**

| Layar | Endpoint |
|---|---|
| Manajemen akun (satu-satunya hak tulis super_admin) | `/api/users` (atur role), `/api/roles` (CRUD + atur permission), `/api/permissions`, `POST /api/auth/register` |
| Master jenis alat — tambah/ubah/hapus (FE baru membaca) | `POST/PUT/DELETE /api/equipment/types` |
| Kategori kas — tambah/ubah/hapus | `/api/equipment/cash/categories` |
| Ubah transaksi kas (FE baru bisa membatalkan) | `PUT /api/equipment/cash/transactions/:id` |
| Aspek maintenance — ubah/hapus | `PUT/DELETE /api/equipment/maintenance/aspects/:id` (tanpa `defaultThresholdValue`, lihat E4d) |
| Maintenance record — detail & batal | `GET /api/equipment/maintenance-records/:id`, `PUT .../:id/cancel` |
| Aktif/nonaktif setting per unit | `PUT /api/equipment/maintenance-settings/:id` `{ isActive }` |
| Riwayat status alat | `GET /api/equipment/items/:id/status-logs` |
| Progress per tahapan | `GET /api/projects/construction/:pid/sub-projects/:sid/progress` |

## E21. Mock FE yang menunggu backend (audit 16 Okt 2026)

Tetap mock — **wajar**, backend-nya belum dibangun. Dicatat supaya tidak dikira utang FE.

| Layar FE | Penyimpanan | Backend |
|---|---|---|
| Approval Center — tab kas lapangan (`fieldCashMockService.js`) | localStorage | Build Order 7. **Antrean Approval Center sendiri sudah ada (E22)** |
| Income records (`incomeService.js`) | localStorage | Build Order 6 |
| Klaim pendapatan alat (`incomeClaimService.js`) | localStorage | Build Order 6 (E4b) |
| Verifikasi kas lapangan (`fieldCashMockService.js`) | localStorage | Build Order 7 |
| Pekerja per tahapan (`fieldMockService.js`) | localStorage | Build Order 7 (Labor Payroll) |
| Folder & berkas proyek (`admin/files`, `fileStore.js`) | localStorage + IndexedDB | **API tersedia (17 Okt 2026), termasuk Arsip Penutupan** — Swagger tag *Project Files* + `docs/keputusan-desain-lampiran.md` L8. Susunan berubah: halaman atas = daftar project, lalu tahapan (konstruksi), lalu folder. Kategori, tag, tahun manual & arsip manual dibuang; hapus = sampah 30 hari; folder "Arsip Penutupan" (XLSX otomatis saat tahapan/project ditutup). `fileStore.js` & `projectSources.js` bisa diganti sekarang; unduh lewat `GET /api/files/{file.id}/url` |
| Log aktivitas / notifikasi (`activityLogService.js`) | localStorage | Tidak direncanakan — boleh tetap lokal |

**Aturan untuk modul berikutnya:** sebelum membuat layar untuk modul yang
backend-nya belum ada, sepakati dulu kontraknya (endpoint, field, enum) di Swagger
atau di sini. Sebagian besar ketidakcocokan di audit ini lahir dari mock yang
menebak kontrak (E9, E4e, E10, E11, ambang maintenance).

---

# Approval Center (17 Oktober 2026)

## E22. Antrean Approval Center tersedia + alasan tolak WAJIB — MEMUTUS FE

Detail: Swagger tag *Approval Center* dan `docs/keputusan-desain-approval-center.md`.

**1. Perlu dikerjakan SEGERA (memutus layar yang sudah ada):**

> **Status 19 Okt 2026:** alasan tolak PR & progress sudah dikirim, komentar usang
> sudah dibuang. **Sisa:** menampilkan alasan ke pengaju (butir terakhir di bawah).

- **Tolak PR sekarang wajib `notes`.** `rejectPurchaseRequest(id)` di
  `admin/approvals/services/approvalService.js` mengirim tanpa body → dibalas **400**
  "Alasan penolakan wajib diisi". Tambah isian alasan di `PurchaseRequestDetail`/`Queue`
  dan kirim `{ notes }`. Berlaku juga untuk penolakan oleh Finance.
- **Tolak progress harian sekarang wajib `notes`.** `setProgressValidation` di
  `admin/project/services/projectService.js` (dipakai `SubProjectVolumePage.jsx`) →
  kirim `{ status: 'rejected', notes }`. `validated` & cabut validasi: `notes` opsional.
- Komentar "catatan belum bisa dikirim — menunggu Approval Center" di kedua service itu
  sudah usang: `validate`/`approve` PR kini menerima `notes` opsional.
- Tampilkan alasannya ke pengaju: PR → `adminNotes`/`financeNotes`; progress →
  `validationNotes` (catatan keputusan terakhir, kosong lagi saat dibuka kembali).

**2. Layar antrean (fitur baru):**

- `GET /api/approval-queue?stage=admin|finance&sourceType=&search=&sort=oldest|newest&page=&limit=`
  — satu endpoint untuk Approval Center **Admin** dan **Finance**; bedakan dengan `stage`.
- `GET /api/approval-queue/summary` — jumlah per antrean untuk badge. **Tab yang tampil
  ditentukan dari `items` di response ini, bukan dari nama role** (sejalan E3); antrean
  berjumlah 0 tetap ada di `items`.
- Tiap baris: `sourceType`, `sourceId`, `stage`, `referenceCode` (null untuk progress),
  `context`, `summary`, `amount` (null kalau tidak relevan), `requestedBy`, `submittedAt`,
  `detailPath`, `actionEndpoints`. Detail & aksi **memakai endpoint sumber apa adanya** —
  tidak ada `/approval-queue/:id/approve`.
- Isi antrean Admin: `purchase_request`, `material_request` (kuantitas + biaya, lihat E19),
  `equipment_request` (internal), `progress_log`. Finance: `purchase_request` (+ nominal
  aktual, lihat E17), `material_request`.
- Dokumen yang user ajukan sendiri, atau teruskan sendiri ke Finance, tidak muncul di
  antreannya — tidak perlu disaring lagi di FE.
- Setelah aksi berhasil, muat ulang antrean + summary (baris langsung hilang). Aksi yang
  kalah dari user lain dibalas 409 — tampilkan pesannya dan muat ulang.
- Tab PR yang sudah ada boleh tetap memakai `/api/equipment/purchase-requests?status=submitted`,
  tapi antrean ini satu-satunya yang memberi daftar progress & request lintas project.


## E23. Workhour: koreksi, sesi rental, operator (17 Okt 2026)

Detail: Swagger tag *Workhour Logs* & *Equipment Pool & Material Pool*, `docs/keputusan-desain-divisi-alat.md`
bagian "Workhour — koreksi, sesi rental, operator".

**1. Perubahan perilaku yang bisa memutus layar yang ada:**

- **Total jam harus cocok dengan jamnya.** Kalau `startedAt`/`stoppedAt` dikirim,
  `totalWorkhour` wajib = rentang − jeda (toleransi 0,01 jam), selain itu **400**.
  `WorkhourFormPage` (konstruksi) punya centang "isi total manual" — matikan saat jam
  diisi, atau kirim tanpa jam kalau memang hanya total yang diketahui.
- **Jam kerja ditolak 409 kalau tahapan / kontrak rental bukan `active`** — tombol
  "Input Sheet" sebaiknya disembunyikan untuk tahapan/kontrak yang selesai.
  Sebaliknya, alokasi yang sudah `completed`/`returned` kini BOLEH diisi selama
  tahapannya aktif (catatan terlambat).
- `GET /equipment/items/:id/workhour-logs` default **tidak** memuat log yang dibatalkan
  (aman untuk tampilan sekarang). `includeVoided=true` untuk menampilkannya dengan
  `isVoided`, `voidReason`, `voidedBy`, `voidedAt`.

**2. Rental timesheet:**

- `SheetFormPage`: ganti beberapa `createRentalWorkhour` dengan SATU
  `POST /api/equipment/workhour-logs/rental-sheet`
  `{ equipmentPoolItemId, workDate, sessions: [{ workSession, startedAt, stoppedAt, pausedDurationMinutes?, description? }] }`.
  JANGAN kirim `totalWorkhour` — dihitung sistem. Semua sesi masuk atau tidak sama sekali.
  Response: `data.logs[]` + `data.maintenanceImpact`.
- `UnitTimesheet` / `groupTimesheet`: kelompokkan per `log.workSession`, **hapus
  `sessionOf()`** yang menebak dari jam (sesi lembur 16:30 terbaca "siang", dan bergantung
  zona waktu browser). Log lama tanpa `workSession` → kolom "tanpa sesi".
- Sesi yang sama dua kali di tanggal yang sama → **409**: batalkan log lamanya dulu.
- Setelah layar ini pindah, backend akan mewajibkan `workSession` untuk rental (backlog
  Divisi Alat I4).

**3. Operator unit rental:**

- Baca dari `operatorName` di setiap pool item (`GET /api/projects/equipment-pools/:id`).
- Ubah lewat `PUT /api/projects/equipment-pools/:id/items/:itemId/operator`
  `{ operatorName }` (`null`/kosong = hapus) — permission `equipment-pool:update`
  (Divisi Alat). Admin tidak memegangnya: field "Operator" di form Unit Baru Admin
  sebaiknya dibuang, atau dijadikan catatan untuk Divisi Alat.
- Berhenti menulis/membaca baris `Operator:` di notes (`buildUnitNotes`/`parseUnitNotes`).

**4. Batalkan log (fitur baru):**

- `PUT /api/equipment/workhour-logs/:id/void` `{ reason }` — permission `workhour:update`
  (Lapangan, Divisi Alat). Tombol "Batalkan" per baris timesheet + isian alasan. Koreksi =
  batalkan lalu catat ulang (tidak ada edit). Response `maintenanceImpact` = setting yang
  counternya ditarik. 409 kalau tahapan/kontrak sudah ditutup.

## E24. Unduh data tabel sebelum tahapan/project ditutup (17 Okt 2026)

Keputusan L8 (`docs/keputusan-desain-lampiran.md`): arsip XLSX dibuat backend HANYA saat
tahapan/project ditutup. Selama berjalan, data diunduh dari halaman sumbernya — tombol
CSV di FE. Audit 17 Okt:

- **Belum punya CSV:** `SubProjectVolumePage` (kontrak volume / progress harian),
  `InventoryPage` + `InventoryMovementPage` (stok, mutasi, penerimaan material),
  `SubProjectEquipmentPage` (alokasi alat). `WorkersPage` menyusul bersama API Pekerja.
- **Perbaiki `utils/csv.js`** (dipakai semua tombol CSV):
  - tambah BOM `\uFEFF` di awal — tanpa itu Excel salah membaca huruf non-ASCII;
  - pakai pemisah `;` — Excel berlocale Indonesia membuka CSV koma sebagai satu kolom.
- **CSV harus memuat SEMUA baris, bukan yang tampil.** `TimesheetPage` & rental
  `UnitTimesheet` memuat maksimal 100 log (`limit: 100`); CSV-nya terpotong diam-diam.
  Ambil semua halaman (`meta.total`) sebelum menyusun CSV.

## E25. Menutup tahapan/project kini bersyarat & mengunci data (17 Okt 2026)

Detail: `docs/keputusan-desain-lampiran.md` L8 "Tahapan / project selesai = terkunci".

- `PUT .../sub-projects/:id/status` dengan `completed` **atau** `cancelled` → **409** selama
  masih ada alat teralokasi, progress `submitted`, request material/alat menunggu keputusan,
  atau surat jalan belum diterima. Pesan menyebut semuanya sekaligus — tampilkan apa adanya.
- Project konstruksi (`completed`/`cancelled`) → 409 selama ada tahapan planned/active.
  Supply → 409 selama ada request material menunggu atau surat jalan belum diterima.
  Rental → 409 selama ada request alat menunggu.
- Setelah ditutup, tombol ubah/validasi progress, mutasi stok, penerimaan, delivery,
  validasi/biaya/approve request material, jam kerja, dan operator dibalas **409
  "... datanya terkunci"**. Sebaiknya disembunyikan untuk tahapan/kontrak yang ditutup.
- Menutup kini juga membuat **Arsip Penutupan** (XLSX) di request yang sama — bisa
  ±1–3 detik; tampilkan loading. **503** = storage tidak tersedia, status TIDAK berubah:
  tampilkan pesannya dan biarkan user mencoba lagi.
- Arsip muncul di halaman Files sebagai folder sistem `closing-archive` ("Arsip
  Penutupan") di tahapan/project yang ditutup; isinya lewat
  `GET /api/project-files/projects/:type/:projectId/system-folders/closing-archive[?subProjectId=]`,
  unduh lewat `GET /api/files/:fileId/url`. Tidak ada tombol hapus/ubah untuk arsip.

## E26. API modul Pekerja (19 Okt 2026)

Detail: Swagger tag *Pekerja* & *Log Tenaga Kerja*, `docs/skema-tenaga-kerja-harian.md`
P1–P11. API sudah dibangun dan tersedia setelah migrasi `20261019120000_labor_workers`
di-deploy ke DB bersama — sejak itu mock pekerja di `fieldMockService.js` bisa diganti:

- **Master pekerja GLOBAL** (`/workers`), bukan per tahapan. `WorkersPage` per tahapan
  menjadi daftar **penugasan** (`/worker-assignments?subProjectId=`); "+ Tambah Pekerja"
  = pilih dari master (atau daftarkan baru), lalu isi jenis, peran, upah, tanggal mulai.
- **NIK opsional** (16 digit kalau diisi), unik global — hapus validasi wajib 16 digit.
- **Kontrak juga berupah harian** — kolom upah TIDAK dimatikan untuk `contract`
  (nilai enum `contract`/`daily`, bukan `kontrak`/`harian`).
- **Status active/standby/off_duty dibuang.** Penugasan punya `startDate`/`endDate`;
  "Keluarkan" = isi `endDate`, bukan hapus. `groupName` dibuang.
- **Layar log harian** (baru): satu form untuk semua pekerja satu tanggal, isi awal dari
  `GET /worker-assignments?subProjectId=&activeOn=<tanggal>`; total baris =
  upah + lembur, tanpa pengali; lembur = nominal (checkbox hanya memunculkan isian).
  Simpan ulang mengirim daftar LENGKAP. Tidak ada tombol validasi — log tidak divalidasi.
- **Siapa boleh apa (P4):** log harian ditulis **Lapangan** saja (`labor-log:create/update/delete`);
  Admin & Finance hanya membaca log. Master & penugasan: Admin dan Lapangan
  (`worker:create/update`), hapus hanya Admin (`worker:delete`). Tombol di layar Admin
  disaring dengan `hasPermission`, bukan nama role.
- **Pekerja sekali-datang (P6):** setiap baris log wajib merujuk master, jadi layar log
  butuh aksi "daftarkan cepat" cukup dengan nama (`POST /workers { fullName }`) tanpa
  keluar dari form. Penugasan tetap opsional untuk pekerja harian.
- **Satu orang satu log per tanggal (P10):** orang yang sama di tahapan/project lain pada
  tanggal yang sama → **409** yang menyebut tahapannya. Tampilkan pesannya apa adanya.
- **P11 masih terbuka** (upah operator alat lewat log ini atau lewat Divisi Alat) — jangan
  menambah logika khusus operator di layar sampai PM menjawab.
- CSV `WorkersPage` (E24) menyusul bersama API.

---

# Audit ulang FE↔BE (19 Oktober 2026)

## E27. Ringkasan status — apa yang masih terbuka

Backend lengkap untuk semua kontrak di backlog ini **kecuali Pekerja (E26)**. Build
dan lint FE bersih. Status butir yang masih terbuka, dikelompokkan menurut pemiliknya:

**Modul Divisi Alat (`modules/alat`) — belum disentuh sejak audit 16 Okt.** Semua butir
wajib E17 di modul ini masih terbuka: E9a (`DUMMY_PROJECTS`), E9b (`performedBy` di
`DamageLogActionModal` + `/api/users`; **ini yang kini menahan DROP `performed_by`**),
E4e, E4d, E10, ditambah kebersihan E5, E6, `resolveDamageIssue`.

**Modul Admin — sisa pekerjaan:**

| Butir | Sisa |
|---|---|
| E3 | `ModuleSelection.jsx` masih memakai `isSuperAdmin` |
| E11 | Data demo rental/supply (termasuk delivery demo di `deliveryService`) |
| E21 Files | Halaman masih `fileStore.js` (localStorage + IndexedDB); API `/api/project-files` sudah ada |
| E22 | Alasan keputusan (`adminNotes`/`financeNotes`/`validationNotes`) belum tampil ke pengaju |
| E23 | Seluruhnya: `rental-sheet`, hapus `sessionOf()`, batalkan log, operator |
| E24 | Seluruhnya: BOM + pemisah `;` di `utils/csv.js`, CSV halaman volume/stok/alokasi, CSV timesheet terpotong 100 baris |
| E25 | Loading + 503 saat menutup, sembunyikan tombol tulis setelah ditutup |

**Layar yang belum ada (E20):** seluruh sisi **Finance** (approve/reject PR + nominal
aktual, approve request material — antrean FE sekarang hanya `stage: 'admin'`), seluruh
modul **Lapangan** (request alat & material, delivery, penerimaan), keputusan Divisi Alat
untuk request alat, manajemen akun, master material/supplier/jenis alat, kategori kas.

**Tetap mock dan wajar (E21):** income, klaim pendapatan alat, kas lapangan, pekerja
(sampai E26 dibangun), log aktivitas.
- List `GET /labor-logs` membawa ringkasan seluruh periode di `meta.summary`;
  `GET /worker-assignments` membalas `data: { data: [...], summary }`.
- `meta.summary` progress harian (`GET .../progress-logs`) kini benar-benar terkirim —
  sebelumnya dibuang `paginated()`.

---

# Audit FE desktop & mobile (26 Oktober 2026)

## E28. Tema warna logo + penyambungan sisa mock

**Tema.** Warna utama mengikuti logo SSB: biru `#029fe6` (skala `brand-*`) dan hijau daun
`#069b47` (skala `leaf-*`), didefinisikan di `@theme` pada `src/index.css`. Kelas `teal-*`
dan `emerald-*` sudah diganti seluruhnya — pakai `brand-*` / `leaf-*` untuk layar baru.
Logo ada di `public/logo-ssb.png` (sidebar, login, pemilihan divisi, favicon).

**Audit tata letak.** 44 rute dibuka di lebar 375 px dan 817 px: tidak ada overflow
horizontal halaman maupun elemen terpotong di luar wadah gulir.

**Disambungkan ke API (ditutup):**

| Butir | Sekarang |
|---|---|
| E9a | `alat/services/projectService.js` → `/api/projects/construction?status=active` + tahapan aktif; `DUMMY_PROJECTS` dihapus |
| E9b | Isian "dikerjakan oleh" dibuang dari resolve kerusakan & reset maintenance; `getMaintenancePerformedByOptions` dan `resolveDamageIssue` dihapus |
| E4e | Fallback localStorage aspek maintenance dihapus; gagal API = error tampil |
| E4d | Ambang per jenis × aspek pakai `GET /maintenance-thresholds` + `PUT/DELETE /types/:typeId/maintenance-thresholds/:aspectId`; isian default threshold aspek diganti "Peringatan Dini" (`warningLeadValue`) |
| E10 (sebagian) | `damage_log_resolve_purchase_refs` dihapus (tak pernah dibaca). **Masih terbuka:** status tindakan di localStorage & aturan "wajib PO approved" — butuh keputusan desain |
| E3 | `ModuleSelection` tanpa bypass `super_admin` |
| E26 | `WorkersPage`/`WorkerFormPage` → `/api/workers` + `/api/worker-assignments`; status turunan dari periode, "Keluarkan" = isi `endDate`, hapus hanya bila belum ada log. `fieldMockService.js` dihapus. **Layar log harian (Lapangan) belum dibuat.** |
| E21 Files | Modul `admin/files` ditulis ulang di atas `/api/project-files`: daftar project → direktori (project + tahapan) → folder → berkas, folder sistem (surat jalan, bukti penerimaan, arsip penutupan), sampah 30 hari. `fileStore.js`, `projectSources.js`, `systemFiles.js` dihapus |

**Catatan lingkungan:** sesudah menarik migrasi `20261019120000_labor_workers`, jalankan
`npx prisma generate` di `apps/api` lalu restart API — tanpa itu `/api/worker-assignments`
membalas 500 `Cannot read properties of undefined (reading 'findMany')`.

**Tetap mock (backend belum ada):** income, klaim pendapatan alat, kas lapangan, log aktivitas.
