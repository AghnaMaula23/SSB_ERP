-- Fondasi lampiran (docs/keputusan-desain-lampiran.md) + RM-4 delivery & surat jalan
-- (docs/keputusan-desain-request-material.md G1–G5).
--
-- external_supply_projects.field_pic_id sudah keluar dari schema.prisma & kode
-- (16 Okt 2026), tapi DROP COLUMN SENGAJA DITUNDA ke migrasi terpisah: database
-- dev dipakai bersama, dan backend rekan yang belum pull masih membacanya.

-- CreateEnum
CREATE TYPE "file_status" AS ENUM ('active', 'superseded', 'trashed');

-- CreateTable
CREATE TABLE "files" (
    "id" SERIAL NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "status" "file_status" NOT NULL DEFAULT 'active',
    "replaced_by_id" INTEGER,
    "uploaded_by" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trashed_by" INTEGER,
    "trashed_at" TIMESTAMP(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_deliveries" (
    "id" SERIAL NOT NULL,
    "delivery_code" VARCHAR(50) NOT NULL,
    "material_request_id" INTEGER NOT NULL,
    "material_request_item_id" INTEGER NOT NULL,
    "delivered_quantity" DECIMAL(18,2) NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "delivery_note_number" VARCHAR(100) NOT NULL,
    "delivery_note_date" DATE NOT NULL,
    "delivery_note_file_id" INTEGER NOT NULL,
    "vehicle_type" VARCHAR(50),
    "vehicle_number" VARCHAR(30) NOT NULL,
    "driver_name" VARCHAR(150) NOT NULL,
    "driver_phone" VARCHAR(50),
    "origin_location" VARCHAR(255),
    "destination_location" VARCHAR(255),
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "files_replaced_by_id_key" ON "files"("replaced_by_id");

-- CreateIndex
CREATE INDEX "files_status_trashed_at_idx" ON "files"("status", "trashed_at");

-- CreateIndex
CREATE UNIQUE INDEX "material_deliveries_delivery_code_key" ON "material_deliveries"("delivery_code");

-- CreateIndex
CREATE UNIQUE INDEX "material_deliveries_delivery_note_file_id_key" ON "material_deliveries"("delivery_note_file_id");

-- CreateIndex
CREATE INDEX "material_deliveries_material_request_id_idx" ON "material_deliveries"("material_request_id");

-- CreateIndex
CREATE INDEX "material_deliveries_material_request_item_id_material_reque_idx" ON "material_deliveries"("material_request_item_id", "material_request_id");

-- CreateIndex
-- NULLS NOT DISTINCT: delivery aktif (cancelled_at NULL) saling bentrok, yang batal tidak.
-- Koreksi = batalkan lalu catat ulang dengan nomor surat jalan yang sama.
CREATE UNIQUE INDEX "material_deliveries_supplier_id_delivery_note_number_cancel_key" ON "material_deliveries"("supplier_id", "delivery_note_number", "cancelled_at") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "material_request_items_id_material_request_id_key" ON "material_request_items"("id", "material_request_id");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_trashed_by_fkey" FOREIGN KEY ("trashed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_material_request_id_fkey" FOREIGN KEY ("material_request_id") REFERENCES "material_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_material_request_item_id_material_requ_fkey" FOREIGN KEY ("material_request_item_id", "material_request_id") REFERENCES "material_request_items"("id", "material_request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_delivery_note_file_id_fkey" FOREIGN KEY ("delivery_note_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- CHECK (Prisma tidak bisa menyatakannya)
-- superseded <=> menunjuk penggantinya; trashed <=> jejak siapa & kapan lengkap
ALTER TABLE "files" ADD CONSTRAINT "files_superseded_check"
  CHECK ((status = 'superseded') = (replaced_by_id IS NOT NULL));
ALTER TABLE "files" ADD CONSTRAINT "files_trashed_check"
  CHECK ((status = 'trashed') = (trashed_at IS NOT NULL AND trashed_by IS NOT NULL));
ALTER TABLE "files" ADD CONSTRAINT "files_size_check" CHECK (size_bytes > 0);

ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_quantity_check"
  CHECK (delivered_quantity > 0);
-- Kolom pembatalan terisi bersamaan atau kosong bersamaan
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_cancel_check"
  CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL) AND (cancelled_at IS NULL) = (cancel_reason IS NULL));

-- RLS tanpa policy: tutup REST API publik Supabase (berlaku sejak 14 Okt 2026)
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material_deliveries" ENABLE ROW LEVEL SECURITY;
