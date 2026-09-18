/*
  Warnings:

  - The values [available,assigned_to_location] on the enum `equipment_item_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "damage_status" AS ENUM ('reported', 'resolved', 'cancelled');

-- CreateEnum
CREATE TYPE "spare_part_source" AS ENUM ('warehouse', 'supplier');

-- CreateEnum
CREATE TYPE "mechanic_team" AS ENUM ('internal', 'external');

-- AlterEnum
BEGIN;
CREATE TYPE "equipment_item_status_new" AS ENUM ('operational', 'maintenance', 'retired');
ALTER TABLE "public"."equipment_items" ALTER COLUMN "current_status" DROP DEFAULT;
ALTER TABLE "equipment_items" ALTER COLUMN "current_status" TYPE "equipment_item_status_new" USING ("current_status"::text::"equipment_item_status_new");
ALTER TABLE "equipment_status_logs" ALTER COLUMN "old_status" TYPE "equipment_item_status_new" USING ("old_status"::text::"equipment_item_status_new");
ALTER TABLE "equipment_status_logs" ALTER COLUMN "new_status" TYPE "equipment_item_status_new" USING ("new_status"::text::"equipment_item_status_new");
ALTER TYPE "equipment_item_status" RENAME TO "equipment_item_status_old";
ALTER TYPE "equipment_item_status_new" RENAME TO "equipment_item_status";
DROP TYPE "public"."equipment_item_status_old";
ALTER TABLE "equipment_items" ALTER COLUMN "current_status" SET DEFAULT 'operational';
COMMIT;

-- AlterTable
ALTER TABLE "equipment_items" ALTER COLUMN "current_status" SET DEFAULT 'operational';

-- CreateTable
CREATE TABLE "damage_logs" (
    "id" SERIAL NOT NULL,
    "damage_code" VARCHAR(50) NOT NULL,
    "equipment_item_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "sub_project_id" INTEGER,
    "damage_date" DATE NOT NULL,
    "status" "damage_status" NOT NULL DEFAULT 'reported',
    "description" TEXT NOT NULL,
    "stops_operation" BOOLEAN NOT NULL DEFAULT false,
    "spare_part_source" "spare_part_source",
    "mechanic_team" "mechanic_team",
    "reported_by" INTEGER,
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "damage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "damage_logs_damage_code_key" ON "damage_logs"("damage_code");

-- CreateIndex
CREATE INDEX "damage_logs_equipment_item_id_damage_date_idx" ON "damage_logs"("equipment_item_id", "damage_date");

-- CreateIndex
CREATE INDEX "damage_logs_status_idx" ON "damage_logs"("status");

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_damage_log_id_fkey" FOREIGN KEY ("damage_log_id") REFERENCES "damage_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_logs" ADD CONSTRAINT "damage_logs_equipment_item_id_fkey" FOREIGN KEY ("equipment_item_id") REFERENCES "equipment_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_logs" ADD CONSTRAINT "damage_logs_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_logs" ADD CONSTRAINT "damage_logs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
