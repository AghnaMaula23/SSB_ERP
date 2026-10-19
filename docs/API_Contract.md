# API Contract — ConstructERP

> **Daftar endpoint TIDAK ditulis di sini.** Sumber kebenarannya
> `apps/api/src/config/swagger.js`, dibaca lewat Swagger UI:
>
> ```bash
> cd apps/api && node src/app.js
> # buka http://localhost:3000/api-docs
> ```
>
> Dokumen ini hanya memuat konvensi yang berlaku di SELURUH endpoint —
> bagian yang tidak berubah tiap kali modul baru ditambahkan.

Menggantikan `API_Contract.docx` (dihapus 9 Oktober 2026). Docx itu memuat
10 path saat swagger sudah punya 118, dan tertinggal dua modul penuh — sudah
pada taraf menyesatkan, bukan sekadar kurang lengkap. Daftar endpoint memang
tidak pantas dirawat manual di dokumen terpisah: dia berubah tiap batch,
sementara swagger ikut berubah bersama kodenya.

Terakhir diverifikasi terhadap kode: 16 Oktober 2026.

---

## Metadata

| | |
|---|---|
| Base URL | `http://localhost:3000/api` |
| Auth | Bearer JWT di header `Authorization` |
| Format | JSON request/response |
| Paginasi | `?page=1&limit=20` — default 20, **maksimal 100** |
| Konvensi | URL kebab-case, body JSON camelCase |

Batas paginasi ditegakkan `utils/query.js`:
`Math.min(Number(req.query.limit) || 20, 100)`.

## Bentuk response

Seluruh endpoint memakai `utils/response.js` — jangan menyusun response JSON
manual di controller.

**Berhasil** (`success()` / `created()`):
```json
{ "success": true, "message": "Success", "data": { } }
```

**Berhasil dengan paginasi** (`paginated()`) — perhatikan `data` adalah array
di level atas, bukan di dalam objek:
```json
{
  "success": true,
  "data": [ ],
  "meta": { "total": 150, "page": 1, "limit": 20, "totalPages": 8 }
}
```

Beberapa list membawa `meta.summary` — ringkasan atas SELURUH baris yang cocok
filter, bukan hanya halaman yang tampil (mis. progress harian, log tenaga kerja).
Sebelum 19 Okt 2026 `paginated()` membuang field ini diam-diam.

**Gagal** — dari global error handler:
```json
{ "success": false, "message": "Deskripsi error" }
```

**Gagal validasi** — express-validator, memuat rincian per field:
```json
{
  "success": false,
  "message": "Validasi gagal",
  "errors": [ { "field": "projectName", "message": "Nama project wajib diisi" } ]
}
```

> Pesan error di backend ditulis untuk dibaca manusia dan menyebut sebab serta
> jalan keluarnya. **Tampilkan apa adanya di FE** — mengganti dengan "Terjadi
> kesalahan" membuang informasi yang sudah disiapkan.

**Kode status yang perlu ditangani khusus:**

| Status | Arti | Yang sebaiknya dilakukan FE |
|---|---|---|
| 409 | Konflik keadaan — termasuk aksi bersamaan yang kalah (approve dua kali, dsb.) | Muat ulang data, tampilkan pesannya |
| 429 | Terlalu banyak login gagal (10 per 15 menit per IP) | Tampilkan pesannya; jangan coba ulang otomatis |
| 500 | Error tak terduga | Di **production** pesannya selalu generik ("Terjadi kesalahan pada server") — detailnya hanya di log server, supaya query dan host database tidak bocor. Di development pesan asli dan `stack` tetap dikirim |

## Auth

Semua endpoint kecuali `POST /api/auth/login` memerlukan token.
`POST /api/auth/register` **bukan pendaftaran mandiri** — butuh login dan
permission `user:create` (super_admin).

```
Authorization: Bearer <jwt_token>
```

Login memakai field **`login`** (bukan `username`) — bisa diisi username
maupun email:

```json
{ "login": "admin", "password": "..." }
```

## Role

| Kode | Keterangan |
|---|---|
| `super_admin` | **Hanya memantau** (kebijakan 15 Okt 2026): `*:read` di semua modul, CRUD hanya di manajemen akun (`user`, `role`, `permission`). Role eksklusif (tidak bisa digabung role lain); permission-nya dikunci dari API |
| `admin` | Admin kantor. Memiliki project dan kontrak tahapan; memvalidasi progress |
| `finance` | Menyetujui pencairan dana; baca saja untuk operasional |
| `divisi_alat` | Master alat, pool, alokasi, Kas Alat |
| `lapangan` | Mencatat progress harian, jam kerja, dan menerima alat di lokasi |

Permission berformat `module:action`, dicek `authorize('module:action')`.
**Tidak ada role yang mem-bypass** — hak akses sepenuhnya dari daftar permission
(`GET /api/auth/me`). Tidak ada yang bisa mengubah role akunnya sendiri (403).

## Lampiran file (multipart)

Endpoint yang menerima file memakai `multipart/form-data` — **form dan file dalam
satu request**, bukan unggah dulu lalu rujuk. Field teks dikirim sebagai part biasa.
Jenis file diperiksa dari isinya (bukan ekstensi); file yang ditolak dibalas **400**
dengan bentuk gagal validasi (`errors[].field` = nama field file). Profil `evidence`:
PDF/JPG/PNG/WebP maks 10 MB. Unduh lewat `GET /api/files/:id/url` → signed URL
berlaku 5 menit. Rincian: `docs/keputusan-desain-lampiran.md`.

## Cakupan endpoint saat ini

142 path, 36 tag. Yang **sudah dibangun**:

| Prefix | Path | Status |
|---|---|---|
| `/auth`, `/users`, `/roles`, `/permissions` | 13 | jalan |
| `/projects` | 30 | jalan — project, sub-project, progress, equipment & material pool, alokasi |
| `/equipment` | 37 | jalan — master alat, workhour, maintenance (ambang per jenis), damage, purchase request, kas |
| `/request-alat` | 5 | jalan |
| `/materials` | 5 | jalan — jenis material, satuan, supplier |
| `/request-material` | 8 | jalan — RM-2 & RM-3 |
| `/material-deliveries`, `/material-receipts`, `/material-stock` | 10 | jalan — RM-4 & RM-5 |
| `/files` | 1 | jalan — signed URL unduh |
| `/approval-queue` | 2 | jalan (17 Okt) — antrean baca-saja Admin & Finance; aksi tetap di endpoint modul sumber (`docs/keputusan-desain-approval-center.md`) |

Yang masih **rancangan di swagger, belum ada kodenya**: `/income`,
`/finance-field`, `/finance-accounting`, `/payroll`. Rancangan ini ditulis sebelum
ERD direvisi — anggap draf, kontraknya disepakati ulang saat modulnya dibangun.
Urutan pembangunannya ada di CLAUDE.md bagian Build Order.
