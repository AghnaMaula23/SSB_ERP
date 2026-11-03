-- Kas lapangan — laporan realisasi + nota (docs/plan-divisi-lapangan.md L1, L2, L4; T12).
-- Dihasilkan `prisma migrate diff --from-schema-datasource`, tanpa 3 DROP yang
-- sengaja ditunda (field_pic_id, threshold_value, default_threshold_value).

-- CreateEnum
CREATE TYPE "field_expense_report_status" AS ENUM ('submitted', 'validated', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "field_expense_reports" (
    "id" SERIAL NOT NULL,
    "report_code" VARCHAR(50) NOT NULL,
    "field_operational_request_id" INTEGER,
    "sub_project_id" INTEGER NOT NULL,
    "report_date" DATE NOT NULL,
    "urgent_reason" TEXT,
    "notes" TEXT,
    "status" "field_expense_report_status" NOT NULL DEFAULT 'submitted',
    "submitted_by" INTEGER NOT NULL,
    "validated_by" INTEGER,
    "validated_at" TIMESTAMP(3),
    "finance_notes" TEXT,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_expense_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_expense_report_items" (
    "id" SERIAL NOT NULL,
    "field_expense_report_id" INTEGER NOT NULL,
    "field_operational_request_item_id" INTEGER,
    "field_expense_category_id" INTEGER NOT NULL,
    "expense_date" DATE NOT NULL,
    "item_name" VARCHAR(150) NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "vendor_name" VARCHAR(150),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_expense_report_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_expense_receipts" (
    "id" SERIAL NOT NULL,
    "field_expense_report_id" INTEGER NOT NULL,
    "file_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_expense_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_expense_reports_report_code_key" ON "field_expense_reports"("report_code");

-- CreateIndex
CREATE INDEX "field_expense_reports_sub_project_id_report_date_idx" ON "field_expense_reports"("sub_project_id", "report_date");

-- CreateIndex
CREATE INDEX "field_expense_reports_field_operational_request_id_idx" ON "field_expense_reports"("field_operational_request_id");

-- CreateIndex
CREATE INDEX "field_expense_reports_status_idx" ON "field_expense_reports"("status");

-- CreateIndex
CREATE INDEX "field_expense_report_items_field_expense_report_id_idx" ON "field_expense_report_items"("field_expense_report_id");

-- CreateIndex
CREATE INDEX "field_expense_report_items_field_operational_request_item_i_idx" ON "field_expense_report_items"("field_operational_request_item_id");

-- CreateIndex
CREATE INDEX "field_expense_report_items_field_expense_category_id_idx" ON "field_expense_report_items"("field_expense_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_expense_receipts_file_id_key" ON "field_expense_receipts"("file_id");

-- CreateIndex
CREATE INDEX "field_expense_receipts_field_expense_report_id_idx" ON "field_expense_receipts"("field_expense_report_id");

-- AddForeignKey
ALTER TABLE "field_expense_reports" ADD CONSTRAINT "field_expense_reports_field_operational_request_id_fkey" FOREIGN KEY ("field_operational_request_id") REFERENCES "field_operational_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_expense_reports" ADD CONSTRAINT "field_expense_reports_sub_project_id_fkey" FOREIGN KEY ("sub_project_id") REFERENCES "sub_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_expense_reports" ADD CONSTRAINT "field_expense_reports_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_expense_reports" ADD CONSTRAINT "field_expense_reports_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_expense_reports" ADD CONSTRAINT "field_expense_reports_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_expense_report_items" ADD CONSTRAINT "field_expense_report_items_field_expense_report_id_fkey" FOREIGN KEY ("field_expense_report_id") REFERENCES "field_expense_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_expense_report_items" ADD CONSTRAINT "field_expense_report_items_field_operational_request_item__fkey" FOREIGN KEY ("field_operational_request_item_id") REFERENCES "field_operational_request_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_expense_report_items" ADD CONSTRAINT "field_expense_report_items_field_expense_category_id_fkey" FOREIGN KEY ("field_expense_category_id") REFERENCES "field_expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_expense_receipts" ADD CONSTRAINT "field_expense_receipts_field_expense_report_id_fkey" FOREIGN KEY ("field_expense_report_id") REFERENCES "field_expense_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_expense_receipts" ADD CONSTRAINT "field_expense_receipts_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ------------------------------------------------------------
-- Tidak bisa dinyatakan di schema.prisma
-- ------------------------------------------------------------

-- L1: merujuk pengajuan XOR mendesak dengan alasan
ALTER TABLE "field_expense_reports" ADD CONSTRAINT "field_expense_reports_urgent_check"
  CHECK (("field_operational_request_id" IS NULL) = ("urgent_reason" IS NOT NULL AND btrim("urgent_reason") <> ''));
-- Jejak keputusan lengkap sesuai status (alasan tolak/batal wajib)
ALTER TABLE "field_expense_reports" ADD CONSTRAINT "field_expense_reports_cancel_check"
  CHECK (("status" = 'cancelled') = ("cancelled_by" IS NOT NULL AND "cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
ALTER TABLE "field_expense_reports" ADD CONSTRAINT "field_expense_reports_finance_check"
  CHECK (("status" IN ('validated', 'rejected')) = ("validated_by" IS NOT NULL AND "validated_at" IS NOT NULL));
ALTER TABLE "field_expense_reports" ADD CONSTRAINT "field_expense_reports_reject_check"
  CHECK ("status" <> 'rejected' OR "finance_notes" IS NOT NULL);

ALTER TABLE "field_expense_report_items" ADD CONSTRAINT "field_expense_report_items_quantity_check"
  CHECK ("quantity" > 0);
ALTER TABLE "field_expense_report_items" ADD CONSTRAINT "field_expense_report_items_price_check"
  CHECK ("unit_price" >= 0);
ALTER TABLE "field_expense_report_items" ADD CONSTRAINT "field_expense_report_items_text_check"
  CHECK (btrim("item_name") <> '' AND btrim("unit") <> '');

-- Tabel baru WAJIB RLS tanpa policy (REST API publik Supabase), tanpa FORCE
ALTER TABLE "field_expense_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_expense_report_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_expense_receipts" ENABLE ROW LEVEL SECURITY;
