-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('planned', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "sub_project_type" AS ENUM ('galian', 'timbunan', 'line_clearing', 'aspal');

-- CreateEnum
CREATE TYPE "sub_project_status" AS ENUM ('planned', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "daily_progress_status" AS ENUM ('submitted', 'validated', 'rejected');

-- CreateEnum
CREATE TYPE "pool_status" AS ENUM ('draft', 'active', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "equipment_pool_owner_type" AS ENUM ('construction_project', 'external_rental_project');

-- CreateEnum
CREATE TYPE "equipment_pool_item_status" AS ENUM ('pending', 'available', 'assigned', 'completed', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "equipment_allocation_status" AS ENUM ('assigned', 'completed', 'returned', 'cancelled');

-- AlterTable
ALTER TABLE "equipment_workhour_logs" ADD COLUMN     "equipment_pool_item_id" INTEGER,
ADD COLUMN     "paused_duration_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sub_project_equipment_allocation_id" INTEGER;

-- CreateTable
CREATE TABLE "construction_projects" (
    "id" SERIAL NOT NULL,
    "project_code" VARCHAR(50) NOT NULL,
    "project_name" VARCHAR(255) NOT NULL,
    "client_name" VARCHAR(255),
    "location" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "status" "project_status" NOT NULL DEFAULT 'planned',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_rental_projects" (
    "id" SERIAL NOT NULL,
    "rental_project_code" VARCHAR(50) NOT NULL,
    "rental_project_name" VARCHAR(255) NOT NULL,
    "client_name" VARCHAR(255),
    "location" TEXT,
    "contract_no" VARCHAR(100),
    "contract_start_date" DATE,
    "contract_end_date" DATE,
    "billing_method" VARCHAR(50),
    "status" "project_status" NOT NULL DEFAULT 'planned',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_rental_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_supply_projects" (
    "id" SERIAL NOT NULL,
    "supply_project_code" VARCHAR(50) NOT NULL,
    "supply_project_name" VARCHAR(255) NOT NULL,
    "client_name" VARCHAR(255),
    "location" TEXT,
    "contract_no" VARCHAR(100),
    "contract_start_date" DATE,
    "contract_end_date" DATE,
    "status" "project_status" NOT NULL DEFAULT 'planned',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_supply_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_projects" (
    "id" SERIAL NOT NULL,
    "construction_project_id" INTEGER NOT NULL,
    "sub_project_type" "sub_project_type" NOT NULL,
    "status" "sub_project_status" NOT NULL DEFAULT 'planned',
    "sequence_order" INTEGER NOT NULL DEFAULT 1,
    "target_volume" DECIMAL(18,2) NOT NULL,
    "daily_target_volume" DECIMAL(18,2),
    "volume_unit" VARCHAR(30) NOT NULL,
    "contract_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "contract_no" VARCHAR(100),
    "contract_date" DATE,
    "contract_start_date" DATE,
    "contract_end_date" DATE,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_progress_logs" (
    "id" SERIAL NOT NULL,
    "sub_project_id" INTEGER NOT NULL,
    "progress_date" DATE NOT NULL,
    "realized_volume" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "status" "daily_progress_status" NOT NULL DEFAULT 'submitted',
    "validated_by" INTEGER,
    "validated_at" TIMESTAMP(3),
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_progress_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_condition_logs" (
    "id" SERIAL NOT NULL,
    "daily_progress_log_id" INTEGER NOT NULL,
    "weather_morning" VARCHAR(50),
    "weather_afternoon" VARCHAR(50),
    "field_condition_notes" TEXT,
    "incident_notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_condition_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_pools" (
    "id" SERIAL NOT NULL,
    "owner_type" "equipment_pool_owner_type" NOT NULL,
    "construction_project_id" INTEGER,
    "external_rental_project_id" INTEGER,
    "pool_code" VARCHAR(50) NOT NULL,
    "status" "pool_status" NOT NULL DEFAULT 'active',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_pool_items" (
    "id" SERIAL NOT NULL,
    "equipment_pool_id" INTEGER NOT NULL,
    "equipment_type_id" INTEGER NOT NULL,
    "equipment_item_id" INTEGER,
    "requested_quantity" INTEGER NOT NULL DEFAULT 1,
    "approved_quantity" INTEGER NOT NULL DEFAULT 0,
    "status" "equipment_pool_item_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_pool_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_project_equipment_allocations" (
    "id" SERIAL NOT NULL,
    "sub_project_id" INTEGER NOT NULL,
    "equipment_pool_item_id" INTEGER NOT NULL,
    "equipment_item_id" INTEGER,
    "allocated_by" INTEGER,
    "allocated_at" TIMESTAMP(3),
    "received_by" INTEGER,
    "received_at" TIMESTAMP(3),
    "status" "equipment_allocation_status" NOT NULL DEFAULT 'assigned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_project_equipment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "construction_projects_project_code_key" ON "construction_projects"("project_code");

-- CreateIndex
CREATE INDEX "construction_projects_status_idx" ON "construction_projects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "external_rental_projects_rental_project_code_key" ON "external_rental_projects"("rental_project_code");

-- CreateIndex
CREATE INDEX "external_rental_projects_status_idx" ON "external_rental_projects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "external_supply_projects_supply_project_code_key" ON "external_supply_projects"("supply_project_code");

-- CreateIndex
CREATE INDEX "external_supply_projects_status_idx" ON "external_supply_projects"("status");

-- CreateIndex
CREATE INDEX "sub_projects_status_idx" ON "sub_projects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sub_projects_construction_project_id_sub_project_type_key" ON "sub_projects"("construction_project_id", "sub_project_type");

-- CreateIndex
CREATE INDEX "daily_progress_logs_sub_project_id_status_idx" ON "daily_progress_logs"("sub_project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_progress_logs_sub_project_id_progress_date_key" ON "daily_progress_logs"("sub_project_id", "progress_date");

-- CreateIndex
CREATE UNIQUE INDEX "field_condition_logs_daily_progress_log_id_key" ON "field_condition_logs"("daily_progress_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_pools_pool_code_key" ON "equipment_pools"("pool_code");

-- CreateIndex
CREATE INDEX "equipment_pools_owner_type_construction_project_id_idx" ON "equipment_pools"("owner_type", "construction_project_id");

-- CreateIndex
CREATE INDEX "equipment_pools_owner_type_external_rental_project_id_idx" ON "equipment_pools"("owner_type", "external_rental_project_id");

-- CreateIndex
CREATE INDEX "equipment_pool_items_equipment_pool_id_idx" ON "equipment_pool_items"("equipment_pool_id");

-- CreateIndex
CREATE INDEX "equipment_pool_items_equipment_item_id_idx" ON "equipment_pool_items"("equipment_item_id");

-- CreateIndex
CREATE INDEX "equipment_pool_items_status_idx" ON "equipment_pool_items"("status");

-- CreateIndex
CREATE INDEX "sub_project_equipment_allocations_sub_project_id_status_idx" ON "sub_project_equipment_allocations"("sub_project_id", "status");

-- CreateIndex
CREATE INDEX "sub_project_equipment_allocations_equipment_item_id_status_idx" ON "sub_project_equipment_allocations"("equipment_item_id", "status");

-- CreateIndex
CREATE INDEX "sub_project_equipment_allocations_equipment_pool_item_id_idx" ON "sub_project_equipment_allocations"("equipment_pool_item_id");

-- CreateIndex
CREATE INDEX "equipment_workhour_logs_sub_project_equipment_allocation_id_idx" ON "equipment_workhour_logs"("sub_project_equipment_allocation_id", "work_date");

-- CreateIndex
CREATE INDEX "equipment_workhour_logs_equipment_pool_item_id_work_date_idx" ON "equipment_workhour_logs"("equipment_pool_item_id", "work_date");

-- CreateIndex
CREATE INDEX "equipment_workhour_logs_source_type_work_date_idx" ON "equipment_workhour_logs"("source_type", "work_date");

-- AddForeignKey
ALTER TABLE "equipment_workhour_logs" ADD CONSTRAINT "equipment_workhour_logs_sub_project_equipment_allocation_i_fkey" FOREIGN KEY ("sub_project_equipment_allocation_id") REFERENCES "sub_project_equipment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_workhour_logs" ADD CONSTRAINT "equipment_workhour_logs_equipment_pool_item_id_fkey" FOREIGN KEY ("equipment_pool_item_id") REFERENCES "equipment_pool_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_projects" ADD CONSTRAINT "construction_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_rental_projects" ADD CONSTRAINT "external_rental_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_supply_projects" ADD CONSTRAINT "external_supply_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_projects" ADD CONSTRAINT "sub_projects_construction_project_id_fkey" FOREIGN KEY ("construction_project_id") REFERENCES "construction_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_projects" ADD CONSTRAINT "sub_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_progress_logs" ADD CONSTRAINT "daily_progress_logs_sub_project_id_fkey" FOREIGN KEY ("sub_project_id") REFERENCES "sub_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_progress_logs" ADD CONSTRAINT "daily_progress_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_progress_logs" ADD CONSTRAINT "daily_progress_logs_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_condition_logs" ADD CONSTRAINT "field_condition_logs_daily_progress_log_id_fkey" FOREIGN KEY ("daily_progress_log_id") REFERENCES "daily_progress_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_condition_logs" ADD CONSTRAINT "field_condition_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_pools" ADD CONSTRAINT "equipment_pools_construction_project_id_fkey" FOREIGN KEY ("construction_project_id") REFERENCES "construction_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_pools" ADD CONSTRAINT "equipment_pools_external_rental_project_id_fkey" FOREIGN KEY ("external_rental_project_id") REFERENCES "external_rental_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_pools" ADD CONSTRAINT "equipment_pools_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_pool_items" ADD CONSTRAINT "equipment_pool_items_equipment_pool_id_fkey" FOREIGN KEY ("equipment_pool_id") REFERENCES "equipment_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_pool_items" ADD CONSTRAINT "equipment_pool_items_equipment_type_id_fkey" FOREIGN KEY ("equipment_type_id") REFERENCES "equipment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_pool_items" ADD CONSTRAINT "equipment_pool_items_equipment_item_id_fkey" FOREIGN KEY ("equipment_item_id") REFERENCES "equipment_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_project_equipment_allocations" ADD CONSTRAINT "sub_project_equipment_allocations_sub_project_id_fkey" FOREIGN KEY ("sub_project_id") REFERENCES "sub_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_project_equipment_allocations" ADD CONSTRAINT "sub_project_equipment_allocations_equipment_pool_item_id_fkey" FOREIGN KEY ("equipment_pool_item_id") REFERENCES "equipment_pool_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_project_equipment_allocations" ADD CONSTRAINT "sub_project_equipment_allocations_equipment_item_id_fkey" FOREIGN KEY ("equipment_item_id") REFERENCES "equipment_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_project_equipment_allocations" ADD CONSTRAINT "sub_project_equipment_allocations_allocated_by_fkey" FOREIGN KEY ("allocated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_project_equipment_allocations" ADD CONSTRAINT "sub_project_equipment_allocations_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================
-- CHECK CONSTRAINT — ditulis manual, Prisma tidak bisa menyatakannya
-- ============================================================

-- equipment_pools bersifat generic lewat diskriminator owner_type. Tanpa CHECK,
-- satu baris bisa mengisi KEDUA FK sekaligus (pool milik construction DAN rental)
-- atau tidak mengisi satu pun — dua keadaan yang tidak punya arti bisnis dan
-- membuat "pool ini milik project mana" tidak terjawab.
-- Referensi: ERD Project §11.
ALTER TABLE "equipment_pools"
ADD CONSTRAINT "equipment_pools_owner_discriminator_check" CHECK (
  (owner_type = 'construction_project'
     AND construction_project_id IS NOT NULL
     AND external_rental_project_id IS NULL)
  OR
  (owner_type = 'external_rental_project'
     AND external_rental_project_id IS NOT NULL
     AND construction_project_id IS NULL)
);

-- CATATAN — CHECK untuk equipment_workhour_logs per source_type SENGAJA BELUM
-- dipasang di sini. Migrasi ini fase EXPAND: kolom project_id/sub_project_id
-- masih hidup dan kode lama masih menulis ke sana, jadi CHECK
-- "source_type='internal_project' => sub_project_equipment_allocation_id NOT NULL"
-- akan menolak insert yang sah hari ini. Dipasang di migrasi CONTRACT (P4),
-- satu transaksi dengan DROP dua kolom lama.
