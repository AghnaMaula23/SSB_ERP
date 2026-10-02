# Purchase Request Divisi Alat — Skema Tabel Terpisah per Kategori

Status: **keputusan final 27 September 2026 (rev-2).** Menggantikan desain
`equipment_purchase_requests` + satu `equipment_purchase_request_items` di ERD
Divisi Alat.

Model Prisma-nya **sudah masuk** ke `apps/api/prisma/schema.prisma` (bagian
"DIVISI ALAT — Batch 4"). File pendamping `purchase_request.dbml` untuk
dbdiagram.io. CHECK constraint yang tidak bisa ditulis Prisma ada di lampiran
dokumen ini.

---

## 1. Ringkasan keputusan

1. Header order berisi **tanggal** dan **kategori order**: `repair`,
   `maintenance`, atau `stock`.
2. Satu order boleh berisi banyak item, tapi hanya **satu kategori**.
3. Setiap kategori punya form input berbeda, jadi setiap kategori punya **tabel
   item sendiri**.
4. Kategori repair bertingkat dua: satu baris per kerusakan (harga jasa +
   deskripsi), dengan tabel anak untuk sparepart-nya.
5. Kategori kas **mengikuti kategori order** lewat pemetaan
   `equipment_cash_category.order_category`. User tidak memilih kategori kas.
6. Total di header dihitung sistem dari seluruh item yang terhubung.
7. Kategori Operasional Divisi masuk **backlog**. Pengeluaran operasional
   sementara lewat `manual_expense` di Kas Alat.
8. Enum `purchase_item_type` **dihapus**. Jenis barang tidak disimpan lagi.

```
equipment_purchase_requests                (header, order_category)
├── equipment_purchase_repair_items              → damage_logs
│   └── equipment_purchase_repair_spareparts
├── equipment_purchase_maintenance_items         → equipment_maintenance_settings
└── equipment_purchase_stock_items
```

---

## 2. Kenapa header memakai enum, bukan FK ke cash category

`equipment_cash_category` adalah tabel master yang isinya boleh ditambah atau
diubah Divisi Alat. Tiga tabel item adalah struktur skema yang tetap. Kalau
identitas kategori order diambil dari master, menambah atau mengganti nama
kategori kas bisa memutus kaitan ke tabel item.

Karena itu identitas kategori order disimpan sebagai enum
`purchase_order_category` di header. Kategori kas didapat dari pemetaan:

```
equipment_cash_category.order_category  (unique, nullable)
```

Header **tidak menyimpan** `cash_category_id`. Kalau disimpan, faktanya ada di
dua tempat dan bisa saling bertentangan.

> Kolom `order_category` pada `equipment_cash_category` **belum dibuat** —
> tabel itu lahir di Batch 5 (Kas Alat). Sampai itu ada, kategori kas untuk
> sebuah PR belum bisa diturunkan, dan cash-out belum bisa dibuat otomatis.

---

## 3. Bagaimana database mencegah item salah kategori

FK biasa dari item ke header hanya menjamin header-nya ada, bukan kategorinya
cocok. Pencegahannya memakai **composite FK**:

1. Header punya unique index `(id, order_category)`.
2. Setiap tabel item punya kolom `order_category` dengan nilai tetap, dijaga
   CHECK. Contoh: `order_category = 'repair'` di tabel perbaikan.
3. FK item menunjuk pasangan `(purchase_request_id, order_category)` ke
   `(id, order_category)` di header.

Baris perbaikan hanya bisa menempel ke header berkategori `repair`. Percobaan
menempelkannya ke header maintenance ditolak **database**, bukan service layer.

Tabel `equipment_purchase_repair_spareparts` tidak butuh composite FK — induknya
(`repair_items`) sudah dijamin berkategori `repair`.

---

## 4. Penjelasan per tabel

### 4.1 `equipment_purchase_requests` — header order

