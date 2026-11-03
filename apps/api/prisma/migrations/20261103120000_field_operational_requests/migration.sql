-- Kas lapangan — pengajuan dana operasional (docs/plan-divisi-lapangan.md L1–L3,
-- T11). Laporan realisasi + nota (field_expense_reports*) menyusul di T12.
-- Dihasilkan `prisma migrate diff` (schema HEAD → schema baru), tanpa 3 DROP yang
-- sengaja ditunda (field_pic_id, threshold_value, default_threshold_value).

-- CreateEnum
CREATE TYPE "field_operational_request_status" AS ENUM ('submitted', 'waiting_finance_approval', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "field_expense_categories" (
    "id" SERIAL NOT NULL,
    "category_code" VARCHAR(30) NOT NULL,
    "category_name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_operational_requests" (
    "id" SERIAL NOT NULL,
    "request_code" VARCHAR(50) NOT NULL,
    "sub_project_id" INTEGER NOT NULL,
    "request_date" DATE NOT NULL,
    "needed_date" DATE,
    "notes" TEXT,
    "status" "field_operational_request_status" NOT NULL DEFAULT 'submitted',
    "requested_by" INTEGER NOT NULL,
    "admin_validated_by" INTEGER,
    "admin_validated_at" TIMESTAMP(3),
    "admin_notes" TEXT,
    "finance_reviewed_by" INTEGER,
    "finance_reviewed_at" TIMESTAMP(3),
    "finance_notes" TEXT,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_operational_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_operational_request_items" (
    "id" SERIAL NOT NULL,
    "field_operational_request_id" INTEGER NOT NULL,
    "field_expense_category_id" INTEGER NOT NULL,
    "item_name" VARCHAR(150) NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "estimated_unit_price" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_operational_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_expense_categories_category_code_key" ON "field_expense_categories"("category_code");

-- CreateIndex
CREATE UNIQUE INDEX "field_expense_categories_category_name_key" ON "field_expense_categories"("category_name");

-- CreateIndex
CREATE UNIQUE INDEX "field_operational_requests_request_code_key" ON "field_operational_requests"("request_code");

-- CreateIndex
CREATE INDEX "field_operational_requests_sub_project_id_status_idx" ON "field_operational_requests"("sub_project_id", "status");

-- CreateIndex
CREATE INDEX "field_operational_requests_requested_by_request_date_idx" ON "field_operational_requests"("requested_by", "request_date");

-- CreateIndex
CREATE INDEX "field_operational_request_items_field_operational_request_i_idx" ON "field_operational_request_items"("field_operational_request_id");

-- CreateIndex
CREATE INDEX "field_operational_request_items_field_expense_category_id_idx" ON "field_operational_request_items"("field_expense_category_id");

-- AddForeignKey
ALTER TABLE "field_operational_requests" ADD CONSTRAINT "field_operational_requests_sub_project_id_fkey" FOREIGN KEY ("sub_project_id") REFERENCES "sub_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_operational_requests" ADD CONSTRAINT "field_operational_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_operational_requests" ADD CONSTRAINT "field_operational_requests_admin_validated_by_fkey" FOREIGN KEY ("admin_validated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_operational_requests" ADD CONSTRAINT "field_operational_requests_finance_reviewed_by_fkey" FOREIGN KEY ("finance_reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_operational_requests" ADD CONSTRAINT "field_operational_requests_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_operational_request_items" ADD CONSTRAINT "field_operational_request_items_field_operational_request__fkey" FOREIGN KEY ("field_operational_request_id") REFERENCES "field_operational_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_operational_request_items" ADD CONSTRAINT "field_operational_request_items_field_expense_category_id_fkey" FOREIGN KEY ("field_expense_category_id") REFERENCES "field_expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ------------------------------------------------------------
-- Tidak bisa dinyatakan di schema.prisma
-- ------------------------------------------------------------

ALTER TABLE "field_expense_categories" ADD CONSTRAINT "field_expense_categories_code_check"
  CHECK (btrim("category_code") <> '' AND btrim("category_name") <> '');

ALTER TABLE "field_operational_requests" ADD CONSTRAINT "field_operational_requests_needed_date_check"
  CHECK ("needed_date" IS NULL OR "needed_date" >= "request_date");
-- Jejak keputusan wajib lengkap sesuai status (alasan tolak/batal wajib)
ALTER TABLE "field_operational_requests" ADD CONSTRAINT "field_operational_requests_cancel_check"
  CHECK (("status" = 'cancelled') = ("cancelled_by" IS NOT NULL AND "cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
ALTER TABLE "field_operational_requests" ADD CONSTRAINT "field_operational_requests_admin_check"
  CHECK ("status" NOT IN ('waiting_finance_approval', 'approved')
    OR ("admin_validated_by" IS NOT NULL AND "admin_validated_at" IS NOT NULL));
ALTER TABLE "field_operational_requests" ADD CONSTRAINT "field_operational_requests_finance_check"
  CHECK (("finance_reviewed_at" IS NOT NULL) = ("status" = 'approved'
    OR ("status" = 'rejected' AND "admin_validated_at" IS NOT NULL AND "finance_notes" IS NOT NULL AND "finance_reviewed_by" IS NOT NULL)));
ALTER TABLE "field_operational_requests" ADD CONSTRAINT "field_operational_requests_reject_check"
  CHECK ("status" <> 'rejected' OR "finance_notes" IS NOT NULL OR "admin_notes" IS NOT NULL);

ALTER TABLE "field_operational_request_items" ADD CONSTRAINT "field_operational_request_items_quantity_check"
  CHECK ("quantity" > 0);
ALTER TABLE "field_operational_request_items" ADD CONSTRAINT "field_operational_request_items_price_check"
  CHECK ("estimated_unit_price" >= 0);
ALTER TABLE "field_operational_request_items" ADD CONSTRAINT "field_operational_request_items_text_check"
  CHECK (btrim("item_name") <> '' AND btrim("unit") <> '');

-- Tabel baru WAJIB RLS tanpa policy (REST API publik Supabase), tanpa FORCE
ALTER TABLE "field_expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_operational_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_operational_request_items" ENABLE ROW LEVEL SECURITY;
