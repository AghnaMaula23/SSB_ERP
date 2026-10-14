-- ============================================================
-- Nyalakan Row Level Security di SEMUA tabel schema public (14 Okt 2026).
--
-- Kenapa: Supabase otomatis membuka REST API (PostgREST) ke schema public untuk
-- role `anon` dan `authenticated`, dan anon key dirancang boleh tersebar. Sampai
-- migrasi ini, satu-satunya pengaman adalah role itu tidak punya hak akses —
-- begitu hak itu terbuka (dashboard Supabase, default privileges, tabel dibuat
-- dari editor), seluruh data termasuk hash password `users` bisa dibaca publik.
-- RLS TANPA policy = semua baris tertolak untuk role non-pemilik, bahkan kalau
-- suatu saat diberi hak akses.
--
-- Backend TIDAK terdampak: koneksi Prisma memakai `postgres`, pemilik semua tabel
-- dengan BYPASSRLS. Karena itu sengaja TIDAK memakai FORCE ROW LEVEL SECURITY.
--
-- Aturan ke depan: setiap migrasi yang membuat tabel WAJIB menyertakan
-- `ALTER TABLE "<nama>" ENABLE ROW LEVEL SECURITY;` (lihat CLAUDE.md).
-- Rollback: DISABLE ROW LEVEL SECURITY — tidak menyentuh data.
-- ============================================================

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "construction_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_progress_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "damage_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_cash_category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_cash_transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_maintenance_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_pool_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_pools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_purchase_maintenance_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_purchase_repair_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_purchase_repair_spareparts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_purchase_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_purchase_stock_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_request_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_status_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_workhour_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_rental_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_supply_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_condition_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_aspects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material_pool_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material_pools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material_request_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sub_project_equipment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sub_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
