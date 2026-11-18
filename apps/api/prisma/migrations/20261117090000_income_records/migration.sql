-- G2 Divisi Finance — Income: tagihan klien (konstruksi/rental/supply) + pembayaran klien.
-- docs/claude_knowledge/plan-divisi-finance.md F10–F18. Tiga DROP tertunda (field_pic_id,
-- threshold_value, default_threshold_value) yang diusulkan `migrate diff` sengaja TIDAK di sini.

-- CreateEnum
CREATE TYPE "income_record_status" AS ENUM ('submitted', 'verified', 'rejected', 'cancelled', 'voided');

-- CreateEnum
CREATE TYPE "income_payment_method" AS ENUM ('transfer', 'cash', 'giro', 'other');

-- CreateTable
CREATE TABLE "income_records" (
    "id" SERIAL NOT NULL,
    "income_code" VARCHAR(50) NOT NULL,
    "sub_project_id" INTEGER,
    "external_rental_project_id" INTEGER,
    "external_supply_project_id" INTEGER,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "notes" TEXT,
    "status" "income_record_status" NOT NULL DEFAULT 'submitted',
    "progress_volume_from" DECIMAL(18,2),
    "progress_volume_to" DECIMAL(18,2),
    "target_volume_snapshot" DECIMAL(18,2),
    "contract_value_snapshot" DECIMAL(18,2),
    "created_by" INTEGER NOT NULL,
    "verified_by" INTEGER,
    "verified_at" TIMESTAMP(3),
    "finance_notes" TEXT,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "voided_by" INTEGER,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_record_items" (
    "id" SERIAL NOT NULL,
    "income_record_id" INTEGER NOT NULL,
    "equipment_workhour_log_id" INTEGER,
    "material_receipt_id" INTEGER,
    "unit_rate" DECIMAL(18,2) NOT NULL,
    "rate_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "income_record_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_payments" (
    "id" SERIAL NOT NULL,
    "payment_code" VARCHAR(50) NOT NULL,
    "income_record_id" INTEGER NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payer_name" VARCHAR(150),
    "payment_method" "income_payment_method",
    "reference_number" VARCHAR(100),
    "notes" TEXT,
    "recorded_by" INTEGER NOT NULL,
    "voided_by" INTEGER,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_payment_files" (
    "id" SERIAL NOT NULL,
    "income_payment_id" INTEGER NOT NULL,
    "file_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "income_payment_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "income_records_income_code_key" ON "income_records"("income_code");

-- CreateIndex
CREATE INDEX "income_records_sub_project_id_status_idx" ON "income_records"("sub_project_id", "status");

-- CreateIndex
CREATE INDEX "income_records_external_rental_project_id_status_idx" ON "income_records"("external_rental_project_id", "status");

-- CreateIndex
CREATE INDEX "income_records_external_supply_project_id_status_idx" ON "income_records"("external_supply_project_id", "status");

-- CreateIndex
CREATE INDEX "income_records_status_idx" ON "income_records"("status");

-- CreateIndex
CREATE INDEX "income_record_items_equipment_workhour_log_id_idx" ON "income_record_items"("equipment_workhour_log_id");

-- CreateIndex
CREATE INDEX "income_record_items_material_receipt_id_idx" ON "income_record_items"("material_receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "income_record_items_income_record_id_equipment_workhour_log_key" ON "income_record_items"("income_record_id", "equipment_workhour_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "income_record_items_income_record_id_material_receipt_id_key" ON "income_record_items"("income_record_id", "material_receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "income_payments_payment_code_key" ON "income_payments"("payment_code");

-- CreateIndex
CREATE INDEX "income_payments_income_record_id_idx" ON "income_payments"("income_record_id");

-- CreateIndex
CREATE INDEX "income_payments_payment_date_idx" ON "income_payments"("payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "income_payment_files_file_id_key" ON "income_payment_files"("file_id");

-- CreateIndex
CREATE INDEX "income_payment_files_income_payment_id_idx" ON "income_payment_files"("income_payment_id");

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_sub_project_id_fkey" FOREIGN KEY ("sub_project_id") REFERENCES "sub_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_external_rental_project_id_fkey" FOREIGN KEY ("external_rental_project_id") REFERENCES "external_rental_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_external_supply_project_id_fkey" FOREIGN KEY ("external_supply_project_id") REFERENCES "external_supply_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_record_items" ADD CONSTRAINT "income_record_items_income_record_id_fkey" FOREIGN KEY ("income_record_id") REFERENCES "income_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_record_items" ADD CONSTRAINT "income_record_items_equipment_workhour_log_id_fkey" FOREIGN KEY ("equipment_workhour_log_id") REFERENCES "equipment_workhour_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_record_items" ADD CONSTRAINT "income_record_items_material_receipt_id_fkey" FOREIGN KEY ("material_receipt_id") REFERENCES "material_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_payments" ADD CONSTRAINT "income_payments_income_record_id_fkey" FOREIGN KEY ("income_record_id") REFERENCES "income_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_payments" ADD CONSTRAINT "income_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_payments" ADD CONSTRAINT "income_payments_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_payment_files" ADD CONSTRAINT "income_payment_files_income_payment_id_fkey" FOREIGN KEY ("income_payment_id") REFERENCES "income_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_payment_files" ADD CONSTRAINT "income_payment_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- Constraint yang tidak bisa dinyatakan Prisma
-- ------------------------------------------------------------

-- F10: tepat satu konteks
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_context_check"
  CHECK (num_nonnulls("sub_project_id", "external_rental_project_id", "external_supply_project_id") = 1);
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_period_check"
  CHECK ("period_end" >= "period_start");
-- F11: snapshot progress terisi tepat untuk konstruksi, dan bertambah
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_progress_check"
  CHECK (CASE WHEN "sub_project_id" IS NOT NULL
    THEN "progress_volume_from" >= 0 AND "progress_volume_to" > "progress_volume_from"
      AND "target_volume_snapshot" > 0 AND "progress_volume_to" <= "target_volume_snapshot"
      AND "contract_value_snapshot" > 0
    ELSE num_nonnulls("progress_volume_from", "progress_volume_to", "target_volume_snapshot", "contract_value_snapshot") = 0 END);
-- Jejak keputusan lengkap sesuai status (alasan tolak/batal/void wajib)
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_verify_check"
  CHECK (("status" IN ('verified', 'rejected', 'voided')) = ("verified_by" IS NOT NULL AND "verified_at" IS NOT NULL));
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_reject_check"
  CHECK ("status" <> 'rejected' OR "finance_notes" IS NOT NULL);
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_cancel_check"
  CHECK (("status" = 'cancelled') = ("cancelled_by" IS NOT NULL AND "cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_void_check"
  CHECK (("status" = 'voided') = ("voided_by" IS NOT NULL AND "voided_at" IS NOT NULL AND "void_reason" IS NOT NULL));

-- Item: tepat satu sumber, tarif positif
ALTER TABLE "income_record_items" ADD CONSTRAINT "income_record_items_source_check"
  CHECK (num_nonnulls("equipment_workhour_log_id", "material_receipt_id") = 1);
ALTER TABLE "income_record_items" ADD CONSTRAINT "income_record_items_rate_check"
  CHECK ("unit_rate" > 0);

-- Pembayaran: nominal positif; jejak void lengkap atau kosong
ALTER TABLE "income_payments" ADD CONSTRAINT "income_payments_amount_check"
  CHECK ("amount" > 0);
ALTER TABLE "income_payments" ADD CONSTRAINT "income_payments_void_check"
  CHECK (("voided_by" IS NULL) = ("voided_at" IS NULL) AND ("voided_at" IS NULL) = ("void_reason" IS NULL));

-- VIEW approval_queue: definisi 20261106090000 apa adanya + blok income_record (finance).
-- security_invoker WAJIB dinyatakan ulang — lihat alasan di migrasi 20261017090000.
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
WHERE er.status = 'submitted'

UNION ALL

-- Klaim upah pekerja — admin (submitted) lalu finance (waiting_finance_approval).
-- amount = SUM(upah + lembur) tanpa pengali (P2), sama dengan labor-wage-claim.service
SELECT
  'labor_wage_claim',
  wc.id,
  CASE wc.status WHEN 'submitted' THEN 'admin' ELSE 'finance' END,
  wc.claim_code,
  cp.project_code || ' ' || cp.project_name || ' · ' || initcap(replace(sp.sub_project_type::text, '_', ' ')),
  'Periode ' || to_char(wc.period_start, 'DD-MM-YYYY') || ' s/d ' || to_char(wc.period_end, 'DD-MM-YYYY')
    || ' · ' || (SELECT count(DISTINCT i.project_worker_id) FROM "field_labor_wage_claim_items" i WHERE i.field_labor_wage_claim_id = wc.id) || ' orang'
    || ' · ' || (SELECT count(*) FROM "field_labor_wage_claim_items" i WHERE i.field_labor_wage_claim_id = wc.id) || ' hari-orang',
  (SELECT COALESCE(sum(i.daily_wage + i.overtime_amount), 0)
     FROM "field_labor_wage_claim_items" i WHERE i.field_labor_wage_claim_id = wc.id),
  wc.requested_by,
  CASE wc.status WHEN 'submitted' THEN NULL ELSE wc.admin_validated_by END,
  CASE wc.status WHEN 'submitted' THEN wc.created_at ELSE wc.admin_validated_at END,
  '/api/labor-wage-claims/' || wc.id
FROM "field_labor_wage_claims" wc
JOIN "sub_projects" sp ON sp.id = wc.sub_project_id
JOIN "construction_projects" cp ON cp.id = sp.construction_project_id
WHERE wc.status IN ('submitted', 'waiting_finance_approval')

UNION ALL

-- Bukti bayar upah — validasi finance. amount = nominal yang DIBAYAR (boleh beda dari klaim, L8)
SELECT
  'labor_payment_proof', pp.id, 'finance',
  pp.proof_code,
  cp.project_code || ' ' || cp.project_name || ' · ' || initcap(replace(sp.sub_project_type::text, '_', ' ')),
  'Bayar ' || wc.claim_code || COALESCE(' · diterima ' || pp.receiver_name, '')
    || ' · ' || (SELECT count(*) FROM "field_labor_wage_payment_proof_files" f WHERE f.field_labor_wage_payment_proof_id = pp.id) || ' berkas',
  pp.paid_amount,
  pp.submitted_by, NULL::int, pp.created_at,
  '/api/labor-payment-proofs/' || pp.id
FROM "field_labor_wage_payment_proofs" pp
JOIN "field_labor_wage_claims" wc ON wc.id = pp.field_labor_wage_claim_id
JOIN "sub_projects" sp ON sp.id = wc.sub_project_id
JOIN "construction_projects" cp ON cp.id = sp.construction_project_id
WHERE pp.status = 'submitted'

UNION ALL

-- Income record — verifikasi finance (plan Finance G2, F17). amount = total tagihan, rumus
-- SAMA dengan income-record.service (totalsOf): konstruksi dari snapshot volume, rental/supply
-- dari item × tarif (dibulatkan per baris).
SELECT
  'income_record', ir.id, 'finance',
  ir.income_code,
  COALESCE(
    cp.project_code || ' ' || cp.project_name || ' · ' || initcap(replace(sp.sub_project_type::text, '_', ' ')),
    erp.rental_project_code || ' ' || erp.rental_project_name,
    esp.supply_project_code || ' ' || esp.supply_project_name),
  CASE WHEN ir.sub_project_id IS NOT NULL THEN 'Progress'
       WHEN ir.external_rental_project_id IS NOT NULL THEN 'Sewa alat'
       ELSE 'Supply material' END
    || ' · ' || to_char(ir.period_start, 'DD-MM-YYYY') || ' s/d ' || to_char(ir.period_end, 'DD-MM-YYYY'),
  CASE WHEN ir.sub_project_id IS NOT NULL
    THEN round((ir.progress_volume_to - ir.progress_volume_from) / ir.target_volume_snapshot * ir.contract_value_snapshot, 2)
    ELSE (SELECT COALESCE(sum(round(COALESCE(wl.total_workhour, rc.accepted_quantity) * it.unit_rate, 2)), 0)
            FROM "income_record_items" it
            LEFT JOIN "equipment_workhour_logs" wl ON wl.id = it.equipment_workhour_log_id
            LEFT JOIN "material_receipts" rc ON rc.id = it.material_receipt_id
           WHERE it.income_record_id = ir.id) END,
  ir.created_by, NULL::int, ir.created_at,
  '/api/income-records/' || ir.id
FROM "income_records" ir
LEFT JOIN "sub_projects" sp ON sp.id = ir.sub_project_id
LEFT JOIN "construction_projects" cp ON cp.id = sp.construction_project_id
LEFT JOIN "external_rental_projects" erp ON erp.id = ir.external_rental_project_id
LEFT JOIN "external_supply_projects" esp ON esp.id = ir.external_supply_project_id
WHERE ir.status = 'submitted';

-- Tabel baru WAJIB RLS tanpa policy (REST API publik Supabase), tanpa FORCE
ALTER TABLE "income_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "income_record_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "income_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "income_payment_files" ENABLE ROW LEVEL SECURITY;
