-- Kas lapangan masuk Approval Center (T15.3) + arsip penutupan `stage-field-cash` (T16.4).
-- docs/plan-divisi-lapangan.md 4d. Tanpa perubahan schema.prisma: Prisma mengabaikan
-- VIEW, dan archive_key adalah VARCHAR yang dibatasi CHECK di bawah. Diff Prisma tetap
-- mengusulkan 3 DROP yang sengaja ditunda (field_pic_id, threshold_value,
-- default_threshold_value) — tidak ikut.

-- VIEW approval_queue: definisi 20261017090000 apa adanya + 3 blok kas lapangan.
-- Kolom tidak berubah (CREATE OR REPLACE hanya boleh menambah baris, bukan mengubah kolom).
-- security_invoker WAJIB dinyatakan ulang — lihat alasan di migrasi asal.
CREATE OR REPLACE VIEW "approval_queue" WITH (security_invoker = true) AS

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
WHERE pl.status = 'submitted'

UNION ALL

-- Pengajuan dana lapangan — validasi admin, lalu keputusan finance. Nominal = perkiraan (L2)
SELECT
  'field_operational_request',
  fr.id,
  CASE fr.status WHEN 'submitted' THEN 'admin' ELSE 'finance' END,
  fr.request_code,
  cp.project_code || ' ' || cp.project_name || ' · ' || initcap(replace(sp.sub_project_type::text, '_', ' ')),
  (SELECT count(*) FROM "field_operational_request_items" i WHERE i.field_operational_request_id = fr.id) || ' baris biaya',
  (SELECT COALESCE(sum(round(i.quantity * i.estimated_unit_price, 2)), 0)
     FROM "field_operational_request_items" i WHERE i.field_operational_request_id = fr.id),
  fr.requested_by,
  CASE fr.status WHEN 'submitted' THEN NULL ELSE fr.admin_validated_by END,
  CASE fr.status WHEN 'submitted' THEN fr.created_at ELSE fr.admin_validated_at END,
  '/api/field-operational-requests/' || fr.id
FROM "field_operational_requests" fr
JOIN "sub_projects" sp ON sp.id = fr.sub_project_id
JOIN "construction_projects" cp ON cp.id = sp.construction_project_id
WHERE fr.status IN ('submitted', 'waiting_finance_approval')

UNION ALL

-- Laporan realisasi lapangan — validasi finance. Ringkasan menandai laporan mendesak
-- (tanpa pengajuan) supaya Finance melihatnya sebelum membuka detail (L1)
SELECT
  'field_expense_report', er.id, 'finance',
  er.report_code,
  cp.project_code || ' ' || cp.project_name || ' · ' || initcap(replace(sp.sub_project_type::text, '_', ' ')),
  CASE WHEN er.field_operational_request_id IS NULL THEN 'Mendesak · tanpa pengajuan'
    ELSE 'Realisasi ' || fr.request_code END
    || ' · ' || (SELECT count(*) FROM "field_expense_report_items" i WHERE i.field_expense_report_id = er.id) || ' baris',
  (SELECT COALESCE(sum(round(i.quantity * i.unit_price, 2)), 0)
     FROM "field_expense_report_items" i WHERE i.field_expense_report_id = er.id),
  er.submitted_by, NULL::int, er.created_at,
  '/api/field-expense-reports/' || er.id
FROM "field_expense_reports" er
JOIN "sub_projects" sp ON sp.id = er.sub_project_id
JOIN "construction_projects" cp ON cp.id = sp.construction_project_id
LEFT JOIN "field_operational_requests" fr ON fr.id = er.field_operational_request_id
WHERE er.status = 'submitted';

-- Arsip penutupan tahapan `stage-field-cash` (L8): perluas CHECK cakupan
ALTER TABLE "project_closing_archives" DROP CONSTRAINT "project_closing_archives_scope_check";
ALTER TABLE "project_closing_archives" ADD CONSTRAINT "project_closing_archives_scope_check"
  CHECK (
    ("archive_key" IN ('stage-progress', 'stage-equipment', 'stage-material', 'stage-labor', 'stage-field-cash')
      AND "sub_project_id" IS NOT NULL AND "equipment_pool_item_id" IS NULL)
    OR ("archive_key" = 'project-summary'
      AND "construction_project_id" IS NOT NULL AND "sub_project_id" IS NULL AND "equipment_pool_item_id" IS NULL)
    OR ("archive_key" = 'supply-deliveries'
      AND "external_supply_project_id" IS NOT NULL AND "sub_project_id" IS NULL AND "equipment_pool_item_id" IS NULL)
    OR ("archive_key" = 'rental-timesheet'
      AND "external_rental_project_id" IS NOT NULL AND "equipment_pool_item_id" IS NOT NULL AND "sub_project_id" IS NULL)
  );
