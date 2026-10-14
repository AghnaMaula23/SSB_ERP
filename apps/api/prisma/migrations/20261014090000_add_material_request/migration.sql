
-- CreateEnum
CREATE TYPE "material_request_type" AS ENUM ('internal_project', 'external_supply');

-- CreateEnum
CREATE TYPE "material_request_status" AS ENUM ('submitted', 'waiting_finance_approval', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "material_requests" (
    "id" SERIAL NOT NULL,
    "request_code" VARCHAR(50) NOT NULL,
    "request_type" "material_request_type" NOT NULL,
    "sub_project_id" INTEGER,
    "external_supply_project_id" INTEGER,
    "request_date" DATE NOT NULL,
    "needed_date" DATE,
    "request_notes" TEXT,
    "status" "material_request_status" NOT NULL DEFAULT 'submitted',
    "requested_by" INTEGER NOT NULL,
    "admin_reviewed_by" INTEGER,
    "admin_reviewed_at" TIMESTAMP(3),
    "admin_notes" TEXT,
    "finance_reviewed_by" INTEGER,
    "finance_reviewed_at" TIMESTAMP(3),
    "finance_notes" TEXT,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_request_items" (
    "id" SERIAL NOT NULL,
    "material_request_id" INTEGER NOT NULL,
    "material_type_id" INTEGER NOT NULL,
    "material_pool_item_id" INTEGER,
    "requested_quantity" DECIMAL(18,2) NOT NULL,
    "admin_validated_quantity" DECIMAL(18,2),
    "item_notes" TEXT,
    "admin_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_requests_request_code_key" ON "material_requests"("request_code");

-- CreateIndex
CREATE INDEX "material_requests_request_type_status_idx" ON "material_requests"("request_type", "status");

-- CreateIndex
CREATE INDEX "material_requests_sub_project_id_request_date_idx" ON "material_requests"("sub_project_id", "request_date");

-- CreateIndex
CREATE INDEX "material_requests_external_supply_project_id_request_date_idx" ON "material_requests"("external_supply_project_id", "request_date");

-- CreateIndex
CREATE INDEX "material_request_items_material_type_id_idx" ON "material_request_items"("material_type_id");

-- CreateIndex
CREATE INDEX "material_request_items_material_pool_item_id_idx" ON "material_request_items"("material_pool_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_request_items_material_request_id_material_type_id_key" ON "material_request_items"("material_request_id", "material_type_id");

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_sub_project_id_fkey" FOREIGN KEY ("sub_project_id") REFERENCES "sub_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_external_supply_project_id_fkey" FOREIGN KEY ("external_supply_project_id") REFERENCES "external_supply_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_admin_reviewed_by_fkey" FOREIGN KEY ("admin_reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_finance_reviewed_by_fkey" FOREIGN KEY ("finance_reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_request_items" ADD CONSTRAINT "material_request_items_material_request_id_fkey" FOREIGN KEY ("material_request_id") REFERENCES "material_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_request_items" ADD CONSTRAINT "material_request_items_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_request_items" ADD CONSTRAINT "material_request_items_material_pool_item_id_fkey" FOREIGN KEY ("material_pool_item_id") REFERENCES "material_pool_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================
-- CHECK CONSTRAINT — ditulis manual, Prisma tidak bisa menyatakannya.
-- Request Material RM-2. Service menolak lebih dulu dengan pesan yang bisa
-- dibaca manusia; CHECK ini menutup jalan masuk lain (seeder, skrip, SQL manual).
-- ============================================================

-- Tepat satu konteks sesuai request_type (ERD Request Material §12).
ALTER TABLE "material_requests"
ADD CONSTRAINT "material_requests_context_check" CHECK (
  (request_type = 'internal_project' AND sub_project_id IS NOT NULL AND external_supply_project_id IS NULL)
  OR
  (request_type = 'external_supply' AND external_supply_project_id IS NOT NULL AND sub_project_id IS NULL)
);

-- Keputusan R4: kuantitas validasi Admin boleh dikurangi, tidak boleh dinaikkan
-- melebihi permintaan dan tidak boleh 0. NULL = Admin belum mengubah.
ALTER TABLE "material_request_items"
ADD CONSTRAINT "material_request_items_quantity_check" CHECK (
  requested_quantity > 0
  AND (admin_validated_quantity IS NULL
       OR (admin_validated_quantity > 0 AND admin_validated_quantity <= requested_quantity))
);
