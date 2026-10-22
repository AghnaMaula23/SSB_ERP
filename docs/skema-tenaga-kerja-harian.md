# Tenaga Kerja Harian (modul Pekerja) — keputusan desain & kontrak

**STATUS: DIBANGUN 19 Okt 2026** — `apps/api/src/modules/labor/`, migrasi
`20261019120000_labor_workers`. Endpoint: Swagger tag *Pekerja* dan *Log Tenaga Kerja*
(`apps/api/src/config/swagger.js`).

Bagian labor dari Build Order 7 (Finance Field & Labor Payroll). Spesifikasi awal
ditulis 1 Okt 2026 saat modul Project dibangun; versi ini menggantikannya setelah
sesi desain 18–19 Okt 2026 (keputusan P1–P11 di bawah). Menyimpang dari
`claude_knowledge/ERD/MD File/Dokumentasi ERD Finance Field & Labor Payroll.md` —
selisihnya disengaja dan dijelaskan, bukan kelalaian membaca ERD.

---

## Batas pembangunan

| Dibangun sekarang | Ditunda ke sesi klaim |
|---|---|
| Master pekerja `project_workers` | Klaim upah `field_labor_wage_claims` (+ items) |
| Penugasan per tahapan `sub_project_worker_assignments` | Bukti bayar `field_labor_wage_payment_proofs` |
| Log harian `daily_labor_logs` + `daily_labor_log_items` | Jurnal GL Beban Upah Harian Project |
| Arsip penutupan `stage-labor` | Antrean Approval Center untuk klaim |

**Kenapa klaim ditunda.** Bukti bayar yang `validated` adalah satu-satunya titik yang
melahirkan jurnal GL, dan modul GL belum ada — klaim tanpa itu berhenti di `approved`
yang tidak bisa ditindaklanjuti. Klaim juga lebih tepat dirancang bersama kas lapangan
(sama-sama alur uang Lapangan → Finance di Build Order 7) dan butuh keputusan PM yang
belum ada: periode klaim, rekening sumber dana.

Potongan yang dibangun sudah utuh sendiri: data pekerja & kehadiran tercatat, tahapan
bisa ditutup, arsipnya lengkap.

---

## Perubahan inti dari ERD: dari komposisi agregat ke ORANG BERNAMA

ERD memodelkan `daily_labor_log_items` sebagai komposisi (kategori + jumlah orang + upah
per orang), keputusan sesi awal (`AIsession/1-session.md` baris 3097–3260) karena daftar
pekerja harian berubah-ubah. **Kebutuhannya berubah** (dikonfirmasi 1 Okt 2026): perlu
nama per pekerja di log harian dan master data pekerja. Maka **satu baris item = satu
orang, tanpa kolom jumlah.** Hari dengan 47 pekerja = 47 baris; UI perlu penambahan
massal (P9). Imbalannya: "Dedi bekerja berapa hari bulan ini" bisa dijawab.

## Tiga populasi orang, jangan tertukar

| Populasi | Dibayar | Tabel | Modul |
|---|---|---|---|
| Karyawan tetap perusahaan | bulanan | `employees` | Payroll Karyawan (langkah 8) |
| **Pekerja kontrak** — disewa selama TAHAPAN berlangsung | **harian** | `project_workers` + penugasan | modul ini |
| **Pekerja harian** — hadir ketika dipanggil | **harian** | `project_workers`, penugasan opsional | modul ini |

Orang yang digaji bulanan adalah karyawan, bukan populasi modul ini (P3).

---

## Keputusan (sesi 18–19 Okt 2026)

### P1. Log harian TIDAK divalidasi Admin — pemeriksaan terjadi di klaim (opsi ERD)

Admin tidak punya bahan untuk memeriksa kehadiran harian (tidak ada absensi/laporan
mandor yang sampai ke kantor). Validasi per hari hanya akan jadi stempel tanpa
pemeriksaan. Maka pemeriksaan Admin → Finance terjadi pada **klaim upah per periode**,
seperti ERD, dan klaim itu yang masuk Approval Center.

