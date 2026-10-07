-- AlterTable
ALTER TABLE "equipment_workhour_logs" DROP COLUMN "project_id",
DROP COLUMN "sub_project_id";


-- ============================================================
-- CHECK CONSTRAINT per source_type — ditulis manual, Prisma tidak bisa
-- menyatakannya. Menutup backlog C1.
-- ============================================================
--
-- Referensi: ERD Project §11 dan CLAUDE.md bagian "Utang Desain" poin 1.
--
-- Ditegakkan DUA KALI dengan sengaja: service (CONTEXT_BY_SOURCE di
-- divisi-alat.service.js) menolak lebih dulu supaya pesannya bisa dimengerti
-- manusia, dan CHECK ini menjaga tidak ada jalan masuk lain yang melanggarnya —
-- seeder, skrip migrasi data, atau query manual sekalipun.
--
-- `manual_adjustment` sengaja TIDAK disebut: dia memang tidak punya konteks
-- proyek, dan unitnya dijawab equipment_item_id yang selalu NOT NULL.

ALTER TABLE "equipment_workhour_logs"
ADD CONSTRAINT "equipment_workhour_logs_internal_project_context_check" CHECK (
  source_type <> 'internal_project'
  OR sub_project_equipment_allocation_id IS NOT NULL
);

ALTER TABLE "equipment_workhour_logs"
ADD CONSTRAINT "equipment_workhour_logs_external_rental_context_check" CHECK (
  source_type <> 'external_rental'
  OR equipment_pool_item_id IS NOT NULL
);
