-- CreateEnum
CREATE TYPE "equipment_item_status" AS ENUM ('available', 'assigned', 'delivered_to_location', 'received_at_site', 'in_use', 'maintenance', 'damaged', 'retired');

-- CreateEnum
CREATE TYPE "workhour_source_type" AS ENUM ('internal_project', 'external_rental', 'manual_adjustment');

-- CreateTable
CREATE TABLE "equipment_types" (
    "id" SERIAL NOT NULL,
    "type_code" VARCHAR(50) NOT NULL,
    "type_name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_items" (
    "id" SERIAL NOT NULL,
    "equipment_type_id" INTEGER NOT NULL,
    "asset_code" VARCHAR(50) NOT NULL,
    "plate_number" VARCHAR(30),
    "brand" VARCHAR(100),
    "model" VARCHAR(100),
    "serial_number" VARCHAR(100),
    "manufacture_year" INTEGER,
    "current_status" "equipment_item_status" NOT NULL DEFAULT 'available',
    "total_workhour" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "default_hourly_rate" DECIMAL(18,2),
    "rate_notes" TEXT,
    "rate_updated_at" TIMESTAMP(3),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_status_logs" (
    "id" SERIAL NOT NULL,
    "equipment_item_id" INTEGER NOT NULL,
    "old_status" "equipment_item_status",
    "new_status" "equipment_item_status" NOT NULL,
    "source_type" VARCHAR(80),
    "source_id" INTEGER,
    "notes" TEXT,
    "changed_by" INTEGER,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_workhour_logs" (
    "id" SERIAL NOT NULL,
    "equipment_item_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "sub_project_id" INTEGER,
    "work_date" DATE NOT NULL,
    "started_at" TIMESTAMP(3),
    "stopped_at" TIMESTAMP(3),
    "total_workhour" DECIMAL(10,2) NOT NULL,
    "source_type" "workhour_source_type" NOT NULL,
    "description" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_workhour_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_types_type_code_key" ON "equipment_types"("type_code");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_items_asset_code_key" ON "equipment_items"("asset_code");

-- CreateIndex
CREATE INDEX "equipment_items_equipment_type_id_idx" ON "equipment_items"("equipment_type_id");

-- CreateIndex
CREATE INDEX "equipment_items_current_status_idx" ON "equipment_items"("current_status");

-- CreateIndex
CREATE INDEX "equipment_status_logs_equipment_item_id_changed_at_idx" ON "equipment_status_logs"("equipment_item_id", "changed_at");

-- CreateIndex
CREATE INDEX "equipment_workhour_logs_equipment_item_id_work_date_idx" ON "equipment_workhour_logs"("equipment_item_id", "work_date");

-- CreateIndex
CREATE INDEX "equipment_workhour_logs_work_date_idx" ON "equipment_workhour_logs"("work_date");

-- AddForeignKey
ALTER TABLE "equipment_items" ADD CONSTRAINT "equipment_items_equipment_type_id_fkey" FOREIGN KEY ("equipment_type_id") REFERENCES "equipment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_status_logs" ADD CONSTRAINT "equipment_status_logs_equipment_item_id_fkey" FOREIGN KEY ("equipment_item_id") REFERENCES "equipment_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_status_logs" ADD CONSTRAINT "equipment_status_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_workhour_logs" ADD CONSTRAINT "equipment_workhour_logs_equipment_item_id_fkey" FOREIGN KEY ("equipment_item_id") REFERENCES "equipment_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_workhour_logs" ADD CONSTRAINT "equipment_workhour_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
