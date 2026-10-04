# Skema Tenaga Kerja Harian — spesifikasi untuk Build Order langkah 7

**STATUS: BELUM DIBANGUN.** Dokumen ini spesifikasi, bukan laporan. Tabelnya milik
modul Finance Field & Labor Payroll (langkah 7). Ditulis 1 Oktober 2026 saat modul
Project dibangun, karena keputusannya menyangkut `sub_projects` dan akan hilang
kalau tidak dicatat sekarang.

Menyimpang dari `Dokumentasi ERD Finance Field & Labor Payroll.md`. Selisihnya
disengaja dan dijelaskan di bawah — bukan kelalaian membaca ERD.

---

## Perubahan inti: dari komposisi agregat ke ORANG BERNAMA

ERD memodelkan `daily_labor_log_items` sebagai **komposisi**: kategori pekerja +
jumlah orang + upah per orang. Tidak ada nama.

Itu **bukan kebetulan.** Keputusan itu diambil di `AIsession/1-session.md` baris
3097–3260, setelah client memberi contoh input:

```
Pelaksana = 1 Orang, Operator = 3 Orang, Harian K3 = 3 Orang,
Checker = 1 Orang, Sopir DT = 3 Orang
```

dan disimpulkan *"jangan paksa pekerja harian masuk ke master data personal"*
karena daftar pekerja harian berubah-ubah tiap hari dan tiap sub-project.

**Kebutuhannya berubah** (dikonfirmasi 1 Okt 2026): perlu nama per pekerja di log
harian, dan perlu master data pekerja. Desain Figma sudah bergerak ke arah itu.
Maka model agregat digantikan — **satu baris item = satu orang, tanpa kolom jumlah.**

Konsekuensi yang diterima sadar: hari dengan 47 pekerja harian butuh 47 baris.
UI perlu penambahan massal, bukan satu per satu. Imbalannya, pertanyaan "Dedi
bekerja berapa hari bulan ini" jadi bisa dijawab — mustahil di model agregat.

---

## Dua pertentangan di dalam Figma yang harus diperbaiki

Desain Figma per 1 Okt 2026 masih setengah jalan antara dua model. Keduanya sudah
diputuskan; **desainnya yang menyesuaikan.**

### 1. Baris menampilkan satu nama tapi totalnya mengandung jumlah

| Baris di "Detail Log Tenaga Kerja" | Upah | Total | Pengali tersembunyi |
|---|---|---|---|
| Slamet Riyadi | 130.000 | 1.560.000 | × 12 |
| Dedi Kurniawan | 250.000 | 500.000 | × 2 |
| Budi Herlambang | 130.000 | 3.250.000 | × 25 |

Ringkasannya juga tidak konsisten: "TOTAL PEKERJA 52 Orang" dari 4 baris; di modal
input, 3 baris dengan satu nilai 150.000 tapi "Total Upah Harian Rp 750.000" (× 5).

**Keputusan: TOTAL = `daily_wage + overtime_amount`.** Tidak ada pengali. Jumlah
orang = jumlah baris.

### 2. Pekerja KONTRAK ditampilkan berupah 0

Di log, baris berbadge KONTRAK selalu `UPAH 0 / TOTAL 0`, padahal master "Daftar
Pekerja Kontrak" mencatat Rp 500.000,00. Itu sisa asumsi lama *"kategori Tetap
upahnya kosong karena masuk payroll Finance"*.

**Asumsi itu salah untuk kasus ini.** Pekerja kontrak di sini disewa selama project
berlangsung tetapi **dibayar harian** — bukan karyawan bergaji bulanan.

**Keputusan: upah pekerja kontrak IKUT dihitung**, sama seperti pekerja harian.
Nilainya diambil dari `default_daily_wage` master sebagai nilai awal, **tetapi
bisa diubah saat input** — karena hari itu bisa ada lembur.

---

## Tiga populasi orang, jangan tertukar

| Populasi | Dibayar | Tabel | Modul |
|---|---|---|---|
| Karyawan tetap perusahaan | bulanan | `employees` | Payroll Karyawan (langkah 8) |
| **Pekerja kontrak** — disewa selama TAHAPAN berlangsung | **harian** | `project_workers` + penugasan | langkah 7 |
| **Pekerja harian** — hadir hanya ketika dipanggil | **harian** | penugasan opsional, boleh lepas | langkah 7 |

---

## Skema

