-- Arsip Penutupan (L8, docs/keputusan-desain-lampiran.md) — 17 Okt 2026.
-- XLSX dibuat SEKALI di dalam transaksi penutupan tahapan/project.
-- Diff Prisma juga memuat 3 DROP yang SENGAJA ditunda (field_pic_id,
-- threshold_value, default_threshold_value) — tidak diikutkan.

-- CreateTable
CREATE TABLE "project_closing_archives" (
    "id" SERIAL NOT NULL,
    "construction_project_id" INTEGER,
    "external_rental_project_id" INTEGER,
    "external_supply_project_id" INTEGER,
    "sub_project_id" INTEGER,
    "equipment_pool_item_id" INTEGER,
    "archive_key" VARCHAR(40) NOT NULL,
    "file_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_closing_archives_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "project_closing_archives_file_id_key" ON "project_closing_archives"("file_id");
-- CreateIndex
CREATE INDEX "project_closing_archives_construction_project_id_idx" ON "project_closing_archives"("construction_project_id");
-- CreateIndex
CREATE INDEX "project_closing_archives_external_rental_project_id_idx" ON "project_closing_archives"("external_rental_project_id");
-- CreateIndex
CREATE INDEX "project_closing_archives_external_supply_project_id_idx" ON "project_closing_archives"("external_supply_project_id");
-- CreateIndex
CREATE INDEX "project_closing_archives_sub_project_id_idx" ON "project_closing_archives"("sub_project_id");
-- AddForeignKey
ALTER TABLE "project_closing_archives" ADD CONSTRAINT "project_closing_archives_construction_project_id_fkey" FOREIGN KEY ("construction_project_id") REFERENCES "construction_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "project_closing_archives" ADD CONSTRAINT "project_closing_archives_external_rental_project_id_fkey" FOREIGN KEY ("external_rental_project_id") REFERENCES "external_rental_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "project_closing_archives" ADD CONSTRAINT "project_closing_archives_external_supply_project_id_fkey" FOREIGN KEY ("external_supply_project_id") REFERENCES "external_supply_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "project_closing_archives" ADD CONSTRAINT "project_closing_archives_sub_project_id_construction_proje_fkey" FOREIGN KEY ("sub_project_id", "construction_project_id") REFERENCES "sub_projects"("id", "construction_project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "project_closing_archives" ADD CONSTRAINT "project_closing_archives_equipment_pool_item_id_fkey" FOREIGN KEY ("equipment_pool_item_id") REFERENCES "equipment_pool_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "project_closing_archives" ADD CONSTRAINT "project_closing_archives_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tepat satu project pemilik (sama dengan project_file_folders)
ALTER TABLE "project_closing_archives" ADD CONSTRAINT "project_closing_archives_owner_check"
  CHECK (num_nonnulls("construction_project_id", "external_rental_project_id", "external_supply_project_id") = 1);

-- Jenis arsip menentukan cakupannya. Jenis baru (mis. stage-labor bersama modul
-- Pekerja) = migrasi baru yang memperluas CHECK ini.
ALTER TABLE "project_closing_archives" ADD CONSTRAINT "project_closing_archives_scope_check"
  CHECK (
    ("archive_key" IN ('stage-progress', 'stage-equipment', 'stage-material')
      AND "sub_project_id" IS NOT NULL AND "equipment_pool_item_id" IS NULL)
    OR ("archive_key" = 'project-summary'
      AND "construction_project_id" IS NOT NULL AND "sub_project_id" IS NULL AND "equipment_pool_item_id" IS NULL)
    OR ("archive_key" = 'supply-deliveries'
      AND "external_supply_project_id" IS NOT NULL AND "sub_project_id" IS NULL AND "equipment_pool_item_id" IS NULL)
    OR ("archive_key" = 'rental-timesheet'
      AND "external_rental_project_id" IS NOT NULL AND "equipment_pool_item_id" IS NOT NULL AND "sub_project_id" IS NULL)
  );

-- Sekali per cakupan per jenis — penutupan hanya terjadi sekali (status final)
CREATE UNIQUE INDEX "project_closing_archives_stage_key"
  ON "project_closing_archives" ("sub_project_id", "archive_key") WHERE "sub_project_id" IS NOT NULL;
CREATE UNIQUE INDEX "project_closing_archives_construction_key"
  ON "project_closing_archives" ("construction_project_id", "archive_key")
  WHERE "construction_project_id" IS NOT NULL AND "sub_project_id" IS NULL;
CREATE UNIQUE INDEX "project_closing_archives_supply_key"
  ON "project_closing_archives" ("external_supply_project_id", "archive_key") WHERE "external_supply_project_id" IS NOT NULL;
CREATE UNIQUE INDEX "project_closing_archives_pool_item_key"
  ON "project_closing_archives" ("equipment_pool_item_id", "archive_key") WHERE "equipment_pool_item_id" IS NOT NULL;

-- Supabase REST API: RLS tanpa policy menolak anon/authenticated. Tanpa FORCE.
ALTER TABLE "project_closing_archives" ENABLE ROW LEVEL SECURITY;
