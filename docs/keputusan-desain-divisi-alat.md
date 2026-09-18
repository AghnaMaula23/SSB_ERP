# Keputusan Desain — Modul Divisi Alat

Dokumen ini mencatat keputusan desain yang **berbeda dari ERD** beserta alasannya,
supaya selisih dengan dokumen ERD bisa dijelaskan dan tidak dikira kelalaian
membaca dokumen. Semua keputusan di bawah diambil sadar setelah review bersama.

Terakhir diperbarui: 15 September 2026

---

## Prinsip yang dipakai

**Satu fakta hidup di satu tempat.** Kalau sebuah informasi sudah bisa dijawab
oleh kolom atau tabel lain, jangan menyimpannya lagi di kolom baru. Duplikasi
status adalah sumber bug paling mahal di ERP: dua sumber bisa bertentangan dan
tidak ada yang tahu mana yang benar. Prinsip ini yang memutuskan hampir semua
perampingan di bawah.

**Kolom yang dikelola sistem tidak boleh diisi klien.** `total_workhour`,
`current_status`, `current_value_since_reset`, `asset_code`, dan
`maintenance_code` ditolak di validator kalau dikirim di request body.

**Nomor dokumen dibuat sistem dengan counter atomik**, tidak pernah dari
`MAX(...) + 1`, supaya dua input bersamaan tidak menghasilkan nomor kembar.

---

## Enum yang diubah dari ERD

### equipment_item_status — 8 nilai menjadi 4

| | |
|---|---|
| ERD | available, assigned, delivered_to_location, received_at_site, in_use, maintenance, damaged, retired |
| Dipakai | **available, assigned_to_location, maintenance, retired** |

Empat nilai siklus penugasan (`assigned`, `delivered_to_location`,
`received_at_site`, `in_use`) diciutkan jadi satu. Siklus detailnya adalah milik
`sub_project_equipment_allocations.status` di modul Project, dan menyimpannya
juga di sini berarti dua tempat yang bisa bertentangan — alat bisa tercatat
`in_use` padahal alokasinya sudah `returned`.

`damaged` digabung ke `maintenance` karena penyebab alat masuk bengkel sudah
terbedakan di `equipment_status_logs.source_type`: `damage_log` untuk kerusakan,
`maintenance_record` untuk perawatan terjadwal. Laporan "berapa lama alat mati
karena kerusakan vs perawatan" tetap bisa dijawab dari log.

`assigned_to_location` tetap berupa **cermin** dari alokasi proyek, bukan sumber
kebenaran. Gunanya supaya pertanyaan "alat mana yang bebas?" tidak perlu join
ke modul Project.

### damage_level — dihapus seluruhnya

ERD punya `low, medium, high, critical`. Dihapus karena **tidak ada kriteria
objektif untuk menentukannya** — dua orang menilai kerusakan yang sama secara
berbeda, dan hasilnya laporan yang terlihat terukur padahal hasil menebak.

Bagian dari "keparahan" yang benar-benar objektif dan mengubah tindakan adalah
*"alat masih bisa jalan atau tidak"*, dan itu sudah terekam: kerusakan yang
menghentikan alat memicu perubahan status ke `maintenance` dengan
`source_type = damage_log`, kerusakan yang tidak menghentikan alat tidak memicu
apa-apa. Triase antrean cukup memakai itu ditambah tanggal laporan.

### damage_status — `reviewed` dihapus

| | |
|---|---|
| ERD | reported, reviewed, in_repair, resolved, cancelled |
| Dipakai | **reported, in_repair, resolved, cancelled** |

Fakta "sudah diperiksa Divisi Alat" sudah tersimpan di kolom `reviewed_by` dan
`reviewed_at`, jadi tidak perlu jadi status tersendiri. Pertanyaan yang paling
sering ditanyakan — "laporan mana yang belum dilihat siapa pun?" — dijawab
`reviewed_at IS NULL`.

Alur: `reported` → `in_repair` → `resolved`. Dua jalan pintas yang sah:
`reported` → `resolved` (diperiksa, ternyata tidak perlu tindakan) dan
`reported` → `cancelled` (laporan salah atau duplikat).

