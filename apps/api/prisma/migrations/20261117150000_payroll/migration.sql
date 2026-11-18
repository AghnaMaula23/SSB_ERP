-- G6 Divisi Finance — payroll karyawan tetap: master karyawan, riwayat gaji, payroll bulanan.
-- docs/claude_knowledge/plan-divisi-finance.md F26–F29 + selisih ERD 3c. Tiga DROP tertunda
-- (field_pic_id, threshold_value, default_threshold_value) yang diusulkan `migrate diff`
-- sengaja TIDAK di sini.
--
-- FK users.employee_id: dicek 17 Nov 2026 — tidak ada baris users dengan employee_id terisi
-- di DB bersama, jadi FK dipasang tanpa mengosongkan data apa pun.
-- CreateEnum
CREATE TYPE "payroll_status" AS ENUM ('draft', 'finalized', 'paid', 'cancelled', 'voided');

-- CreateEnum
CREATE TYPE "payroll_component_type" AS ENUM ('earning', 'deduction');

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "employee_code" VARCHAR(20) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "department" VARCHAR(30) NOT NULL,
    "position_name" VARCHAR(100),
    "join_date" DATE NOT NULL,
    "end_date" DATE,
    "end_reason" TEXT,
    "bank_name" VARCHAR(100),
    "account_number" VARCHAR(50),
    "account_name" VARCHAR(150),
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_compensations" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "base_salary" DECIMAL(18,2) NOT NULL,
    "effective_start_date" DATE NOT NULL,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" SERIAL NOT NULL,
    "payroll_code" VARCHAR(50) NOT NULL,
    "payroll_year" INTEGER NOT NULL,
    "payroll_month" INTEGER NOT NULL,
    "status" "payroll_status" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "replaces_payroll_id" INTEGER,
    "created_by" INTEGER NOT NULL,
    "finalized_by" INTEGER,
    "finalized_at" TIMESTAMP(3),
    "paid_by" INTEGER,
    "paid_at" TIMESTAMP(3),
    "payment_date" DATE,
    "payment_reference" VARCHAR(100),
    "payment_notes" TEXT,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "voided_by" INTEGER,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" SERIAL NOT NULL,
    "payroll_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "compensation_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_item_components" (
    "id" SERIAL NOT NULL,
    "payroll_item_id" INTEGER NOT NULL,
    "component_type" "payroll_component_type" NOT NULL,
    "component_name" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_item_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_payment_files" (
    "id" SERIAL NOT NULL,
    "payroll_id" INTEGER NOT NULL,
    "file_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_payment_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE INDEX "employees_full_name_idx" ON "employees"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_compensations_employee_id_effective_start_date_key" ON "employee_compensations"("employee_id", "effective_start_date");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_payroll_code_key" ON "payrolls"("payroll_code");

-- CreateIndex
CREATE INDEX "payrolls_payroll_year_payroll_month_idx" ON "payrolls"("payroll_year", "payroll_month");

-- CreateIndex
CREATE INDEX "payrolls_status_idx" ON "payrolls"("status");

-- CreateIndex
CREATE INDEX "payrolls_replaces_payroll_id_idx" ON "payrolls"("replaces_payroll_id");

-- CreateIndex
CREATE INDEX "payroll_items_employee_id_idx" ON "payroll_items"("employee_id");

-- CreateIndex
CREATE INDEX "payroll_items_compensation_id_idx" ON "payroll_items"("compensation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_payroll_id_employee_id_key" ON "payroll_items"("payroll_id", "employee_id");

-- CreateIndex
CREATE INDEX "payroll_item_components_payroll_item_id_idx" ON "payroll_item_components"("payroll_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payment_files_file_id_key" ON "payroll_payment_files"("file_id");

-- CreateIndex
CREATE INDEX "payroll_payment_files_payroll_id_idx" ON "payroll_payment_files"("payroll_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_replaces_payroll_id_fkey" FOREIGN KEY ("replaces_payroll_id") REFERENCES "payrolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_finalized_by_fkey" FOREIGN KEY ("finalized_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_compensation_id_fkey" FOREIGN KEY ("compensation_id") REFERENCES "employee_compensations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_item_components" ADD CONSTRAINT "payroll_item_components_payroll_item_id_fkey" FOREIGN KEY ("payroll_item_id") REFERENCES "payroll_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payment_files" ADD CONSTRAINT "payroll_payment_files_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payment_files" ADD CONSTRAINT "payroll_payment_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ------------------------------------------------------------
-- Constraint yang tidak bisa dinyatakan Prisma
-- ------------------------------------------------------------
ALTER TABLE "employees" ADD CONSTRAINT "employees_end_date_check"
  CHECK ("end_date" IS NULL OR "end_date" >= "join_date");
ALTER TABLE "employees" ADD CONSTRAINT "employees_end_reason_check"
  CHECK ("end_reason" IS NULL OR "end_date" IS NOT NULL);

ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_base_salary_check"
  CHECK ("base_salary" > 0);

ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_period_check"
  CHECK ("payroll_month" BETWEEN 1 AND 12 AND "payroll_year" BETWEEN 2000 AND 2100);
-- Aktor mengikuti status: finalize tercatat sejak finalized (cancelled boleh dari draft maupun finalized)
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_finalize_check"
  CHECK (("status" NOT IN ('finalized', 'paid', 'voided') OR ("finalized_by" IS NOT NULL AND "finalized_at" IS NOT NULL))
     AND ("status" <> 'draft' OR ("finalized_by" IS NULL AND "finalized_at" IS NULL)));
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_paid_check"
  CHECK (("status" IN ('paid', 'voided')) = ("paid_by" IS NOT NULL AND "paid_at" IS NOT NULL AND "payment_date" IS NOT NULL));
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_cancel_check"
  CHECK (("status" = 'cancelled') = ("cancelled_by" IS NOT NULL AND "cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_void_check"
  CHECK (("status" = 'voided') = ("voided_by" IS NOT NULL AND "voided_at" IS NOT NULL AND "void_reason" IS NOT NULL));
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_replaces_check"
  CHECK ("replaces_payroll_id" IS NULL OR "replaces_payroll_id" <> "id");
-- Satu payroll aktif per bulan (F28)
CREATE UNIQUE INDEX "payrolls_active_period_key" ON "payrolls"("payroll_year", "payroll_month")
  WHERE "status" NOT IN ('cancelled', 'voided');

ALTER TABLE "payroll_item_components" ADD CONSTRAINT "payroll_item_components_amount_check"
  CHECK ("amount" > 0);
-- Gaji Pokok (is_system) selalu earning, tepat satu per item
ALTER TABLE "payroll_item_components" ADD CONSTRAINT "payroll_item_components_system_check"
  CHECK (NOT "is_system" OR "component_type" = 'earning');
CREATE UNIQUE INDEX "payroll_item_components_system_key" ON "payroll_item_components"("payroll_item_id")
  WHERE "is_system";

-- RLS (CLAUDE.md 3b): tabel baru tertutup bagi REST API Supabase; backend = pemilik tabel
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_compensations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payrolls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_item_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_payment_files" ENABLE ROW LEVEL SECURITY;
