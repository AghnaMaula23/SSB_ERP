-- CreateEnum
CREATE TYPE "equipment_request_type" AS ENUM ('internal_project', 'external_rental');

-- CreateEnum
CREATE TYPE "equipment_request_status" AS ENUM ('submitted', 'equipment_review', 'approved', 'rejected', 'cancelled');

-- AlterTable
ALTER TABLE "equipment_pool_items" ADD COLUMN     "equipment_request_item_id" INTEGER;

-- CreateTable
CREATE TABLE "equipment_requests" (
    "id" SERIAL NOT NULL,
    "request_code" VARCHAR(50) NOT NULL,
    "request_type" "equipment_request_type" NOT NULL,
    "sub_project_id" INTEGER,
    "external_rental_project_id" INTEGER,
    "request_date" DATE NOT NULL,
    "needed_date" DATE,
    "location_detail" TEXT,
    "request_notes" TEXT,
    "status" "equipment_request_status" NOT NULL DEFAULT 'submitted',
    "requested_by" INTEGER NOT NULL,
    "admin_reviewed_by" INTEGER,
    "admin_reviewed_at" TIMESTAMP(3),
    "admin_notes" TEXT,
    "equipment_reviewed_by" INTEGER,
    "equipment_reviewed_at" TIMESTAMP(3),
    "equipment_notes" TEXT,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_request_items" (
    "id" SERIAL NOT NULL,
    "equipment_request_id" INTEGER NOT NULL,
    "equipment_type_id" INTEGER NOT NULL,
    "requested_quantity" INTEGER NOT NULL,
    "approved_quantity" INTEGER,
    "estimated_workhours" DECIMAL(10,2),
    "item_notes" TEXT,
    "decision_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_requests_request_code_key" ON "equipment_requests"("request_code");

-- CreateIndex
CREATE INDEX "equipment_requests_request_type_status_idx" ON "equipment_requests"("request_type", "status");

-- CreateIndex
CREATE INDEX "equipment_requests_sub_project_id_request_date_idx" ON "equipment_requests"("sub_project_id", "request_date");

-- CreateIndex
CREATE INDEX "equipment_requests_external_rental_project_id_request_date_idx" ON "equipment_requests"("external_rental_project_id", "request_date");

-- CreateIndex
CREATE INDEX "equipment_request_items_equipment_request_id_equipment_type_idx" ON "equipment_request_items"("equipment_request_id", "equipment_type_id");

-- CreateIndex
CREATE INDEX "equipment_pool_items_equipment_request_item_id_idx" ON "equipment_pool_items"("equipment_request_item_id");

-- AddForeignKey
ALTER TABLE "equipment_pool_items" ADD CONSTRAINT "equipment_pool_items_equipment_request_item_id_fkey" FOREIGN KEY ("equipment_request_item_id") REFERENCES "equipment_request_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_requests" ADD CONSTRAINT "equipment_requests_sub_project_id_fkey" FOREIGN KEY ("sub_project_id") REFERENCES "sub_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_requests" ADD CONSTRAINT "equipment_requests_external_rental_project_id_fkey" FOREIGN KEY ("external_rental_project_id") REFERENCES "external_rental_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_requests" ADD CONSTRAINT "equipment_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_requests" ADD CONSTRAINT "equipment_requests_admin_reviewed_by_fkey" FOREIGN KEY ("admin_reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_requests" ADD CONSTRAINT "equipment_requests_equipment_reviewed_by_fkey" FOREIGN KEY ("equipment_reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_requests" ADD CONSTRAINT "equipment_requests_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_request_items" ADD CONSTRAINT "equipment_request_items_equipment_request_id_fkey" FOREIGN KEY ("equipment_request_id") REFERENCES "equipment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_request_items" ADD CONSTRAINT "equipment_request_items_equipment_type_id_fkey" FOREIGN KEY ("equipment_type_id") REFERENCES "equipment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ============================================================
-- CHECK CONSTRAINT — ditulis manual, Prisma tidak bisa menyatakannya.
-- Referensi: ERD Request Alat §11. Service menolak lebih dulu dengan pesan
-- yang bisa dibaca manusia; CHECK ini menutup jalan masuk lain (seeder,
-- skrip data, query manual).
-- ============================================================

-- Diskriminator konteks: tepat satu FK sesuai request_type.
ALTER TABLE "equipment_requests"
ADD CONSTRAINT "equipment_requests_context_check" CHECK (
  (request_type = 'internal_project' AND sub_project_id IS NOT NULL AND external_rental_project_id IS NULL)
  OR
  (request_type = 'external_rental' AND external_rental_project_id IS NOT NULL AND sub_project_id IS NULL)
);

-- approved_quantity NULL = belum diputuskan. Kalau terisi, 0..requested.
ALTER TABLE "equipment_request_items"
ADD CONSTRAINT "equipment_request_items_quantity_check" CHECK (
  requested_quantity > 0
  AND (approved_quantity IS NULL OR (approved_quantity >= 0 AND approved_quantity <= requested_quantity))
);
