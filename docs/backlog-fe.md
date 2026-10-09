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
| 1 | **E3** `hasPermission` | Akan bikin super_admin dapat 403 saat layar approval dibuat |
| 2 | **E4d** `maintenanceThresholdService` | Backend-nya SUDAH ADA, tapi FE masih localStorage penuh |
| 3 | **E4e** `maintenanceService` hibrida | Separuh API separuh localStorage — paling rawan salah baca |
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

`projectService.js` TIDAK lagi mock: sudah memanggil API, dan backend modul
Project sudah selesai (25 path `/api/projects/*` di swagger).

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