### maintenance_aspect_unit — dihapus seluruhnya

ERD punya `hour, day, km, manual`. Semua threshold maintenance berbasis **jam
kerja alat**. `km` tidak punya sumber data — tidak ada pembacaan odometer di
seluruh ERD. `day` bertumpuk dengan `hour` untuk alat yang bekerja rutin.

Ambang peringatan memakai `warning_lead_value` per aspek (default 50 jam),
dihitung dari **sisa jam menuju jatuh tempo**, bukan jam terpakai:

| Sisa jam (threshold 250, lead 50) | Status |
|---|---|
| 250 sampai 51 | normal |
| 50 sampai 1 | warning |
| 0 sampai -50 | due |
| kurang dari -50 | overdue |

### maintenance_record_status

ERD hanya menulis `varchar(30) default 'completed'` tanpa merinci nilainya.
Dipakai: **completed, cancelled**. Tidak ada status "sedang dikerjakan" karena
maintenance record adalah histori pasca-pekerjaan, dan "alat sedang ditangani"
sudah terjawab `equipment_items.current_status = maintenance` serta
`damage_logs.status = in_repair`.

### purchase_request_status — `in_progress` dan `completed` dihapus

| | |
|---|---|
| ERD | submitted, admin_validated, rejected_by_admin, waiting_finance_approval, rejected_by_finance, approved, in_progress, completed, cancelled |
| Dipakai | **submitted, admin_validated, rejected_by_admin, waiting_finance_approval, rejected_by_finance, approved, cancelled** |

Approved dianggap selesai. **Konsekuensi yang wajib dipatuhi saat implementasi:
ketika menyetujui, Finance mengisi nominal yang BENAR-BENAR dicairkan, bukan
menyalin `estimated_total_price`.** Kalau ini dilanggar, saldo Kas Alat berisi
estimasi, bukan angka riil.

Pembatalan setelah approved berarti uang sudah keluar, jadi perlu transaksi
`adjustment` masuk untuk mengembalikannya.

### purchase_item_type — `repair` tidak dipakai

Dipakai: **sparepart, consumable, service, other** (sesuai ERD).

`consumable` dipertahankan dan **tidak boleh digabung ke sparepart**. Sparepart
adalah barang yang menempel jadi bagian alat (seal, bearing, hose, track link);
consumable adalah barang habis pakai (oli, grease, filter, solar, majun). Untuk
alat berat, consumable adalah komponen biaya rutin terbesar, dan memisahkannya
diperlukan untuk menghitung biaya operasi per jam — angka yang dipakai menentukan
`default_hourly_rate`.

---

## Telusur service vs repair

`purchase_item_type` menjawab **apa yang dibeli**. **Kenapa dibeli** dijawab FK
mana yang terisi di `equipment_purchase_request_items`:

| Kasus | item_type | FK terisi |
|---|---|---|
| Oli mesin untuk servis 250 jam | consumable | maintenance_setting_id |
| Jasa bengkel servis berkala | service | maintenance_setting_id |
| Seal hidrolik bocor karena benturan | sparepart | damage_log_id |
| Jasa las chassis retak | service | damage_log_id |
| Grease & majun stok gudang | consumable | *(kosong)* |

Rantai telusurnya:

```
maintenance_setting ─┐
                     ├─► purchase_request_item ─► maintenance_record ─► equipment_item
damage_log          ─┘
```

**`maintenance_setting_id` dan `damage_log_id` tidak boleh terisi bersamaan** —
wajib dijaga CHECK constraint. Kalau keduanya terisi, pertanyaan "ini biaya
perawatan atau biaya kerusakan" tidak punya jawaban tunggal dan laporan biaya
akan terhitung dobel.

---

## Aturan turunan yang wajib dijaga

- **`isActive` bukan status operasional.** Alat rusak dan alat pensiun tetap
  `isActive = true`. `isActive = false` hanya untuk penghapusan administratif
  (salah input, unit duplikat). Yang mengunci alat dari penugasan adalah
  `current_status`. Kalau alat rusak di-set `isActive = false`, alat itu **tidak
  bisa dikembalikan** ke `available` setelah diperbaiki.
