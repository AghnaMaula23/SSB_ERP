-- Merampingkan equipment_item_status dari 8 nilai menjadi 4.
--   assigned, delivered_to_location, received_at_site, in_use
--     -> digabung jadi assigned_to_location (siklus alokasi detailnya berada di
--        sub_project_equipment_allocations pada modul Project)
--   damaged -> digabung ke maintenance (penyebab dibedakan lewat
--              equipment_status_logs.source_type: damage_log vs maintenance_record)
--
-- Aman dijalankan: tabel equipment_items dan equipment_status_logs masih kosong.
-- Pemetaan nilai lama tetap disertakan agar migrasi tidak merusak data
-- seandainya dijalankan di database yang sudah terisi.

-- AlterEnum
BEGIN;

CREATE TYPE "equipment_item_status_new" AS ENUM ('available', 'assigned_to_location', 'maintenance', 'retired');

ALTER TABLE "equipment_items" ALTER COLUMN "current_status" DROP DEFAULT;

ALTER TABLE "equipment_items"
  ALTER COLUMN "current_status" TYPE "equipment_item_status_new"
  USING (
    CASE "current_status"::text
      WHEN 'assigned'              THEN 'assigned_to_location'
      WHEN 'delivered_to_location' THEN 'assigned_to_location'
      WHEN 'received_at_site'      THEN 'assigned_to_location'
      WHEN 'in_use'                THEN 'assigned_to_location'
      WHEN 'damaged'               THEN 'maintenance'
      ELSE "current_status"::text
    END
  )::"equipment_item_status_new";

ALTER TABLE "equipment_status_logs"
  ALTER COLUMN "old_status" TYPE "equipment_item_status_new"
  USING (
    CASE "old_status"::text
      WHEN 'assigned'              THEN 'assigned_to_location'
      WHEN 'delivered_to_location' THEN 'assigned_to_location'
      WHEN 'received_at_site'      THEN 'assigned_to_location'
      WHEN 'in_use'                THEN 'assigned_to_location'
      WHEN 'damaged'               THEN 'maintenance'
      ELSE "old_status"::text
    END
  )::"equipment_item_status_new";

ALTER TABLE "equipment_status_logs"
  ALTER COLUMN "new_status" TYPE "equipment_item_status_new"
  USING (
    CASE "new_status"::text
      WHEN 'assigned'              THEN 'assigned_to_location'
      WHEN 'delivered_to_location' THEN 'assigned_to_location'
      WHEN 'received_at_site'      THEN 'assigned_to_location'
      WHEN 'in_use'                THEN 'assigned_to_location'
      WHEN 'damaged'               THEN 'maintenance'
      ELSE "new_status"::text
    END
  )::"equipment_item_status_new";

ALTER TYPE "equipment_item_status" RENAME TO "equipment_item_status_old";
ALTER TYPE "equipment_item_status_new" RENAME TO "equipment_item_status";
DROP TYPE "equipment_item_status_old";

ALTER TABLE "equipment_items" ALTER COLUMN "current_status" SET DEFAULT 'available';

COMMIT;