```
Enum worker_type {
  contract   // disewa selama project berlangsung, dibayar harian
  daily      // hadir hanya ketika dipanggil, kontrak harian
}

Enum worker_status { active standby off_duty inactive }

// `locked` DIBUANG dari labor_log_status versi ERD (keputusan 1 Okt 2026).
// ERD punya { recorded, submitted, locked, cancelled } tapi tidak pernah
// menjelaskan apa yang membedakan submitted dari locked — keduanya sama-sama
// berarti "sudah masuk klaim, tidak bisa diedit". Cukup submitted.
Enum labor_log_status { recorded submitted cancelled }
```

### `project_workers` — SIAPA orangnya (identitas, ditulis sekali)

```
id                     bigint [pk, increment]
worker_code            varchar(50) [not null, unique]  // sistem: PWK-000001
full_name              varchar(150) [not null]
id_number              varchar(50)         // NIK — NULLABLE
phone                  varchar(30)         // WhatsApp
default_role           varchar(100)        // "Operator Excavator", "Pelaksana Lapangan"
joined_at              date                // sumber "Lama Kerja: N Tahun"
notes                  text
created_by             bigint
created_at, updated_at timestamp

indexes {
  (id_number) [unique]   // hanya saat id_number NOT NULL
  (full_name)
}
```

Tabel ini **tidak terikat project maupun sub-project.** Isinya identitas, dan
identitas tidak berubah saat orangnya pindah tahapan.

**`id_number` nullable** — pekerja harian sering tidak menyerahkan NIK.
Mewajibkannya akan memaksa operator mengarang nomor, dan data karangan lebih
buruk daripada kosong. Unique-nya hanya berlaku saat terisi.

**`joined_at` disimpan, "Lama Kerja: 5 Tahun" DIHITUNG** dari selisihnya dengan
hari ini. Menyimpan lama kerja sebagai angka membuatnya salah besok pagi.

**Pekerja harian BOLEH punya baris di sini, tidak wajib.** Yang sering dipanggil
balik jadi punya riwayat; yang sekali datang cukup dicatat namanya di log
(`daily_labor_log_items.project_worker_id` nullable). Ini yang menjawab keberatan
sesi lama tanpa membuang kebutuhan sekarang.

**`default_daily_wage` TIDAK di sini** — upah milik kesepakatan, bukan milik orang.
Orang yang sama bisa beda upah di tahapan galian dan tahapan aspal. Lihat tabel
berikutnya.

### `sub_project_worker_assignments` — KESEPAKATAN kerja per tahapan

```
id                   bigint [pk, increment]
sub_project_id       bigint [not null]
project_worker_id    bigint [not null]
worker_type          worker_type [not null]   // contract | daily
assigned_role        varchar(100)             // peran di tahapan INI, boleh beda
                                              // dari project_workers.default_role
daily_wage           decimal(18,2) [not null] // upah sepakat untuk tahapan ini
start_date           date
end_date             date
status               worker_status [not null, default: 'active']
notes                text
created_by           bigint
created_at, updated_at timestamp

indexes {
  (sub_project_id, status)
  (sub_project_id, project_worker_id) [unique]
}
```

**Inilah tabel yang terikat sub-project, dan alasannya tepat:** kontrak hidup di
level sub-project (`sub_projects.contract_value`, `contract_no`, `contract_date`),
`construction_projects` hanya wadah pengelompokan. Pekerja disewa terhadap kontrak
TAHAPAN, bukan terhadap project. Keputusan PM 4 Oktober 2026.

**Kenapa dipisah dari identitas.** Tahapan berjalan berurutan (galian → timbunan →
line_clearing → aspal) dan kru yang sama lazim ikut pindah. Kalau identitas ikut
terikat sub-project, Budi yang ikut empat tahapan punya empat baris dengan NIK yang
sama, empat `joined_at` berbeda, dan unique `(sub_project_id, id_number)` tidak bisa
mencegah NIK salah ketik di tahapan ketiga — sub-project-nya memang beda, jadi
duplikatnya sah secara constraint.

Dengan dipisah: Budi = **1 baris identitas + 4 baris penugasan**. Tiap tahapan punya
upah dan periodenya sendiri, NIK ditulis sekali, dan "Budi kerja berapa hari di
project ini" terjawab satu query.

**`status` ada di penugasan, bukan di identitas** — `active`/`standby`/`off_duty`
adalah keadaan terhadap suatu tahapan, bukan sifat orangnya. Orang yang sama bisa
`active` di galian dan belum ditugaskan sama sekali di aspal.

**`worker_type` juga di sini**, karena orang yang sama bisa disewa kontrak di satu
tahapan dan dipanggil harian di tahapan lain.

### `daily_labor_logs` — header, satu per tahapan per tanggal

```
id                bigint [pk, increment]
sub_project_id    bigint [not null]
work_date         date [not null]
status            labor_log_status [not null, default: 'recorded']
notes             text                 // "Catatan Lapangan"
recorded_by       bigint [not null]
submitted_at      timestamp
created_at, updated_at timestamp

indexes { (sub_project_id, work_date) [unique] }
```

