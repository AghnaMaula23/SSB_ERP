-- CreateEnum
CREATE TYPE "maintenance_setting_status" AS ENUM ('normal', 'warning', 'due', 'overdue', 'inactive');

-- CreateEnum
CREATE TYPE "maintenance_type" AS ENUM ('routine', 'repair', 'replacement', 'inspection', 'adjustment');

-- CreateEnum
CREATE TYPE "maintenance_record_status" AS ENUM ('completed', 'cancelled');

-- CreateTable
CREATE TABLE "maintenance_aspects" (
    "id" SERIAL NOT NULL,
    "aspect_code" VARCHAR(50) NOT NULL,
    "aspect_name" VARCHAR(150) NOT NULL,
    "default_threshold_value" DECIMAL(12,2),
    "warning_lead_value" DECIMAL(12,2) NOT NULL DEFAULT 50,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_aspects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_maintenance_settings" (
    "id" SERIAL NOT NULL,
    "equipment_item_id" INTEGER NOT NULL,
    "maintenance_aspect_id" INTEGER NOT NULL,
    "threshold_value" DECIMAL(12,2) NOT NULL,
    "current_value_since_reset" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "maintenance_setting_status" NOT NULL DEFAULT 'normal',
    "last_maintenance_date" DATE,
    "last_reset_workhour" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_maintenance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" SERIAL NOT NULL,
    "maintenance_code" VARCHAR(50) NOT NULL,
    "equipment_item_id" INTEGER NOT NULL,
    "maintenance_setting_id" INTEGER,
    "damage_log_id" INTEGER,
    "purchase_request_item_id" INTEGER,
    "maintenance_type" "maintenance_type" NOT NULL,
    "maintenance_date" DATE NOT NULL,
    "workhour_at_maintenance" DECIMAL(12,2),
    "action_description" TEXT NOT NULL,
    "performed_by" VARCHAR(150),
    "status" "maintenance_record_status" NOT NULL DEFAULT 'completed',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" SERIAL NOT NULL,
    "doc_type" VARCHAR(20) NOT NULL,
    "period" VARCHAR(10) NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_aspects_aspect_code_key" ON "maintenance_aspects"("aspect_code");

-- CreateIndex
CREATE INDEX "equipment_maintenance_settings_status_idx" ON "equipment_maintenance_settings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_maintenance_settings_equipment_item_id_maintenanc_key" ON "equipment_maintenance_settings"("equipment_item_id", "maintenance_aspect_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_records_maintenance_code_key" ON "maintenance_records"("maintenance_code");

-- CreateIndex
CREATE INDEX "maintenance_records_equipment_item_id_maintenance_date_idx" ON "maintenance_records"("equipment_item_id", "maintenance_date");

-- CreateIndex
CREATE INDEX "maintenance_records_maintenance_setting_id_maintenance_date_idx" ON "maintenance_records"("maintenance_setting_id", "maintenance_date");

-- CreateIndex
CREATE INDEX "maintenance_records_maintenance_date_idx" ON "maintenance_records"("maintenance_date");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_doc_type_period_key" ON "document_sequences"("doc_type", "period");

-- AddForeignKey
ALTER TABLE "equipment_maintenance_settings" ADD CONSTRAINT "equipment_maintenance_settings_equipment_item_id_fkey" FOREIGN KEY ("equipment_item_id") REFERENCES "equipment_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_maintenance_settings" ADD CONSTRAINT "equipment_maintenance_settings_maintenance_aspect_id_fkey" FOREIGN KEY ("maintenance_aspect_id") REFERENCES "maintenance_aspects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_equipment_item_id_fkey" FOREIGN KEY ("equipment_item_id") REFERENCES "equipment_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_maintenance_setting_id_fkey" FOREIGN KEY ("maintenance_setting_id") REFERENCES "equipment_maintenance_settings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
