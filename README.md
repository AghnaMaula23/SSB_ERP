# ConstructERP — ERP Konstruksi SSB.Inc

## Tech Stack

- **Backend**: Node.js + Express 5 + Prisma ORM
- **Frontend**: React (Vite)
- **Database**: PostgreSQL (Supabase)
- **Monorepo**: npm workspaces
- **API Docs**: Swagger UI

## Project Structure

```
constructerp/
├── apps/
│   ├── api/                    ← Backend Express
│   │   ├── prisma/
│   │   │   └── schema.prisma   ← Database schema (source of truth)
│   │   └── src/
│   │       ├── app.js          ← Express entry point
│   │       ├── config/
│   │       │   ├── database.js     ← Prisma client
│   │       │   ├── swagger.js      ← OpenAPI spec (semua endpoint)
│   │       │   └── swagger-setup.js
│   │       ├── middleware/
│   │       │   ├── auth.js     ← JWT + role/permission check
│   │       │   └── error.js    ← Global error handler
│   │       ├── modules/        ← Satu folder per modul bisnis
│   │       │   ├── auth/
│   │       │   ├── project/
│   │       │   ├── divisi-alat/
│   │       │   ├── request-alat/
│   │       │   ├── request-material/
│   │       │   ├── approval-center/
│   │       │   ├── income/
│   │       │   ├── finance-field/
│   │       │   ├── finance-accounting/
│   │       │   └── payroll/
│   │       ├── database/seeders/
│   │       └── utils/
│   └── web/                    ← Frontend React + Vite
├── packages/
│   └── shared/                 ← Constants shared BE + FE
├── docs/                       ← ERD & technical documentation
├── package.json                ← Workspace root
├── .env.example                ← Template environment variables
└── .gitignore
```

## Getting Started

### 1. Clone dan install

```bash
git clone https://github.com/[USERNAME]/constructerp.git
cd constructerp
npm install
```

### 2. Setup environment

```bash
cp .env.example .env
```

Edit `.env` dengan credential yang diberikan oleh tim lead (jangan commit file ini):

```properties
DATABASE_URL="postgresql://..."     # Dari Supabase → Connect → ORMs (port 6543)
DIRECT_URL="postgresql://..."       # Dari Supabase → Connect → ORMs (port 5432)
JWT_SECRET=your-secret-key          # Bebas, tapi harus sama untuk semua developer
JWT_EXPIRES_IN=7d
API_PORT=3000
WEB_PORT=5173
```

> **Catatan:** Minta credential ke tim lead via chat pribadi. JANGAN taruh credential asli di repo.

### 3. Setup database

```bash
cd apps/api
npx prisma generate          # Generate Prisma client
npx prisma migrate dev       # Jalankan migration (buat tabel)
npm run db:seed              # Seed data awal (roles + super admin)
cd ../..
```

### 4. Jalankan

```bash
npm run dev                  # Jalankan API + Web sekaligus
# atau terpisah:
npm run dev:api              # Backend saja (port 3000)
npm run dev:web              # Frontend saja (port 5173)
```

### 5. Buka

| URL | Fungsi |
| --- | --- |
| http://localhost:3000/api/health | Health check API |
| http://localhost:3000/api-docs | **Swagger UI** — explore & test semua endpoint |
| http://localhost:3000/api-docs.json | Raw OpenAPI spec (import ke Postman) |
| http://localhost:5173 | Frontend React |

## Swagger UI — API Documentation

Semua endpoint sudah terdokumentasi di Swagger UI (`/api-docs`). Cara pakai:

1. Buka http://localhost:3000/api-docs
2. Login dulu via `POST /auth/login` → copy token dari response
3. Klik tombol **Authorize** (gembok) di kanan atas → paste token → klik Authorize
4. Sekarang semua endpoint bisa ditest langsung dari browser

### Import ke Postman

1. Buka Postman → Import → Link
2. Paste: `http://localhost:3000/api-docs.json`
3. Semua endpoint auto-import sebagai collection

## Default Login

Setelah seed:

```
Username: superadmin
Password: admin123
Roles: super_admin
```

## Development Workflow

### Backend — Menambah modul baru

Setiap modul mengikuti pola yang sama:

```
src/modules/[nama-modul]/
├── [nama].routes.js       ← Definisi endpoint + middleware
├── [nama].controller.js   ← Handle request → panggil service → kirim response
└── [nama].service.js      ← Business logic + query database
```

Setelah membuat module, daftarkan di `src/app.js`:

```js
app.use('/api/[path]', require('./modules/[nama-modul]/[nama].routes.js'));
```

### Backend — Mengubah database schema

```bash
cd apps/api
# Edit prisma/schema.prisma
npx prisma migrate dev --name deskripsi_perubahan
```

### Frontend — Development

```bash
cd apps/web
npm run dev                  # Vite dev server dengan HMR
```

## Module Status

| Modul | Status | Endpoint Base |
| --- | --- | --- |
| Auth | ✅ Boilerplate ready | `/api/auth` |
| Project | 🔲 Belum | `/api/projects` |
| Divisi Alat | 🔲 Belum | `/api/equipment` |
| Request Alat | 🔲 Belum | `/api/request-alat` |
| Request Material | 🔲 Belum | `/api/request-material` |
| Approval Center | 🔲 Belum | `/api/approvals` |
| Income | 🔲 Belum | `/api/income` |
| Finance Field | 🔲 Belum | `/api/finance-field` |
| Finance Accounting | 🔲 Belum | `/api/finance-accounting` |
| Payroll | 🔲 Belum | `/api/payroll` |

## Roles & Permissions

| Role | Akses |
| --- | --- |
| `super_admin` | Semua — bypass permission check |
| `admin` | Project, request, verification, employee management |
| `finance` | Payment, approval keuangan, payroll, jurnal, COA |
| `divisi_alat` | Equipment master, maintenance, purchase request, income claim |
| `lapangan` | Daily progress, workhour, damage report, material/alat request |