- **Input workhour ditolak** kalau status alat `maintenance` atau `retired`.
  Alat di bengkel tidak menghasilkan jam operasi, dan kalau tetap dicatat,
  counter maintenance ikut jalan sehingga alat yang baru selesai servis langsung
  terlihat mendekati jatuh tempo lagi.
- **Status alat hanya bisa diubah lewat `PUT /equipment/items/{id}/status`**,
  tidak lewat update biasa, supaya setiap perubahan pasti tercatat di
  `equipment_status_logs`.
- **Alat rusak ditarik ke gudang**, sehingga setelah damage `resolved` status
  kembali ke `available`, bukan dipulihkan ke penugasan sebelumnya.
  *Menunggu konfirmasi PM.*

---

## Tambahan schema di luar ERD

- `equipment_items.serial_number` ditambahkan, dan `year` dinamai
  `manufacture_year` (mengikuti kontrak swagger).
- `asset_code` dibuat sistem dengan format `SSB-{typeCode}-{NNN}`, counter atomik
  per jenis alat di `equipment_types.last_sequence`. Nomor tidak pernah didaur
  ulang. Hanya super_admin yang boleh mengisi manual (untuk alat warisan).
- `maintenance_records.equipment_item_id` ditambahkan dan wajib, supaya riwayat
  per alat tetap utuh untuk record yang lahir dari damage log.
- `document_sequences`: tabel counter nomor dokumen. Dipakai `MTN-NNNNNN`,
  disiapkan untuk purchase request dan equipment income claim.
- **Lampiran foto kerusakan ditunda.** Swagger versi awal menjanjikan
  `attachments` multipart pada damage log, ERD tidak punya tabelnya. Diputuskan
  dirancang sekali untuk semua modul (damage, purchase request, project files),
  bukan ditambal per modul.

---

## Sudah dikonfirmasi PM (17 September 2026)

1. **Alat rusak TIDAK ditarik ke bengkel.** Mekanik yang didatangkan ke alat,
   baik di gudang maupun di lokasi proyek. Konsekuensinya: alat yang diperbaiki
   tetap terikat alokasi proyeknya, dan `equipment_items.current_status` cukup
   memuat kondisi saja — penugasan sepenuhnya milik
   `sub_project_equipment_allocations`.
2. **Tidak ada mekanisme "penggantian unit".** Kalau perbaikan diperkirakan lama,
   proyek mengajukan alat tambahan lewat **alur normal Request Alat** (lapangan
   mengajukan, admin review, Divisi Alat assign). Bukan menukar unit di pool.
   Artinya `equipment_pool_items.equipment_item_id` tidak pernah diubah ke unit
   lain, dan `total_used_hours` per pool item tidak akan pernah bercampur antar
   unit. Ambiguitas yang sempat dikhawatirkan tidak ada.

## Utang desain — dibereskan di awal modul Project

1. **Kolom konteks `equipment_workhour_logs` — jawabannya sudah jelas, tinggal
   dieksekusi.** Terbangun memakai `project_id` + `sub_project_id` (mengikuti ERD
   Divisi Alat). ERD Project memakai `sub_project_equipment_allocation_id` +
   `equipment_pool_item_id` dengan CHECK constraint eksplisit:

   ```
   source_type = 'internal_project' => sub_project_equipment_allocation_id IS NOT NULL
   source_type = 'external_rental'  => equipment_pool_item_id IS NOT NULL
   ```

   **Versi ERD Project yang dipakai**, karena ERD Divisi Alat ditulis saat Request
   Alat belum menjadi entitas lengkap. Ini juga yang membuat penggantian unit
   bekerja benar: jam kerja terikat ke alokasi, sehingga unit lama dan
   penggantinya punya angka masing-masing.

2. **`paused_duration_minutes` belum dibangun.** Ada di ERD Project dan kontrak
   swagger awal, tidak ada di ERD Divisi Alat. Ditambahkan saat migrasi poin 1.

3. **Batas `equipment_items.current_status` vs
   `sub_project_equipment_allocations.status`.** Sudah jauh berkurang setelah enum
   diciutkan, tapi `assigned_to_location` tetap cermin dari alokasi. Aturan:
   alokasi adalah sumber kebenaran penugasan.
