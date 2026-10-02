-- Batch 5 — Kas Alat.
--
-- Ditulis manual, bukan `prisma migrate dev`: koneksi Supabase lewat pooler tidak
-- mengizinkan shadow database, sehingga migrate dev menawarkan RESET database
-- bersama. Lebih jauh lagi, percobaan `migrate dev --create-only` pada 28 Sep
-- TERBUKTI menulis ke database utama meski perintahnya berakhir gagal — ia
-- membuat ulang kolom maintenance_records.purchase_request_item_id yang sudah
-- dihapus migrasi Batch 4 (terlihat dari attnum 17, sesudah purchase_request_id
-- di attnum 16). Jangan pakai migrate dev di proyek ini.

-- Membersihkan kolom yatim dari kejadian di atas. Terverifikasi kosong:
-- 10 baris maintenance_records, 0 yang terisi.
ALTER TABLE "maintenance_records" DROP COLUMN "purchase_request_item_id";

-- CreateEnum
CREATE TYPE "cash_transaction_type" AS ENUM ('cash_in', 'cash_out');

-- CreateEnum
CREATE TYPE "cash_transaction_source_type" AS ENUM ('opening_balance', 'equipment_income_claim', 'equipment_purchase_request', 'manual_expense', 'adjustment');

-- AlterTable

-- CreateTable
CREATE TABLE "equipment_cash_category" (
    "id" SERIAL NOT NULL,
    "category_name" VARCHAR(150) NOT NULL,
    "transaction_type" "cash_transaction_type" NOT NULL,
    "order_category" "purchase_order_category",
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_cash_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_cash_transaction" (
    "id" SERIAL NOT NULL,
    "transaction_code" VARCHAR(50) NOT NULL,
    "transaction_date" DATE NOT NULL,
    "transaction_type" "cash_transaction_type" NOT NULL,
    "category_id" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "source_type" "cash_transaction_source_type" NOT NULL,
    "source_id" INTEGER,
    "description" TEXT NOT NULL,
    "is_voided" BOOLEAN NOT NULL DEFAULT false,
    "void_reason" TEXT,
    "voided_by" INTEGER,
    "voided_at" TIMESTAMP(3),
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_cash_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_cash_category_order_category_key" ON "equipment_cash_category"("order_category");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_cash_category_category_name_transaction_type_key" ON "equipment_cash_category"("category_name", "transaction_type");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_cash_transaction_transaction_code_key" ON "equipment_cash_transaction"("transaction_code");

-- CreateIndex
CREATE INDEX "equipment_cash_transaction_transaction_date_idx" ON "equipment_cash_transaction"("transaction_date");

-- CreateIndex
CREATE INDEX "equipment_cash_transaction_source_type_source_id_idx" ON "equipment_cash_transaction"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "equipment_cash_transaction_category_id_idx" ON "equipment_cash_transaction"("category_id");

-- CreateIndex
CREATE INDEX "equipment_cash_transaction_is_voided_idx" ON "equipment_cash_transaction"("is_voided");

-- AddForeignKey
ALTER TABLE "equipment_cash_transaction" ADD CONSTRAINT "equipment_cash_transaction_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "equipment_cash_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_cash_transaction" ADD CONSTRAINT "equipment_cash_transaction_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_cash_transaction" ADD CONSTRAINT "equipment_cash_transaction_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

