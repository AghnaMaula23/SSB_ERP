-- G1 Divisi Finance — inti GL: COA, jurnal + baris, tutup buku bulanan, void sumber Lapangan.
-- docs/claude_knowledge/plan-divisi-finance.md F1–F7, F24.
-- Tiga DROP tertunda (field_pic_id, threshold_value, default_threshold_value) yang
-- diusulkan `migrate diff` sengaja TIDAK di sini.

-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');

-- CreateEnum
CREATE TYPE "journal_source_type" AS ENUM ('income_record', 'income_payment', 'equipment_income_claim', 'material_request', 'field_expense_report', 'labor_payment_proof', 'payroll', 'manual_expense', 'journal_adjustment', 'opening_balance');

-- AlterTable
ALTER TABLE "field_expense_reports" ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by" INTEGER;

-- AlterTable
ALTER TABLE "field_labor_wage_payment_proofs" ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by" INTEGER;

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" SERIAL NOT NULL,
    "account_code" VARCHAR(20) NOT NULL,
    "account_name" VARCHAR(150) NOT NULL,
    "account_type" "account_type" NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" SERIAL NOT NULL,
    "journal_code" VARCHAR(50) NOT NULL,
    "journal_date" DATE NOT NULL,
    "source_type" "journal_source_type" NOT NULL,
    "source_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "reversal_of_journal_entry_id" INTEGER,
    "construction_project_id" INTEGER,
    "sub_project_id" INTEGER,
    "external_rental_project_id" INTEGER,
    "external_supply_project_id" INTEGER,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_lines" (
    "id" SERIAL NOT NULL,
    "journal_entry_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_period_closings" (
    "id" SERIAL NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "notes" TEXT,
    "closed_by" INTEGER NOT NULL,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reopened_by" INTEGER,
    "reopened_at" TIMESTAMP(3),
    "reopen_reason" TEXT,

    CONSTRAINT "accounting_period_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_account_code_key" ON "chart_of_accounts"("account_code");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_account_name_key" ON "chart_of_accounts"("account_name");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_journal_code_key" ON "journal_entries"("journal_code");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversal_of_journal_entry_id_key" ON "journal_entries"("reversal_of_journal_entry_id");

-- CreateIndex
CREATE INDEX "journal_entries_journal_date_idx" ON "journal_entries"("journal_date");

-- CreateIndex
CREATE INDEX "journal_entries_source_type_source_id_idx" ON "journal_entries"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "journal_entries_construction_project_id_idx" ON "journal_entries"("construction_project_id");

-- CreateIndex
CREATE INDEX "journal_entries_sub_project_id_idx" ON "journal_entries"("sub_project_id");

-- CreateIndex
CREATE INDEX "journal_entries_external_rental_project_id_idx" ON "journal_entries"("external_rental_project_id");

-- CreateIndex
CREATE INDEX "journal_entries_external_supply_project_id_idx" ON "journal_entries"("external_supply_project_id");

-- CreateIndex
CREATE INDEX "journal_entry_lines_journal_entry_id_idx" ON "journal_entry_lines"("journal_entry_id");

-- CreateIndex
CREATE INDEX "journal_entry_lines_account_id_idx" ON "journal_entry_lines"("account_id");

-- CreateIndex
CREATE INDEX "accounting_period_closings_period_year_period_month_idx" ON "accounting_period_closings"("period_year", "period_month");

-- AddForeignKey
ALTER TABLE "field_expense_reports" ADD CONSTRAINT "field_expense_reports_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_payment_proofs" ADD CONSTRAINT "field_labor_wage_payment_proofs_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_journal_entry_id_fkey" FOREIGN KEY ("reversal_of_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_construction_project_id_fkey" FOREIGN KEY ("construction_project_id") REFERENCES "construction_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_sub_project_id_construction_project_id_fkey" FOREIGN KEY ("sub_project_id", "construction_project_id") REFERENCES "sub_projects"("id", "construction_project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_external_rental_project_id_fkey" FOREIGN KEY ("external_rental_project_id") REFERENCES "external_rental_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_external_supply_project_id_fkey" FOREIGN KEY ("external_supply_project_id") REFERENCES "external_supply_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_period_closings" ADD CONSTRAINT "accounting_period_closings_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_period_closings" ADD CONSTRAINT "accounting_period_closings_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- Constraint yang tidak bisa dinyatakan Prisma
-- ------------------------------------------------------------

-- Tepat satu sisi terisi per baris jurnal
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_amount_check"
  CHECK ("debit" >= 0 AND "credit" >= 0 AND (("debit" > 0) <> ("credit" > 0)));
-- F24: paling banyak satu konteks project; tahapan wajib bersama project-nya
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_context_check"
  CHECK (num_nonnulls("construction_project_id", "external_rental_project_id", "external_supply_project_id") <= 1
    AND ("sub_project_id" IS NULL OR "construction_project_id" IS NOT NULL));
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_description_check"
  CHECK (btrim("description") <> '');
-- Satu jurnal non-balik per sumber (lapis kedua di bawah claimTransition). Penyesuaian
-- (F7a) boleh berkali-kali per jurnal asal, jadi dikecualikan.
CREATE UNIQUE INDEX "journal_entries_one_per_source_key" ON "journal_entries"("source_type", "source_id")
  WHERE "reversal_of_journal_entry_id" IS NULL AND "source_type" <> 'journal_adjustment';

-- F3b: satu penutupan aktif per bulan; jejak buka kembali lengkap atau kosong
ALTER TABLE "accounting_period_closings" ADD CONSTRAINT "accounting_period_closings_month_check"
  CHECK ("period_month" BETWEEN 1 AND 12 AND "period_year" BETWEEN 2000 AND 2999);
ALTER TABLE "accounting_period_closings" ADD CONSTRAINT "accounting_period_closings_reopen_check"
  CHECK (("reopened_by" IS NULL) = ("reopened_at" IS NULL) AND ("reopened_at" IS NULL) = ("reopen_reason" IS NULL));
CREATE UNIQUE INDEX "accounting_period_closings_active_key" ON "accounting_period_closings"("period_year", "period_month")
  WHERE "reopened_at" IS NULL;

-- F6: baris `voided` tetap menyimpan jejak validasinya, jadi CHECK keputusan Finance diperluas,
-- dan jejak void wajib lengkap tepat saat status voided.
ALTER TABLE "field_expense_reports" DROP CONSTRAINT "field_expense_reports_finance_check";
ALTER TABLE "field_expense_reports" ADD CONSTRAINT "field_expense_reports_finance_check"
  CHECK (("status" IN ('validated', 'rejected', 'voided')) = ("validated_by" IS NOT NULL AND "validated_at" IS NOT NULL));
ALTER TABLE "field_expense_reports" ADD CONSTRAINT "field_expense_reports_void_check"
  CHECK (("status" = 'voided') = ("voided_by" IS NOT NULL AND "voided_at" IS NOT NULL AND "void_reason" IS NOT NULL));
ALTER TABLE "field_labor_wage_payment_proofs" DROP CONSTRAINT "field_labor_wage_payment_proofs_finance_check";
ALTER TABLE "field_labor_wage_payment_proofs" ADD CONSTRAINT "field_labor_wage_payment_proofs_finance_check"
  CHECK (("status" IN ('validated', 'rejected', 'voided')) = ("validated_by" IS NOT NULL AND "validated_at" IS NOT NULL));
ALTER TABLE "field_labor_wage_payment_proofs" ADD CONSTRAINT "field_labor_wage_payment_proofs_void_check"
  CHECK (("status" = 'voided') = ("voided_by" IS NOT NULL AND "voided_at" IS NOT NULL AND "void_reason" IS NOT NULL));

-- Tabel baru WAJIB RLS tanpa policy (REST API publik Supabase), tanpa FORCE
ALTER TABLE "chart_of_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_entry_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounting_period_closings" ENABLE ROW LEVEL SECURITY;
