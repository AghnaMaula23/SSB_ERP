-- Menyamakan penamaan dengan istilah yang dipakai frontend (keputusan 28 Sep 2026):
--   estimated_service_price -> service_fee
--   approved_service_price  -> approved_service_fee
--   description             -> notes
--
-- Ditulis manual, bukan hasil `prisma migrate dev`: koneksi Supabase lewat pooler
-- tidak mengizinkan pembuatan shadow database, sehingga migrate dev menawarkan
-- RESET database bersama. Jangan pernah menerima tawaran itu.
--
-- RENAME COLUMN mempertahankan data dan otomatis memperbarui ekspresi CHECK yang
-- merujuk kolomnya; hanya nama constraint-nya yang perlu ikut diganti.

ALTER TABLE "equipment_purchase_repair_items"
  RENAME COLUMN "estimated_service_price" TO "service_fee";

ALTER TABLE "equipment_purchase_repair_items"
  RENAME COLUMN "approved_service_price" TO "approved_service_fee";

ALTER TABLE "equipment_purchase_repair_items"
  RENAME COLUMN "description" TO "notes";

ALTER TABLE "equipment_purchase_repair_items"
  RENAME CONSTRAINT "chk_repair_service_price" TO "chk_repair_service_fee";
