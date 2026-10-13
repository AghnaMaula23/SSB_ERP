
-- CreateEnum
CREATE TYPE "material_pool_owner_type" AS ENUM ('construction_project', 'external_supply_project');

-- AlterTable
ALTER TABLE "external_supply_projects" ADD COLUMN     "field_pic_id" INTEGER;

-- CreateTable
CREATE TABLE "material_types" (
    "id" SERIAL NOT NULL,
    "material_code" VARCHAR(50) NOT NULL,
    "material_name" VARCHAR(150) NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "supplier_name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(50),
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_pools" (
    "id" SERIAL NOT NULL,
    "owner_type" "material_pool_owner_type" NOT NULL,
    "construction_project_id" INTEGER,
    "external_supply_project_id" INTEGER,
    "pool_code" VARCHAR(50) NOT NULL,
    "status" "pool_status" NOT NULL DEFAULT 'active',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_pool_items" (
    "id" SERIAL NOT NULL,
    "material_pool_id" INTEGER NOT NULL,
    "material_type_id" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_pool_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_types_material_code_key" ON "material_types"("material_code");

-- CreateIndex
CREATE UNIQUE INDEX "material_types_material_name_key" ON "material_types"("material_name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_supplier_name_key" ON "suppliers"("supplier_name");

-- CreateIndex
CREATE UNIQUE INDEX "material_pools_pool_code_key" ON "material_pools"("pool_code");

-- CreateIndex
CREATE INDEX "material_pools_owner_type_construction_project_id_idx" ON "material_pools"("owner_type", "construction_project_id");

-- CreateIndex
CREATE INDEX "material_pools_owner_type_external_supply_project_id_idx" ON "material_pools"("owner_type", "external_supply_project_id");

-- CreateIndex
CREATE INDEX "material_pool_items_material_type_id_idx" ON "material_pool_items"("material_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_pool_items_material_pool_id_material_type_id_key" ON "material_pool_items"("material_pool_id", "material_type_id");

-- AddForeignKey
ALTER TABLE "external_supply_projects" ADD CONSTRAINT "external_supply_projects_field_pic_id_fkey" FOREIGN KEY ("field_pic_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_pools" ADD CONSTRAINT "material_pools_construction_project_id_fkey" FOREIGN KEY ("construction_project_id") REFERENCES "construction_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_pools" ADD CONSTRAINT "material_pools_external_supply_project_id_fkey" FOREIGN KEY ("external_supply_project_id") REFERENCES "external_supply_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_pools" ADD CONSTRAINT "material_pools_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_pool_items" ADD CONSTRAINT "material_pool_items_material_pool_id_fkey" FOREIGN KEY ("material_pool_id") REFERENCES "material_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_pool_items" ADD CONSTRAINT "material_pool_items_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================
-- CHECK CONSTRAINT — ditulis manual, Prisma tidak bisa menyatakannya.
-- Request Material RM-1. Pola sama dengan equipment_pools_owner_discriminator_check:
-- tanpa ini satu baris bisa mengisi KEDUA FK atau tidak satu pun.
-- Referensi: ERD Project §11 (material_pools generic).
-- ============================================================
ALTER TABLE "material_pools"
ADD CONSTRAINT "material_pools_owner_discriminator_check" CHECK (
  (owner_type = 'construction_project'
     AND construction_project_id IS NOT NULL
     AND external_supply_project_id IS NULL)
  OR
  (owner_type = 'external_supply_project'
     AND external_supply_project_id IS NOT NULL
     AND construction_project_id IS NULL)
);
