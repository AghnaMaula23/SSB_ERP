/*
  Warnings:

  - You are about to drop the column `purchase_request_item_id` on the `maintenance_records` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "purchase_order_category" AS ENUM ('repair', 'maintenance', 'stock');

-- CreateEnum
CREATE TYPE "purchase_request_status" AS ENUM ('submitted', 'rejected_by_admin', 'waiting_finance_approval', 'rejected_by_finance', 'approved', 'cancelled');

-- AlterTable
ALTER TABLE "maintenance_records" DROP COLUMN "purchase_request_item_id",
ADD COLUMN     "purchase_request_id" INTEGER;

-- CreateTable
CREATE TABLE "equipment_purchase_requests" (
    "id" SERIAL NOT NULL,
    "request_code" VARCHAR(50) NOT NULL,
    "request_date" DATE NOT NULL,
    "order_category" "purchase_order_category" NOT NULL,
    "status" "purchase_request_status" NOT NULL DEFAULT 'submitted',
    "total_estimated_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_approved_amount" DECIMAL(18,2),
    "requested_by" INTEGER NOT NULL,
    "admin_validated_by" INTEGER,
    "admin_validated_at" TIMESTAMP(3),
    "finance_approved_by" INTEGER,
    "finance_approved_at" TIMESTAMP(3),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_purchase_repair_items" (
    "id" SERIAL NOT NULL,
    "purchase_request_id" INTEGER NOT NULL,
    "order_category" "purchase_order_category" NOT NULL DEFAULT 'repair',
    "damage_log_id" INTEGER NOT NULL,
    "estimated_service_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "approved_service_price" DECIMAL(18,2),
    "description" TEXT,

    CONSTRAINT "equipment_purchase_repair_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_purchase_repair_spareparts" (
    "id" SERIAL NOT NULL,
    "repair_item_id" INTEGER NOT NULL,
    "item_name" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL DEFAULT 1,
    "estimated_unit_price" DECIMAL(18,2) NOT NULL,
    "estimated_total_price" DECIMAL(18,2) NOT NULL,
    "approved_total_price" DECIMAL(18,2),

    CONSTRAINT "equipment_purchase_repair_spareparts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_purchase_maintenance_items" (
    "id" SERIAL NOT NULL,
    "purchase_request_id" INTEGER NOT NULL,
    "order_category" "purchase_order_category" NOT NULL DEFAULT 'maintenance',
    "maintenance_setting_id" INTEGER NOT NULL,
    "estimated_price" DECIMAL(18,2) NOT NULL,
    "approved_price" DECIMAL(18,2),

    CONSTRAINT "equipment_purchase_maintenance_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_purchase_stock_items" (
    "id" SERIAL NOT NULL,
    "purchase_request_id" INTEGER NOT NULL,
    "order_category" "purchase_order_category" NOT NULL DEFAULT 'stock',
    "item_name" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "estimated_unit_price" DECIMAL(18,2) NOT NULL,
    "estimated_total_price" DECIMAL(18,2) NOT NULL,
    "approved_total_price" DECIMAL(18,2),

    CONSTRAINT "equipment_purchase_stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_purchase_requests_request_code_key" ON "equipment_purchase_requests"("request_code");

-- CreateIndex
CREATE INDEX "equipment_purchase_requests_order_category_status_idx" ON "equipment_purchase_requests"("order_category", "status");

-- CreateIndex
CREATE INDEX "equipment_purchase_requests_request_date_idx" ON "equipment_purchase_requests"("request_date");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_purchase_requests_id_order_category_key" ON "equipment_purchase_requests"("id", "order_category");

-- CreateIndex
CREATE INDEX "equipment_purchase_repair_items_damage_log_id_idx" ON "equipment_purchase_repair_items"("damage_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_purchase_repair_items_purchase_request_id_damage__key" ON "equipment_purchase_repair_items"("purchase_request_id", "damage_log_id");

-- CreateIndex
CREATE INDEX "equipment_purchase_repair_spareparts_repair_item_id_idx" ON "equipment_purchase_repair_spareparts"("repair_item_id");

-- CreateIndex
CREATE INDEX "equipment_purchase_maintenance_items_maintenance_setting_id_idx" ON "equipment_purchase_maintenance_items"("maintenance_setting_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_purchase_maintenance_items_purchase_request_id_ma_key" ON "equipment_purchase_maintenance_items"("purchase_request_id", "maintenance_setting_id");

-- CreateIndex
CREATE INDEX "equipment_purchase_stock_items_purchase_request_id_idx" ON "equipment_purchase_stock_items"("purchase_request_id");

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "equipment_purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_purchase_requests" ADD CONSTRAINT "equipment_purchase_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_purchase_requests" ADD CONSTRAINT "equipment_purchase_requests_admin_validated_by_fkey" FOREIGN KEY ("admin_validated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_purchase_requests" ADD CONSTRAINT "equipment_purchase_requests_finance_approved_by_fkey" FOREIGN KEY ("finance_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_purchase_requests" ADD CONSTRAINT "equipment_purchase_requests_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_purchase_repair_items" ADD CONSTRAINT "equipment_purchase_repair_items_purchase_request_id_order__fkey" FOREIGN KEY ("purchase_request_id", "order_category") REFERENCES "equipment_purchase_requests"("id", "order_category") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_purchase_repair_items" ADD CONSTRAINT "equipment_purchase_repair_items_damage_log_id_fkey" FOREIGN KEY ("damage_log_id") REFERENCES "damage_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_purchase_repair_spareparts" ADD CONSTRAINT "equipment_purchase_repair_spareparts_repair_item_id_fkey" FOREIGN KEY ("repair_item_id") REFERENCES "equipment_purchase_repair_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_purchase_maintenance_items" ADD CONSTRAINT "equipment_purchase_maintenance_items_purchase_request_id_o_fkey" FOREIGN KEY ("purchase_request_id", "order_category") REFERENCES "equipment_purchase_requests"("id", "order_category") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_purchase_maintenance_items" ADD CONSTRAINT "equipment_purchase_maintenance_items_maintenance_setting_i_fkey" FOREIGN KEY ("maintenance_setting_id") REFERENCES "equipment_maintenance_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_purchase_stock_items" ADD CONSTRAINT "equipment_purchase_stock_items_purchase_request_id_order_c_fkey" FOREIGN KEY ("purchase_request_id", "order_category") REFERENCES "equipment_purchase_requests"("id", "order_category") ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================================
-- CHECK CONSTRAINT — ditulis manual, Prisma tidak bisa menyatakannya.
-- Dikombinasikan dengan composite FK di atas, baris item tidak mungkin
-- menempel ke header berkategori lain: CHECK mengunci nilai order_category
-- di tabel item, composite FK memaksa nilai itu cocok dengan header.
-- =====================================================================

ALTER TABLE "equipment_purchase_repair_items"
  ADD CONSTRAINT "chk_repair_items_category" CHECK ("order_category" = 'repair');

ALTER TABLE "equipment_purchase_maintenance_items"
  ADD CONSTRAINT "chk_maintenance_items_category" CHECK ("order_category" = 'maintenance');

ALTER TABLE "equipment_purchase_stock_items"
  ADD CONSTRAINT "chk_stock_items_category" CHECK ("order_category" = 'stock');

-- Nominal tidak boleh negatif; jumlah harus lebih dari nol
ALTER TABLE "equipment_purchase_repair_items"
  ADD CONSTRAINT "chk_repair_service_price" CHECK ("estimated_service_price" >= 0);

ALTER TABLE "equipment_purchase_repair_spareparts"
  ADD CONSTRAINT "chk_repair_sparepart_amount"
  CHECK ("quantity" > 0 AND "estimated_unit_price" >= 0 AND "estimated_total_price" >= 0);

ALTER TABLE "equipment_purchase_maintenance_items"
  ADD CONSTRAINT "chk_maintenance_items_amount" CHECK ("estimated_price" >= 0);

ALTER TABLE "equipment_purchase_stock_items"
  ADD CONSTRAINT "chk_stock_items_amount"
  CHECK ("quantity" > 0 AND "estimated_unit_price" >= 0 AND "estimated_total_price" >= 0);