| Kolom | Tipe | Wajib | Isi / aturan |
|---|---|---|---|
| id | int | Ya | PK |
| request_code | varchar(50) | Ya | `PRQ-NNNNNN` dari `document_sequences`. Ditolak kalau dikirim klien |
| request_date | date | Ya | Input form |
| order_category | enum | Ya | `repair` / `maintenance` / `stock`. **Tidak boleh diubah** setelah dibuat — item yang sudah menempel akan jadi yatim |
| status | enum | Ya | `submitted` → `waiting_finance_approval` → `approved`; cabang `rejected_by_admin`, `rejected_by_finance`, `cancelled` |
| total_estimated_amount | decimal(18,2) | Ya | Dihitung sistem. Rumus per kategori di bawah |
| total_approved_amount | decimal(18,2) | Tidak | Nominal **aktual** yang dicairkan Finance. **Inilah** `amount` cash-out Kas Alat — bukan estimasi |
| requested_by | FK users | Ya | Staf Divisi Alat pembuat |
| admin_validated_by / _at | FK users / timestamp | Tidak | Diisi saat Admin validasi |
| finance_approved_by / _at | FK users / timestamp | Tidak | Diisi saat Finance approve |
| cancelled_by / _at | FK users / timestamp | Tidak | Diisi saat dibatalkan |
| created_at / updated_at | timestamp | Ya | Audit |

Rumus `total_estimated_amount`:

| Kategori | Rumus |
|---|---|
| repair | `SUM(repair_items.service_fee)` + `SUM(repair_spareparts.estimated_total_price)` |
| maintenance | `SUM(maintenance_items.estimated_price)` |
| stock | `SUM(stock_items.estimated_total_price)` |

Perubahan dari ERD lama: `cash_category_id`, `purpose`, dan `completed_at`
dihapus; `admin_approved_*` dinamai `admin_validated_*` supaya sesuai statusnya.

### 4.2 `equipment_purchase_repair_items` — satu baris per kerusakan

| Kolom | Tipe | Wajib | Isi / aturan |
|---|---|---|---|
| purchase_request_id | FK header | Ya | Bagian composite FK |
| order_category | enum | Ya | Selalu `repair` (default + CHECK) |
| damage_log_id | FK damage_logs | Ya | Input form. Unit alat dan uraian kerusakan **dibaca dari sini**, tidak disimpan ulang |
| service_fee | decimal(18,2) | Ya | Input form: biaya jasa servis. `0` kalau mekanik internal |
| approved_service_fee | decimal(18,2) | Tidak | Diisi Finance |
| notes | text | Tidak | Input form: catatan pekerjaan |

Unique `(purchase_request_id, damage_log_id)` — satu kerusakan muncul sekali per
order. Satu order boleh mencakup beberapa kerusakan.

### 4.3 `equipment_purchase_repair_spareparts` — sparepart per kerusakan

| Kolom | Tipe | Wajib | Isi / aturan |
|---|---|---|---|
| repair_item_id | FK repair_items | Ya | Cascade delete |
| item_name | varchar(200) | Ya | Input form: nama sparepart |
| quantity | decimal(18,2) | Ya | Input form: jumlah. CHECK > 0 |
| estimated_unit_price | decimal(18,2) | Ya | Input form: harga per item |
| estimated_total_price | decimal(18,2) | Ya | `quantity × unit_price`, dihitung sistem |
| approved_total_price | decimal(18,2) | Tidak | Diisi Finance |

Tanpa kolom satuan — keputusan sadar, mengikuti form. Lihat catatan §7.

### 4.4 `equipment_purchase_maintenance_items` — perawatan terjadwal

| Kolom | Tipe | Wajib | Isi / aturan |
|---|---|---|---|
| purchase_request_id | FK header | Ya | Bagian composite FK |
| order_category | enum | Ya | Selalu `maintenance` |
| maintenance_setting_id | FK settings | Ya | Setting = unit × aspek. **Satu FK ini memuat dua input form** (unit terafiliasi + aspek maintenance) |
| estimated_price | decimal(18,2) | Ya | Input form: estimasi harga |
| approved_price | decimal(18,2) | Tidak | Diisi Finance |