**`total_workers` dan `total_wage_amount` dari ERD TIDAK dibuat.** Keduanya
`COUNT`/`SUM` atas item-nya, dihitung saat dibaca. Alasan yang sama dengan saldo
Kas Alat dan `total_used_hours` yang dibuang di modul Project: rollup tersimpan
bisa menyimpang dari barisnya tanpa meninggalkan jejak. Kartu "Ringkasan Resource"
di Figma tetap terisi, sumbernya query.

### `daily_labor_log_items` — SATU BARIS = SATU ORANG

```
id                   bigint [pk, increment]
daily_labor_log_id   bigint [not null]
project_worker_id    bigint              // NULLABLE — terisi untuk pekerja yang ada
                                         // di master; kosong untuk harian lepas

// SNAPSHOT — wajib terisi walaupun project_worker_id ada
worker_name          varchar(150) [not null]
worker_role          varchar(100) [not null]  // posisi HARI ITU, boleh beda dari default_role
worker_type          worker_type [not null]   // badge KONTRAK / HARIAN
daily_wage           decimal(18,2) [not null] // upah yang BENAR-BENAR dibayar hari itu

is_overtime          boolean [not null, default: false]  // "Tandai sebagai Lembur"
overtime_amount      decimal(18,2) [not null, default: 0]
task_notes           text                     // "Keterangan Tugas / Area"
created_at, updated_at timestamp

indexes { (daily_labor_log_id, project_worker_id) [unique] }  // saat project_worker_id NOT NULL
```

**Kenapa di-snapshot padahal ada FK ke master.** Upah master naik bulan depan, ejaan
nama diperbaiki, peran berubah — histori upah yang sudah dibayar tidak boleh ikut
berubah. Polanya **sudah dipakai ERD** di `field_labor_wage_claim_items` (*"Snapshot
detail upah saat klaim dibuat agar perubahan daily_labor_log_items tidak mengubah
histori klaim"*); di sini diturunkan satu tingkat lebih awal karena itu tingkat
tempat upahnya pertama kali ditentukan.

**`daily_wage` diisi awal dari `sub_project_worker_assignments.daily_wage` tapi bisa
ditimpa operator** — dikonfirmasi 1 Okt: hari itu bisa ada lembur atau kesepakatan
berbeda. Untuk pekerja harian lepas yang tidak punya penugasan, operator mengetiknya
langsung.

**`total_wage` tidak disimpan** — `daily_wage + overtime_amount`, aritmetika satu baris.

**Unique `(daily_labor_log_id, project_worker_id)`** mencegah orang yang sama dicatat
dua kali di hari yang sama. Tidak berlaku untuk harian lepas (`project_worker_id`
NULL), jadi dua "Dedi" berbeda di hari yang sama tetap bisa dicatat.

---

## Dampak ke hilir — rantai klaim TIDAK berubah

```
daily_labor_logs → daily_labor_log_items
  → field_labor_wage_claim_items (snapshot)
    → field_labor_wage_claims       (Admin validasi → Finance approve)
      → field_labor_wage_payment_proofs  (Finance validasi → JURNAL GL)
```

Jurnal GL tetap lahir hanya saat `field_labor_wage_payment_proofs.status = validated`:
`Debit Beban Upah Harian Project, Credit Kas/Bank Induk Finance`. Claim approved tetap
TIDAK membuat jurnal.

Yang perlu disesuaikan hanya kolom snapshot `field_labor_wage_claim_items`, mengikuti
bentuk item barunya:

| ERD sekarang | Jadi |
|---|---|
| `worker_category` (enum) | `worker_type` (contract/daily) |
| `worker_role` | tetap |
| `worker_count` | **dibuang** — selalu 1 |
| `daily_wage_rate` | `daily_wage` |
| `overtime_amount`, `claimed_amount` | tetap |
| — | `worker_name` **ditambah** |

### `labor_worker_category` menjadi tidak terpakai

ERD punya `{ kuli, mandor, operator, driver, helper, other }`. Contoh peran dari client
sendiri — "Harian K3", "Checker", "Sopir DT", "Kenek Tukang Besi", "Pekerja Cor",
"Logistics Checker", "Pelaksana Lapangan" — **tidak muat di enam nilai itu**, dan
memaksakannya berarti sebagian besar peran jatuh ke `other` sehingga enumnya tidak
menjawab apa pun. Diganti `worker_role` varchar bebas.

Enum yang tersisa dan tetap berguna adalah `worker_type` — dia menentukan hal yang
BERBEDA (kontrak vs harian lepas), bukan jabatan.

