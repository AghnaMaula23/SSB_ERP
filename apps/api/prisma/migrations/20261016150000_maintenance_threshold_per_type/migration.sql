-- Ambang servis per JENIS alat × aspek (docs/keputusan-desain-divisi-alat.md,
-- "Ambang maintenance per jenis alat", 16 Okt 2026).
--
-- Aditif: equipment_maintenance_settings.threshold_value dan
-- maintenance_aspects.default_threshold_value TIDAK di-DROP — hanya berhenti
-- dipakai (threshold_value dibuat nullable). DROP ditunda karena DB dev dipakai
-- bersama; backend rekan yang belum pull masih menulis/membacanya.

-- CreateTable
CREATE TABLE "equipment_type_maintenance_thresholds" (
    "id" SERIAL NOT NULL,
    "equipment_type_id" INTEGER NOT NULL,
    "maintenance_aspect_id" INTEGER NOT NULL,
    "threshold_value" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_type_maintenance_thresholds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "equipment_type_maintenance_thresholds_maintenance_aspect_id_idx" ON "equipment_type_maintenance_thresholds"("maintenance_aspect_id");
CREATE UNIQUE INDEX "equipment_type_maintenance_thresholds_equipment_type_id_mai_key" ON "equipment_type_maintenance_thresholds"("equipment_type_id", "maintenance_aspect_id");
CREATE UNIQUE INDEX "equipment_type_maintenance_thresholds_id_maintenance_aspect_key" ON "equipment_type_maintenance_thresholds"("id", "maintenance_aspect_id");

ALTER TABLE "equipment_type_maintenance_thresholds" ADD CONSTRAINT "equipment_type_maintenance_thresholds_equipment_type_id_fkey" FOREIGN KEY ("equipment_type_id") REFERENCES "equipment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "equipment_type_maintenance_thresholds" ADD CONSTRAINT "equipment_type_maintenance_thresholds_maintenance_aspect_i_fkey" FOREIGN KEY ("maintenance_aspect_id") REFERENCES "maintenance_aspects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "equipment_type_maintenance_thresholds" ADD CONSTRAINT "equipment_type_maintenance_thresholds_value_check" CHECK (threshold_value > 0);
-- RLS tanpa policy: tutup REST API publik Supabase (berlaku sejak 14 Okt 2026)
ALTER TABLE "equipment_type_maintenance_thresholds" ENABLE ROW LEVEL SECURITY;

-- Setting per unit menunjuk ambang jenisnya
ALTER TABLE "equipment_maintenance_settings" ADD COLUMN "type_threshold_id" INTEGER;
ALTER TABLE "equipment_maintenance_settings" ALTER COLUMN "threshold_value" DROP NOT NULL;
CREATE INDEX "equipment_maintenance_settings_type_threshold_id_idx" ON "equipment_maintenance_settings"("type_threshold_id");
ALTER TABLE "equipment_maintenance_settings" ADD CONSTRAINT "equipment_maintenance_settings_type_threshold_id_maintenan_fkey" FOREIGN KEY ("type_threshold_id", "maintenance_aspect_id") REFERENCES "equipment_type_maintenance_thresholds"("id", "maintenance_aspect_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Data: ambang jenis dari setting yang ada ─────────────────────────────
-- Saat ditulis, 37 setting membentuk 15 pasangan jenis × aspek dengan nilai
-- seragam (tidak ada unit yang ambangnya dibedakan). DISTINCT ON + nilai
-- terbesar hanya pengaman kalau ternyata ada perbedaan.
INSERT INTO "equipment_type_maintenance_thresholds" ("equipment_type_id", "maintenance_aspect_id", "threshold_value", "updated_at")
SELECT DISTINCT ON (ei.equipment_type_id, s.maintenance_aspect_id)
       ei.equipment_type_id, s.maintenance_aspect_id, s.threshold_value, CURRENT_TIMESTAMP
FROM "equipment_maintenance_settings" s
JOIN "equipment_items" ei ON ei.id = s.equipment_item_id
WHERE s.threshold_value IS NOT NULL
ORDER BY ei.equipment_type_id, s.maintenance_aspect_id, s.threshold_value DESC;

UPDATE "equipment_maintenance_settings" s
SET "type_threshold_id" = t.id
FROM "equipment_items" ei, "equipment_type_maintenance_thresholds" t
WHERE ei.id = s.equipment_item_id
  AND t.equipment_type_id = ei.equipment_type_id
  AND t.maintenance_aspect_id = s.maintenance_aspect_id;

-- Lengkapi unit yang belum punya setting untuk aspek jenisnya (unit yang
-- didaftarkan lewat FE tidak pernah dibuatkan setting). Hitungan mulai 0 dari
-- jam alat saat ini; status dihitung seperti computeStatus().
INSERT INTO "equipment_maintenance_settings"
  ("equipment_item_id", "maintenance_aspect_id", "type_threshold_id", "current_value_since_reset",
   "last_reset_workhour", "status", "is_active", "updated_at")
SELECT ei.id, t.maintenance_aspect_id, t.id, 0, ei.total_workhour,
       (CASE WHEN t.threshold_value <= a.warning_lead_value THEN 'warning' ELSE 'normal' END)::"maintenance_setting_status",
       true, CURRENT_TIMESTAMP
FROM "equipment_items" ei
JOIN "equipment_type_maintenance_thresholds" t ON t.equipment_type_id = ei.equipment_type_id
JOIN "maintenance_aspects" a ON a.id = t.maintenance_aspect_id
WHERE NOT EXISTS (
  SELECT 1 FROM "equipment_maintenance_settings" s
  WHERE s.equipment_item_id = ei.id AND s.maintenance_aspect_id = t.maintenance_aspect_id
);

-- Setting aktif WAJIB punya ambang jenis
ALTER TABLE "equipment_maintenance_settings" ADD CONSTRAINT "equipment_maintenance_settings_threshold_check"
  CHECK (type_threshold_id IS NOT NULL OR is_active = false);
