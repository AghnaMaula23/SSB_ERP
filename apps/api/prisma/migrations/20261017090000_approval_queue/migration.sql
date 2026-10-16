-- Approval Center (docs/keputusan-desain-approval-center.md).
--
-- Diff Prisma saat migrasi ini disusun juga mengusulkan DROP
-- external_supply_projects.field_pic_id, equipment_maintenance_settings.threshold_value,
-- dan maintenance_aspects.default_threshold_value. Ketiganya SENGAJA tidak ikut:
-- DROP itu masih ditunda sampai semua rekan menjalankan backend terbaru.

-- A5: catatan keputusan di header sumber (menutup backlog B1 & C6)
ALTER TABLE "equipment_purchase_requests" ADD COLUMN "admin_notes" TEXT,
ADD COLUMN "finance_notes" TEXT;

ALTER TABLE "daily_progress_logs" ADD COLUMN "validation_notes" TEXT;

-- A1: antrean dibaca dari VIEW, tidak disalin ke tabel.
--
-- Tidak dinyatakan di schema.prisma; `prisma migrate diff` mengabaikan VIEW (diuji
-- 17 Okt 2026 di Postgres sementara: diff kosong, tidak ada usulan DROP VIEW).
-- Dibaca service lewat $queryRaw.
--
-- security_invoker: VIEW biasa berjalan dengan hak PEMILIKNYA (postgres, BYPASSRLS),
-- sehingga kalau terbuka lewat REST API publik Supabase, RLS tabel sumber terlewati.
-- Dengan security_invoker, pembaca VIEW tunduk pada RLS tabel sumber — anon &
-- authenticated tetap ditolak; backend (postgres) tidak terdampak.
--
-- Kolom:
--   source_type, stage  identitas antrean. Permission aksi & endpoint aksi per pasangan
--                   ini ada di SATU tempat: QUEUES di approval-queue.service.js (A4)
--   requested_by    pengaju/pencatat — disembunyikan dari antreannya sendiri
--   forwarded_by    aktor tahap sebelumnya — disembunyikan dari tahap finance (pemisahan tugas)
--   submitted_at    waktu masuk antrean TAHAP INI
--   detail_path     endpoint detail sumber; endpoint aksi = detail_path + '/<aksi>'
--
-- Menambah sumber baru (Income, Finance Field) = menambah satu blok UNION ALL.
CREATE VIEW "approval_queue" WITH (security_invoker = true) AS

-- Purchase request Divisi Alat — tahap admin
SELECT
  'purchase_request'::text                      AS source_type,
  pr.id                                         AS source_id,
  'admin'::text                                 AS stage,
  pr.request_code::text                         AS reference_code,
  'Divisi Alat'::text                           AS context,
  CASE pr.order_category
    WHEN 'repair' THEN 'Perbaikan'
    WHEN 'maintenance' THEN 'Perawatan'
    ELSE 'Stok gudang' END                      AS summary,
  pr.total_estimated_amount                     AS amount,
  pr.requested_by                               AS requested_by,
  NULL::int                                     AS forwarded_by,
  pr.created_at                                 AS submitted_at,
  '/api/equipment/purchase-requests/' || pr.id  AS detail_path
FROM "equipment_purchase_requests" pr
WHERE pr.status = 'submitted'

UNION ALL

-- Purchase request Divisi Alat — tahap finance
SELECT
  'purchase_request', pr.id, 'finance',
  pr.request_code, 'Divisi Alat',
  CASE pr.order_category
    WHEN 'repair' THEN 'Perbaikan'
    WHEN 'maintenance' THEN 'Perawatan'
    ELSE 'Stok gudang' END,
  pr.total_estimated_amount,
  pr.requested_by, pr.admin_validated_by, pr.admin_validated_at,
  '/api/equipment/purchase-requests/' || pr.id
FROM "equipment_purchase_requests" pr
WHERE pr.status = 'waiting_finance_approval'

UNION ALL

-- Request material — tahap admin (kuantitas & rincian biaya) dan finance
SELECT
  'material_request',
  mr.id,
  CASE mr.status WHEN 'submitted' THEN 'admin' ELSE 'finance' END,
  mr.request_code,
  COALESCE(
    cp.project_code || ' ' || cp.project_name || ' · ' || initcap(replace(sp.sub_project_type::text, '_', ' ')),
    esp.supply_project_code || ' ' || esp.supply_project_name),
  (SELECT count(*) FROM "material_request_items" i WHERE i.material_request_id = mr.id) || ' material',
  -- Biaya baru lengkap setelah Admin meneruskan; di tahap admin angkanya masih disusun
  CASE mr.status WHEN 'submitted' THEN NULL
    ELSE (SELECT COALESCE(sum(c.amount), 0) FROM "material_request_costs" c WHERE c.material_request_id = mr.id) END,
  mr.requested_by,
  CASE mr.status WHEN 'submitted' THEN NULL ELSE mr.admin_reviewed_by END,
  CASE mr.status WHEN 'submitted' THEN mr.created_at ELSE mr.admin_reviewed_at END,
  '/api/request-material/' || mr.id
FROM "material_requests" mr
LEFT JOIN "sub_projects" sp ON sp.id = mr.sub_project_id
LEFT JOIN "construction_projects" cp ON cp.id = sp.construction_project_id
LEFT JOIN "external_supply_projects" esp ON esp.id = mr.external_supply_project_id
WHERE mr.status IN ('submitted', 'waiting_finance_approval')

UNION ALL

-- Request alat internal — review admin. External rental dibuat Admin sendiri dan
-- langsung ke Divisi Alat; keputusan Divisi Alat tidak masuk Approval Center.
SELECT
  'equipment_request', er.id, 'admin',
  er.request_code,
  cp.project_code || ' ' || cp.project_name || ' · ' || initcap(replace(sp.sub_project_type::text, '_', ' ')),
  (SELECT COALESCE(sum(i.requested_quantity), 0) FROM "equipment_request_items" i WHERE i.equipment_request_id = er.id) || ' unit',
  NULL::numeric,
  er.requested_by, NULL::int, er.created_at,
  '/api/request-alat/' || er.id
FROM "equipment_requests" er
JOIN "sub_projects" sp ON sp.id = er.sub_project_id
JOIN "construction_projects" cp ON cp.id = sp.construction_project_id
WHERE er.status = 'submitted' AND er.request_type = 'internal_project'

UNION ALL

-- Progress harian — validasi admin. updated_at: log bisa kembali ke submitted
-- (diajukan ulang setelah ditolak, atau validasinya dicabut).
SELECT
  'progress_log', pl.id, 'admin',
  NULL::text,
  cp.project_code || ' ' || cp.project_name || ' · ' || initcap(replace(sp.sub_project_type::text, '_', ' ')),
  trim_scale(pl.realized_volume)::text || ' ' || sp.volume_unit || ' · ' || to_char(pl.progress_date, 'DD-MM-YYYY'),
  NULL::numeric,
  pl.created_by, NULL::int, pl.updated_at,
  '/api/projects/sub-projects/' || pl.sub_project_id || '/progress-logs/' || pl.id
FROM "daily_progress_logs" pl
JOIN "sub_projects" sp ON sp.id = pl.sub_project_id
JOIN "construction_projects" cp ON cp.id = sp.construction_project_id
WHERE pl.status = 'submitted';