Akibat untuk sesi ini:
- **Log tidak punya kolom status.** `labor_log_status` (ERD: recorded/submitted/locked/
  cancelled; spesifikasi 1 Okt: recorded/submitted/cancelled) tidak dibuat. "Sudah masuk
  klaim" kelak dibaca dari ada-tidaknya baris klaim yang merujuk log — satu fakta di
  satu tempat — jadi `submitted_at`/`locked_at` juga tidak dibuat.
- Selama belum diklaim, log boleh diubah & dihapus pemegang permission. Jejaknya
  `created_by` + `updated_by`/`updated_at`.
- Log pekerja **tidak** menambah syarat penutupan tahapan dan tidak masuk Approval Center.
- Menggantikan backlog Divisi Alat C5 sebagian: C5 benar bahwa validasi tidak di header
  log, tapi enum yang ia kutip ikut dibuang.

### P2. TOTAL = `daily_wage + overtime_amount`, tanpa pengali (pertentangan Figma #1)

Desain Figma per 1 Okt menampilkan satu nama per baris tetapi totalnya mengandung
pengali tersembunyi (Slamet Riyadi upah 130.000 total 1.560.000 = ×12; "TOTAL PEKERJA
52 Orang" dari 4 baris). Itu sisa model agregat. Jumlah orang = jumlah baris; total
baris dihitung, tidak disimpan. **Desain Figma yang menyesuaikan.**

### P3. Upah pekerja KONTRAK ikut dihitung (pertentangan Figma #2)

Figma menampilkan baris KONTRAK selalu `UPAH 0 / TOTAL 0`, dan FE mock
(`WorkerFormPage.jsx`) mematikan kolom upah untuk kontrak ("digaji bulanan lewat
payroll"). Asumsi itu salah: pekerja kontrak di sini disewa selama tahapan dan
**dibayar harian**. Upahnya diisi awal dari penugasan, bisa diubah per baris log.

### P4. Pencatat & permission

| Permission | admin | lapangan | finance | super_admin |
|---|---|---|---|---|
| `worker:read` | ✓ | ✓ | ✓ | ✓ (otomatis) |
| `worker:create`, `worker:update` (master & penugasan) | ✓ | ✓ | | |
| `worker:delete` (master & penugasan) | ✓ | | | |
| `labor-log:read` | ✓ | ✓ | ✓ | ✓ (otomatis) |
| `labor-log:create`, `labor-log:update`, `labor-log:delete` | | ✓ | | |

Lapangan yang bertemu orangnya, jadi Lapangan yang mencatat log dan boleh mendaftarkan
pekerja baru. Admin memeriksa nanti di klaim, sehingga tidak diberi hak tulis log
(yang memeriksa tidak mengarang angka yang ia periksa — pola `progress:create`).
Lapangan tanpa `worker:delete`: menghentikan penugasan cukup dengan `endDate`.

### P5. Master pekerja GLOBAL; penugasan per tahapan tanpa status

- `project_workers` tidak terikat project maupun tahapan. Kru yang sama ikut pindah
  tahapan (galian → timbunan → …) dan antar project; NIK ditulis sekali. Budi = 1 baris
  identitas + N baris penugasan.
- Penugasan terikat **tahapan**, karena kontrak hidup di `sub_projects` (keputusan PM
  4 Okt 2026). Satu penugasan per (tahapan, pekerja).
- **`worker_status` (active/standby/off_duty/inactive) DIBUANG.** "Masih bertugas" =
  `end_date IS NULL OR end_date >= hari ini`. "Standby/off hari ini" sudah dijawab oleh
  hadir-tidaknya orang itu di log hari itu — menyimpannya lagi = satu fakta di dua
  tempat. "Keluarkan" di FE = mengisi `endDate`.
- Hapus penugasan hanya kalau orang itu belum pernah muncul di log tahapan tersebut.
- Saat tahapan ditutup, penugasan yang `end_date`-nya kosong diisi tanggal penutupan
  di DALAM transaksi penutupan. Bukan syarat penutupan — memaksa 47 orang diakhiri
  satu-satu tidak menambah informasi.
- `groupName` di FE mock dibuang: belum ada pemakainya.

### P6. Setiap baris log WAJIB merujuk master (`project_worker_id NOT NULL`)

Spesifikasi 1 Okt membolehkan "harian lepas" hanya dengan nama. Dibalik: satu jalur
pencatatan, aturan "orang yang sama tidak dicatat dua kali sehari" selalu berlaku, rekap
hari kerja per orang lengkap. Pekerja sekali-datang dibuat cepat dari layar input cukup
dengan nama (`POST /workers { fullName }`; NIK opsional). Penugasan tetap opsional untuk
pekerja harian.

Akibatnya **snapshot `worker_name` tidak perlu** — perbaikan ejaan di master memang
seharusnya terbawa. Yang tetap disimpan per baris adalah fakta HARI ITU yang boleh
berbeda dari master/penugasan: `worker_role`, `worker_type`, `daily_wage`,
`overtime_amount`. Klaim kelak tetap men-snapshot baris yang diklaim (pola ERD).

### P7. Lembur = nominal saja

`overtime_amount` (rupiah, default 0) + alasan di `task_notes`. **`is_overtime` dibuang**
(= `overtime_amount > 0`); checkbox "Tandai sebagai Lembur" di FE cukup memunculkan
isian nominal. Tanpa jam/tarif lembur — belum ada aturan tarif.

`daily_wage` boleh ditimpa per baris; response menyertakan `assignmentDailyWage` dan
`wageDiffersFromAssignment` supaya pemeriksa klaim melihat penyimpangannya.

### P8. Koreksi

Tanpa validasi (P1), koreksi = ubah/hapus log selama belum diklaim. Tanggal log tidak
bisa diubah (log milik tanggal itu, pola progress) — salah tanggal = hapus lalu catat
ulang. Setelah klaim ada, aturan kuncinya ditentukan di sesi klaim.

### P9. Input massal

`POST /labor-logs` membawa header + seluruh `items[]` dalam satu transaksi.
`PUT /labor-logs/{id}` mengirim **daftar lengkap** item; server menyelaraskan per
`projectWorkerId` (yang ada diubah, yang baru dibuat, yang hilang dihapus) sehingga id
baris stabil untuk dirujuk klaim nanti. Tanpa endpoint prefill: FE mengisi awal dari
`GET /worker-assignments?subProjectId=&activeOn=` atau dari log hari sebelumnya.

### P10. Satu orang tidak boleh tercatat di dua log pada tanggal yang sama

Lintas tahapan maupun lintas project → 409 dengan nama tahapan yang sudah memuatnya.
Risiko yang dicegah: membayar orang yang sama dua kali. Dijaga di service dengan
mengunci baris `project_workers` yang terlibat (`FOR UPDATE`, urut id) di dalam
transaksi — unique index tidak bisa karena tanggal ada di header.

### P11. TERBUKA — upah operator alat

Perlu satu kalimat dari PM: apakah operator alat dibayar lewat log pekerja ini atau lewat
Divisi Alat / Kas Alat. Kalau keduanya mungkin, biaya operator bisa tercatat dua kali.
Tidak menghalangi pembangunan; aturannya ditambahkan ke dokumen ini setelah dijawab.

---

## Aturan yang berlaku otomatis (pola yang sudah ada)

- **Kunci tahapan (L8):** semua jalur tulis penugasan & log memanggil
  `assertContextOpen(tx, { subProjectId })`. Penugasan boleh pada tahapan `planned`/
  `active` (merekrut sebelum mulai wajar); log hanya pada tahapan `active` dan
  `workDate` tidak di masa depan.
- **Arsip penutupan `stage-labor`:** baris baru di `STAGE_ARCHIVES`
  (`closing-archive.service.js`) + migrasi yang memperluas
  `project_closing_archives_scope_check`. Sheet: Log Pekerja (per baris), Rekap per
  Pekerja (hari kerja, upah, lembur, total), Penugasan.
- **Kode pekerja** `PWK-NNNNNN` lewat `document_sequences`; ditolak kalau dikirim klien.
- **Tanpa total tersimpan:** `total_workers`/`total_wage_amount` (ERD) dan `total_wage`
  per baris dihitung saat dibaca.
- **RLS:** keempat tabel baru `ENABLE ROW LEVEL SECURITY` (tanpa FORCE).
- **FK:** semua `ON DELETE RESTRICT`, kecuali item → header log `CASCADE` (hapus log
  menghapus barisnya). Periksa hasil `migrate diff` — default FK opsional SET NULL.

---

## Skema

```
Enum worker_type {
  contract   // disewa selama tahapan berlangsung, dibayar harian
  daily      // hadir ketika dipanggil
}
```

### `project_workers` — SIAPA orangnya

```
id            int [pk, increment]
worker_code   varchar(20) [not null, unique]  // sistem: PWK-000001
full_name     varchar(150) [not null]
id_number     varchar(16)                     // NIK — NULLABLE; 16 digit kalau diisi
phone         varchar(30)
default_role  varchar(100)                    // "Operator Excavator", "Harian K3"
joined_at     date                            // sumber "Lama Kerja: N Tahun" (dihitung)
notes         text
created_by    int [not null]
created_at, updated_at

indexes {
  (id_number) [unique]   // partial: WHERE id_number IS NOT NULL
  (full_name)
}
CHECK id_number ~ '^[0-9]{16}$'
```

`id_number` nullable: pekerja harian sering tidak menyerahkan NIK; mewajibkannya memaksa
mengarang nomor. `default_daily_wage` TIDAK di sini — upah milik kesepakatan, bukan
milik orang.

### `sub_project_worker_assignments` — KESEPAKATAN per tahapan

```
id                 int [pk, increment]
sub_project_id     int [not null]
project_worker_id  int [not null]
worker_type        worker_type [not null]
assigned_role      varchar(100)            // peran di tahapan INI
daily_wage         decimal(18,2) [not null] // CHECK > 0
start_date         date [not null]
end_date           date                    // NULL = masih bertugas; CHECK >= start_date
notes              text
created_by         int [not null]
created_at, updated_at

indexes {
  (sub_project_id, project_worker_id) [unique]
  (project_worker_id)
}
```

### `daily_labor_logs` — header, satu per tahapan per tanggal

```
id              int [pk, increment]
sub_project_id  int [not null]
work_date       date [not null]
notes           text                 // "Catatan Lapangan"
created_by      int [not null]
updated_by      int                  // pengubah terakhir (log bisa diubah sampai diklaim)
created_at, updated_at

indexes { (sub_project_id, work_date) [unique] }
```

### `daily_labor_log_items` — SATU BARIS = SATU ORANG

```
id                  int [pk, increment]
daily_labor_log_id  int [not null]          // ON DELETE CASCADE
project_worker_id   int [not null]
worker_role         varchar(100) [not null] // posisi HARI ITU
worker_type         worker_type [not null]  // badge KONTRAK / HARIAN
daily_wage          decimal(18,2) [not null] // CHECK > 0
overtime_amount     decimal(18,2) [not null, default: 0] // CHECK >= 0
task_notes          text                    // "Keterangan Tugas / Area"
created_at, updated_at

indexes {
  (daily_labor_log_id, project_worker_id) [unique]
  (project_worker_id)
}
```

---

## Hilir — catatan untuk sesi klaim

```
daily_labor_logs → daily_labor_log_items
  → field_labor_wage_claim_items (snapshot)
    → field_labor_wage_claims       (Admin validasi → Finance approve; Approval Center)
      → field_labor_wage_payment_proofs  (Finance validasi → JURNAL GL)
```

Jurnal GL tetap hanya saat bukti bayar `validated`: Debit Beban Upah Harian Project,
Credit Kas/Bank. Yang harus diputuskan di sesi itu:

1. Log/baris yang sudah diklaim dikunci (ubah/hapus 409) — penjaganya di service log.
2. Tahapan ditutup vs klaim: penutupan mengunci tulis (`assertContextOpen`), jadi
   pilih — log yang belum diklaim jadi syarat penutupan, ATAU klaim dikecualikan dari
   kunci. Arsip `stage-labor` mungkin perlu kolom status klaim.
3. Periode klaim & rekening sumber dana (PM).
4. Snapshot `field_labor_wage_claim_items`: `worker_category` → `worker_type`,
   `worker_count` dibuang, `daily_wage_rate` → `daily_wage`, tambah `worker_name`.
5. `labor_worker_category` ERD tidak dipakai: peran nyata client ("Harian K3", "Sopir DT",
   "Kenek Tukang Besi") tidak muat di enam nilainya → `worker_role` varchar bebas.
6. Path klaim/bukti bayar lama di swagger (`/finance-field/wage-claims…`, tag *Daily
   Labor*) adalah placeholder September — dirancang ulang, bukan dipakai.
