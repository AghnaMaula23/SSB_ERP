-- Modul Pekerja — docs/skema-tenaga-kerja-harian.md P1–P11.
-- Dihasilkan `prisma migrate diff --from-schema-datasource`, tanpa 3 DROP yang
-- sengaja ditunda (field_pic_id, threshold_value, default_threshold_value).

-- CreateEnum
CREATE TYPE "worker_type" AS ENUM ('contract', 'daily');

-- CreateTable
CREATE TABLE "project_workers" (
    "id" SERIAL NOT NULL,
    "worker_code" VARCHAR(20) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "id_number" VARCHAR(16),
    "phone" VARCHAR(30),
    "default_role" VARCHAR(100),
    "joined_at" DATE,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_project_worker_assignments" (
    "id" SERIAL NOT NULL,
    "sub_project_id" INTEGER NOT NULL,
    "project_worker_id" INTEGER NOT NULL,
    "worker_type" "worker_type" NOT NULL,
    "assigned_role" VARCHAR(100),
    "daily_wage" DECIMAL(18,2) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_project_worker_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_labor_logs" (
    "id" SERIAL NOT NULL,
    "sub_project_id" INTEGER NOT NULL,
    "work_date" DATE NOT NULL,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_labor_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_labor_log_items" (
    "id" SERIAL NOT NULL,
    "daily_labor_log_id" INTEGER NOT NULL,
    "project_worker_id" INTEGER NOT NULL,
    "worker_role" VARCHAR(100) NOT NULL,
    "worker_type" "worker_type" NOT NULL,
    "daily_wage" DECIMAL(18,2) NOT NULL,
    "overtime_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "task_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_labor_log_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_workers_worker_code_key" ON "project_workers"("worker_code");

-- CreateIndex
CREATE INDEX "project_workers_full_name_idx" ON "project_workers"("full_name");

-- CreateIndex
CREATE INDEX "sub_project_worker_assignments_project_worker_id_idx" ON "sub_project_worker_assignments"("project_worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_project_worker_assignments_sub_project_id_project_worke_key" ON "sub_project_worker_assignments"("sub_project_id", "project_worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_labor_logs_sub_project_id_work_date_key" ON "daily_labor_logs"("sub_project_id", "work_date");

-- CreateIndex
CREATE INDEX "daily_labor_log_items_project_worker_id_idx" ON "daily_labor_log_items"("project_worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_labor_log_items_daily_labor_log_id_project_worker_id_key" ON "daily_labor_log_items"("daily_labor_log_id", "project_worker_id");

-- AddForeignKey
ALTER TABLE "project_workers" ADD CONSTRAINT "project_workers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_project_worker_assignments" ADD CONSTRAINT "sub_project_worker_assignments_sub_project_id_fkey" FOREIGN KEY ("sub_project_id") REFERENCES "sub_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_project_worker_assignments" ADD CONSTRAINT "sub_project_worker_assignments_project_worker_id_fkey" FOREIGN KEY ("project_worker_id") REFERENCES "project_workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_project_worker_assignments" ADD CONSTRAINT "sub_project_worker_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_labor_logs" ADD CONSTRAINT "daily_labor_logs_sub_project_id_fkey" FOREIGN KEY ("sub_project_id") REFERENCES "sub_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_labor_logs" ADD CONSTRAINT "daily_labor_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_labor_logs" ADD CONSTRAINT "daily_labor_logs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_labor_log_items" ADD CONSTRAINT "daily_labor_log_items_daily_labor_log_id_fkey" FOREIGN KEY ("daily_labor_log_id") REFERENCES "daily_labor_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_labor_log_items" ADD CONSTRAINT "daily_labor_log_items_project_worker_id_fkey" FOREIGN KEY ("project_worker_id") REFERENCES "project_workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- Tidak bisa dinyatakan di schema.prisma
-- ------------------------------------------------------------

-- NIK opsional (P5/P6): unik hanya di antara yang terisi, 16 digit kalau diisi
CREATE UNIQUE INDEX "project_workers_id_number_key" ON "project_workers"("id_number") WHERE "id_number" IS NOT NULL;
ALTER TABLE "project_workers" ADD CONSTRAINT "project_workers_id_number_check"
  CHECK ("id_number" IS NULL OR "id_number" ~ '^[0-9]{16}$');

ALTER TABLE "sub_project_worker_assignments" ADD CONSTRAINT "sub_project_worker_assignments_daily_wage_check"
  CHECK ("daily_wage" > 0);
ALTER TABLE "sub_project_worker_assignments" ADD CONSTRAINT "sub_project_worker_assignments_period_check"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

ALTER TABLE "daily_labor_log_items" ADD CONSTRAINT "daily_labor_log_items_daily_wage_check"
  CHECK ("daily_wage" > 0);
ALTER TABLE "daily_labor_log_items" ADD CONSTRAINT "daily_labor_log_items_overtime_amount_check"
  CHECK ("overtime_amount" >= 0);

-- Arsip penutupan tahapan `stage-labor` (L8): perluas CHECK cakupan
ALTER TABLE "project_closing_archives" DROP CONSTRAINT "project_closing_archives_scope_check";
ALTER TABLE "project_closing_archives" ADD CONSTRAINT "project_closing_archives_scope_check"
  CHECK (
    ("archive_key" IN ('stage-progress', 'stage-equipment', 'stage-material', 'stage-labor')
      AND "sub_project_id" IS NOT NULL AND "equipment_pool_item_id" IS NULL)
    OR ("archive_key" = 'project-summary'
      AND "construction_project_id" IS NOT NULL AND "sub_project_id" IS NULL AND "equipment_pool_item_id" IS NULL)
    OR ("archive_key" = 'supply-deliveries'
      AND "external_supply_project_id" IS NOT NULL AND "sub_project_id" IS NULL AND "equipment_pool_item_id" IS NULL)
    OR ("archive_key" = 'rental-timesheet'
      AND "external_rental_project_id" IS NOT NULL AND "equipment_pool_item_id" IS NOT NULL AND "sub_project_id" IS NULL)
  );

-- Tabel baru WAJIB RLS tanpa policy (REST API publik Supabase), tanpa FORCE
ALTER TABLE "project_workers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sub_project_worker_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_labor_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_labor_log_items" ENABLE ROW LEVEL SECURITY;
