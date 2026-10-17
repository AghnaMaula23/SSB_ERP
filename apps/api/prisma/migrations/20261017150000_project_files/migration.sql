-- Berkas project (L8, docs/keputusan-desain-lampiran.md) — 17 Okt 2026.
-- Diff Prisma juga memuat 3 DROP yang SENGAJA ditunda (field_pic_id,
-- threshold_value, default_threshold_value) — tidak diikutkan.

-- CreateTable
CREATE TABLE "project_file_folders" (
    "id" SERIAL NOT NULL,
    "construction_project_id" INTEGER,
    "external_rental_project_id" INTEGER,
    "external_supply_project_id" INTEGER,
    "sub_project_id" INTEGER,
    "name" VARCHAR(120) NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_file_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_files" (
    "id" SERIAL NOT NULL,
    "folder_id" INTEGER NOT NULL,
    "file_id" INTEGER NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_file_folders_construction_project_id_idx" ON "project_file_folders"("construction_project_id");

-- CreateIndex
CREATE INDEX "project_file_folders_external_rental_project_id_idx" ON "project_file_folders"("external_rental_project_id");

-- CreateIndex
CREATE INDEX "project_file_folders_external_supply_project_id_idx" ON "project_file_folders"("external_supply_project_id");

-- CreateIndex
CREATE INDEX "project_file_folders_sub_project_id_idx" ON "project_file_folders"("sub_project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_files_file_id_key" ON "project_files"("file_id");

-- CreateIndex
CREATE INDEX "project_files_folder_id_idx" ON "project_files"("folder_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_projects_id_construction_project_id_key" ON "sub_projects"("id", "construction_project_id");

-- AddForeignKey
ALTER TABLE "project_file_folders" ADD CONSTRAINT "project_file_folders_construction_project_id_fkey" FOREIGN KEY ("construction_project_id") REFERENCES "construction_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_file_folders" ADD CONSTRAINT "project_file_folders_external_rental_project_id_fkey" FOREIGN KEY ("external_rental_project_id") REFERENCES "external_rental_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_file_folders" ADD CONSTRAINT "project_file_folders_external_supply_project_id_fkey" FOREIGN KEY ("external_supply_project_id") REFERENCES "external_supply_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_file_folders" ADD CONSTRAINT "project_file_folders_sub_project_id_construction_project_i_fkey" FOREIGN KEY ("sub_project_id", "construction_project_id") REFERENCES "sub_projects"("id", "construction_project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_file_folders" ADD CONSTRAINT "project_file_folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "project_file_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Tepat satu project pemilik; FK mana yang terisi sudah menyatakan jenisnya
ALTER TABLE "project_file_folders" ADD CONSTRAINT "project_file_folders_owner_check"
  CHECK (num_nonnulls("construction_project_id", "external_rental_project_id", "external_supply_project_id") = 1);

-- Folder tahapan hanya untuk project konstruksi (composite FK di atas menjaga
-- tahapannya milik project yang sama)
ALTER TABLE "project_file_folders" ADD CONSTRAINT "project_file_folders_sub_project_check"
  CHECK ("sub_project_id" IS NULL OR "construction_project_id" IS NOT NULL);

ALTER TABLE "project_file_folders" ADD CONSTRAINT "project_file_folders_name_check"
  CHECK (length(btrim("name")) > 0);

-- Nama unik per tempat (project, atau tahapan), tanpa membedakan huruf
CREATE UNIQUE INDEX "project_file_folders_construction_name_key"
  ON "project_file_folders" ("construction_project_id", COALESCE("sub_project_id", 0), lower("name"))
  WHERE "construction_project_id" IS NOT NULL;
CREATE UNIQUE INDEX "project_file_folders_rental_name_key"
  ON "project_file_folders" ("external_rental_project_id", lower("name"))
  WHERE "external_rental_project_id" IS NOT NULL;
CREATE UNIQUE INDEX "project_file_folders_supply_name_key"
  ON "project_file_folders" ("external_supply_project_id", lower("name"))
  WHERE "external_supply_project_id" IS NOT NULL;

ALTER TABLE "project_files" ADD CONSTRAINT "project_files_name_check"
  CHECK (length(btrim("name")) > 0);

-- Supabase membuka schema public lewat REST API; RLS tanpa policy menolak
-- anon/authenticated. Backend (postgres, BYPASSRLS) tidak terdampak. Tanpa FORCE.
ALTER TABLE "project_file_folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_files" ENABLE ROW LEVEL SECURITY;