Unique `(purchase_request_id, maintenance_setting_id)` — satu aspek pada satu
unit tidak boleh diajukan dua kali dalam satu order.

**Konsekuensi yang diterima:** satu harga per aspek, jadi biaya consumable (oli,
filter) tidak terpisah dari jasa bengkel. Biaya per jam operasi memakai total
biaya perawatan per unit.

### 4.5 `equipment_purchase_stock_items` — stok gudang

| Kolom | Tipe | Wajib | Isi / aturan |
|---|---|---|---|
| purchase_request_id | FK header | Ya | Bagian composite FK |
| order_category | enum | Ya | Selalu `stock` |
| item_name | varchar(200) | Ya | Input form: nama barang |
| quantity | decimal(18,2) | Ya | Input form: jumlah. CHECK > 0 |
| estimated_unit_price | decimal(18,2) | Ya | Input form: harga per item |
| estimated_total_price | decimal(18,2) | Ya | Dihitung sistem |
| approved_total_price | decimal(18,2) | Tidak | Diisi Finance |

Mencakup **semua** stok gudang — sparepart, oli, grease, majun — tanpa kolom
pembeda jenis. Tanpa satuan dan tanpa alasan pembelian, mengikuti form.

---

## 5. Relasi dan cardinality

| Relasi | Cardinality | Keterangan |
|---|---|---|
| header → repair_items | 1 : N | Composite FK, cascade delete |
| repair_items → repair_spareparts | 1 : N | FK biasa, cascade delete |
| header → maintenance_items | 1 : N | Composite FK, cascade delete |
| header → stock_items | 1 : N | Composite FK, cascade delete |
| damage_logs → repair_items | 1 : N | Satu kerusakan bisa diajukan di beberapa order dari waktu ke waktu |
| equipment_maintenance_settings → maintenance_items | 1 : N | Sama |
| users → header | 1 : N | Empat peran: pembuat, validator admin, approver finance, pembatal |
| equipment_cash_category → header | logis, 1 : N | Lewat `order_category`, bukan FK |
| header → equipment_cash_transaction | logis, 1 : 1 | `source_type = equipment_purchase_request`, dibuat saat approved |
| header → maintenance_records | 1 : N | `purchase_request_id` menggantikan `purchase_request_item_id` |

Satu header hanya punya anak di **satu** dari tiga tabel item.

---

## 6. Aturan yang dijaga service layer

Melibatkan tabel lain atau status yang berubah, jadi tidak bisa jadi CHECK:

1. **PR repair boleh dibuat** kalau `damage_log.spare_part_source = 'supplier'`
   **ATAU** `damage_log.mechanic_team = 'external'`. Kombinasi
   `warehouse` + `internal` tidak butuh PR sama sekali.
2. Baris sparepart hanya sah kalau `spare_part_source = 'supplier'`.
   `service_fee > 0` hanya sah kalau `mechanic_team = 'external'`.
3. `damage_log` harus berstatus **`reported`**. (`in_repair` tidak ada lagi
   sejak Batch 3.)
4. `maintenance_setting` harus berstatus `warning`, `due`, atau `overdue` saat
   submit.
5. Semua kolom total dihitung service dalam satu transaksi database. Nilai
   kiriman klien diabaikan.
6. Minimal satu item per order. Header tanpa item ditolak. Untuk repair: setiap
   baris kerusakan wajib punya minimal satu sparepart **atau**
   `service_fee > 0`.
7. **Kolom terkelola sistem** (`request_code`, `status`, `total_*`,
   `approved_*`, semua `*_by`/`*_at`) ditolak validator kalau dikirim di body.
8. `order_category` tidak boleh diubah setelah header dibuat.
9. **Approve Finance:** isi `approved_*` per baris dengan nominal aktual,
   jumlahkan ke `total_approved_amount`, lalu buat `equipment_cash_transaction`
   cash-out — semua dalam satu transaksi database.
