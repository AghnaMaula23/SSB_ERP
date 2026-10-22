-- RM-5: receipt + stok (docs/keputusan-desain-request-material.md H1–H6).
-- Aditif. DROP external_supply_projects.field_pic_id tetap DITUNDA (lihat migrasi
-- 20261016090000) — baris DROP-nya dibuang dari diff di bawah.

-- CreateEnum
CREATE TYPE "material_movement_type" AS ENUM ('used', 'adjustment_in', 'adjustment_out');

-- CreateTable
CREATE TABLE "material_receipts" (
    "id" SERIAL NOT NULL,
    "receipt_code" VARCHAR(50) NOT NULL,
    "material_delivery_id" INTEGER NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "received_quantity" DECIMAL(18,2) NOT NULL,
    "accepted_quantity" DECIMAL(18,2) NOT NULL,
    "external_receiver_name" VARCHAR(150),
    "external_receiver_phone" VARCHAR(50),
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_receipt_attachments" (
    "id" SERIAL NOT NULL,
    "material_receipt_id" INTEGER NOT NULL,
    "file_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_receipt_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_stock_movements" (
    "id" SERIAL NOT NULL,
    "sub_project_id" INTEGER NOT NULL,
    "material_type_id" INTEGER NOT NULL,
    "movement_type" "material_movement_type" NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "movement_date" DATE NOT NULL,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_receipts_receipt_code_key" ON "material_receipts"("receipt_code");

-- CreateIndex
CREATE UNIQUE INDEX "material_receipts_material_delivery_id_cancelled_at_key" ON "material_receipts"("material_delivery_id", "cancelled_at") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "material_receipt_attachments_file_id_key" ON "material_receipt_attachments"("file_id");

-- CreateIndex
CREATE INDEX "material_receipt_attachments_material_receipt_id_idx" ON "material_receipt_attachments"("material_receipt_id");

-- CreateIndex
CREATE INDEX "material_stock_movements_sub_project_id_material_type_id_idx" ON "material_stock_movements"("sub_project_id", "material_type_id");

-- AddForeignKey
ALTER TABLE "material_receipts" ADD CONSTRAINT "material_receipts_material_delivery_id_fkey" FOREIGN KEY ("material_delivery_id") REFERENCES "material_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_receipts" ADD CONSTRAINT "material_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_receipts" ADD CONSTRAINT "material_receipts_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_receipt_attachments" ADD CONSTRAINT "material_receipt_attachments_material_receipt_id_fkey" FOREIGN KEY ("material_receipt_id") REFERENCES "material_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_receipt_attachments" ADD CONSTRAINT "material_receipt_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_stock_movements" ADD CONSTRAINT "material_stock_movements_sub_project_id_fkey" FOREIGN KEY ("sub_project_id") REFERENCES "sub_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_stock_movements" ADD CONSTRAINT "material_stock_movements_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_stock_movements" ADD CONSTRAINT "material_stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_stock_movements" ADD CONSTRAINT "material_stock_movements_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- CHECK (Prisma tidak bisa menyatakannya)
ALTER TABLE "material_receipts" ADD CONSTRAINT "material_receipts_quantity_check"
  CHECK (received_quantity > 0 AND accepted_quantity >= 0 AND accepted_quantity <= received_quantity);
ALTER TABLE "material_receipts" ADD CONSTRAINT "material_receipts_cancel_check"
  CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL) AND (cancelled_at IS NULL) = (cancel_reason IS NULL));

ALTER TABLE "material_stock_movements" ADD CONSTRAINT "material_stock_movements_quantity_check"
  CHECK (quantity > 0);
-- Koreksi opname wajib beralasan
ALTER TABLE "material_stock_movements" ADD CONSTRAINT "material_stock_movements_notes_check"
  CHECK (movement_type = 'used' OR (notes IS NOT NULL AND length(btrim(notes)) > 0));
ALTER TABLE "material_stock_movements" ADD CONSTRAINT "material_stock_movements_cancel_check"
  CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL) AND (cancelled_at IS NULL) = (cancel_reason IS NULL));

-- RLS tanpa policy: tutup REST API publik Supabase (berlaku sejak 14 Okt 2026)
ALTER TABLE "material_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material_receipt_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material_stock_movements" ENABLE ROW LEVEL SECURITY;
