-- Workhour: pembatalan log, sesi rental, operator unit rental (17 Okt 2026).
-- Alasan: docs/keputusan-desain-divisi-alat.md, bagian "Workhour — koreksi, sesi
-- rental, operator". Diff Prisma juga memuat 3 DROP yang SENGAJA ditunda
-- (field_pic_id, threshold_value, default_threshold_value) — tidak diikutkan.

-- CreateEnum
CREATE TYPE "work_session" AS ENUM ('pagi', 'siang', 'overtime');

-- Titik mulai hitungan servis. Baris lama diisi waktu migrasi: pembatalan log
-- yang dibuat SEBELUM migrasi tidak mengurangi counter. Sisi aman — counter
-- bisa sedikit lebih tinggi (servis lebih awal), tidak pernah lebih rendah.
ALTER TABLE "equipment_maintenance_settings"
  ADD COLUMN "counter_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Pembatalan log hanya boleh mengurangi jam yang memang ada di counter
ALTER TABLE "equipment_maintenance_settings"
  ADD CONSTRAINT "equipment_maintenance_settings_counter_check" CHECK ("current_value_since_reset" >= 0);

-- AlterTable
ALTER TABLE "equipment_pool_items" ADD COLUMN "operator_name" VARCHAR(150);

-- AlterTable
ALTER TABLE "equipment_workhour_logs"
  ADD COLUMN "is_voided" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "void_reason" TEXT,
  ADD COLUMN "voided_at" TIMESTAMP(3),
  ADD COLUMN "voided_by" INTEGER,
  ADD COLUMN "work_session" "work_session";

-- AddForeignKey
ALTER TABLE "equipment_workhour_logs" ADD CONSTRAINT "equipment_workhour_logs_voided_by_fkey"
  FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sesi hanya dikenal kontrak rental
ALTER TABLE "equipment_workhour_logs" ADD CONSTRAINT "equipment_workhour_logs_session_check"
  CHECK ("work_session" IS NULL OR "source_type" = 'external_rental');

-- Jam mulai & selesai berpasangan
ALTER TABLE "equipment_workhour_logs" ADD CONSTRAINT "equipment_workhour_logs_times_check"
  CHECK (("started_at" IS NULL) = ("stopped_at" IS NULL));

-- Kalau jamnya dicatat, total = rentang - jeda (toleransi pembulatan 0,01 jam).
-- Total adalah fakta turunan dari jam; tanpa ini 08:00–12:00 bisa tercatat 9 jam.
ALTER TABLE "equipment_workhour_logs" ADD CONSTRAINT "equipment_workhour_logs_total_check"
  CHECK (
    "started_at" IS NULL
    OR abs("total_workhour" - round(((extract(epoch FROM ("stopped_at" - "started_at")) / 60 - "paused_duration_minutes") / 60)::numeric, 2)) <= 0.01
  );

-- Pembatalan lengkap atau tidak sama sekali
ALTER TABLE "equipment_workhour_logs" ADD CONSTRAINT "equipment_workhour_logs_void_check"
  CHECK (
    ("is_voided" AND "void_reason" IS NOT NULL AND "voided_at" IS NOT NULL)
    OR (NOT "is_voided" AND "void_reason" IS NULL AND "voided_at" IS NULL AND "voided_by" IS NULL)
  );

-- Satu sesi per unit kontrak per tanggal; log yang dibatalkan boleh dicatat ulang
CREATE UNIQUE INDEX "equipment_workhour_logs_pool_item_session_key"
  ON "equipment_workhour_logs" ("equipment_pool_item_id", "work_date", "work_session")
  WHERE NOT "is_voided" AND "work_session" IS NOT NULL;