10. **Saldo kas:** saat submit, kalau `total_estimated_amount` melebihi saldo
    Kas Alat, tampilkan peringatan (bukan blokir). Layar approval Finance
    menampilkan proyeksi saldo setelah pencairan.
11. **`super_admin` tidak boleh validate/approve.** Bypass `authorize()`
    dimatikan khusus di dua endpoint itu — super_admin hanya memantau.
12. **Setelah `approved`:** item tidak boleh diubah. Pembatalan membuat
    `adjustment` cash-in dengan `source_id` = id PR.
13. **Menyelesaikan kerusakan TIDAK mereset jadwal servis.** Reset perawatan
    rutin adalah aksi manual terpisah di halaman Maintenance, dan aspek
    perawatan tidak bisa menumpang order perbaikan karena kategori ordernya
    berbeda. `PUT /damage-logs/{id}/resolve` menolak `maintenanceSettingId`.

---

## 7. Utang desain yang diterima sadar

| # | Utang | Konsekuensi |
|---|---|---|
| 1 | Tidak ada kolom satuan di sparepart & stok | "jumlah 6, harga 120.000" tidak bisa dipastikan lagi 6 meter atau 6 batang. Migrasi menambah kolom murah; data yang sudah masuk tetap ambigu selamanya |
| 2 | Jenis barang tidak disimpan | Belanja stok tidak bisa dipilah sparepart vs consumable. Membalik alasan awal mempertahankan `consumable` di `keputusan-desain-divisi-alat.md` |
| 3 | ~~`admin_validated`~~ | **Sudah dibuang 27 Sep 2026.** Tidak pernah mengendap; jejak validasi ada di `admin_validated_by`/`_at` |
| 4 | Pemakaian stok gudang tidak dicatat | Perbaikan yang memakai sparepart gudang tidak muncul di biaya per unit alat |

---

## Lampiran — CHECK constraint untuk migration

Prisma tidak bisa menulis CHECK. Jalankan:

```bash
npx prisma migrate dev --create-only --name add_purchase_request_batch4
```

lalu tempel blok ini di bawah SQL hasil generate, sebelum `migrate deploy`:

```sql
-- Setiap tabel item hanya boleh berisi kategorinya sendiri. Dikombinasikan
-- dengan composite FK, baris item tidak mungkin menempel ke header lain.
ALTER TABLE equipment_purchase_repair_items
  ADD CONSTRAINT chk_repair_items_category CHECK (order_category = 'repair');

ALTER TABLE equipment_purchase_maintenance_items
  ADD CONSTRAINT chk_maintenance_items_category CHECK (order_category = 'maintenance');

ALTER TABLE equipment_purchase_stock_items
  ADD CONSTRAINT chk_stock_items_category CHECK (order_category = 'stock');

-- Nominal tidak boleh negatif; jumlah harus lebih dari nol
ALTER TABLE equipment_purchase_repair_items
  ADD CONSTRAINT chk_repair_service_fee CHECK (service_fee >= 0);

ALTER TABLE equipment_purchase_repair_spareparts
  ADD CONSTRAINT chk_repair_sparepart_amount
  CHECK (quantity > 0 AND estimated_unit_price >= 0 AND estimated_total_price >= 0);

ALTER TABLE equipment_purchase_maintenance_items
  ADD CONSTRAINT chk_maintenance_items_amount CHECK (estimated_price >= 0);

ALTER TABLE equipment_purchase_stock_items
  ADD CONSTRAINT chk_stock_items_amount
  CHECK (quantity > 0 AND estimated_unit_price >= 0 AND estimated_total_price >= 0);
```

Migrasi ini juga mengganti `maintenance_records.purchase_request_item_id`
menjadi `purchase_request_id`. Kolom lama belum pernah terisi (modul PR belum
ada), jadi aman diganti tanpa backfill.
