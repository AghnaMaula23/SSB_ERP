-- Upah pekerja: klaim upah per periode (T13) + bukti bayar (T14).
-- docs/claude_knowledge/plan-divisi-lapangan.md L5–L8. Tiga DROP tertunda
-- (field_pic_id, threshold_value, default_threshold_value) sengaja TIDAK di sini.

-- CreateEnum
CREATE TYPE "labor_wage_claim_status" AS ENUM ('submitted', 'waiting_finance_approval', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "labor_payment_proof_status" AS ENUM ('submitted', 'validated', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "field_labor_wage_claims" (
    "id" SERIAL NOT NULL,
    "claim_code" VARCHAR(50) NOT NULL,
    "sub_project_id" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "notes" TEXT,
    "status" "labor_wage_claim_status" NOT NULL DEFAULT 'submitted',
    "requested_by" INTEGER NOT NULL,
    "admin_validated_by" INTEGER,
    "admin_validated_at" TIMESTAMP(3),
    "admin_notes" TEXT,
    "finance_reviewed_by" INTEGER,
    "finance_reviewed_at" TIMESTAMP(3),
    "finance_notes" TEXT,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_labor_wage_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_labor_wage_claim_items" (
    "id" SERIAL NOT NULL,
    "field_labor_wage_claim_id" INTEGER NOT NULL,
    "daily_labor_log_item_id" INTEGER,
    "project_worker_id" INTEGER NOT NULL,
    "work_date" DATE NOT NULL,
    "worker_code" VARCHAR(20) NOT NULL,
    "worker_name" VARCHAR(150) NOT NULL,
    "worker_role" VARCHAR(100) NOT NULL,
    "worker_type" "worker_type" NOT NULL,
    "daily_wage" DECIMAL(18,2) NOT NULL,
    "overtime_amount" DECIMAL(18,2) NOT NULL,
    "task_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_labor_wage_claim_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_labor_wage_payment_proofs" (
    "id" SERIAL NOT NULL,
    "proof_code" VARCHAR(50) NOT NULL,
    "field_labor_wage_claim_id" INTEGER NOT NULL,
    "payment_date" DATE NOT NULL,
    "paid_amount" DECIMAL(18,2) NOT NULL,
    "receiver_name" VARCHAR(150),
    "notes" TEXT,
    "status" "labor_payment_proof_status" NOT NULL DEFAULT 'submitted',
    "submitted_by" INTEGER NOT NULL,
    "validated_by" INTEGER,
    "validated_at" TIMESTAMP(3),
    "finance_notes" TEXT,
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_labor_wage_payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_labor_wage_payment_proof_files" (
    "id" SERIAL NOT NULL,
    "field_labor_wage_payment_proof_id" INTEGER NOT NULL,
    "file_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_labor_wage_payment_proof_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_labor_wage_claims_claim_code_key" ON "field_labor_wage_claims"("claim_code");

-- CreateIndex
CREATE INDEX "field_labor_wage_claims_sub_project_id_status_idx" ON "field_labor_wage_claims"("sub_project_id", "status");

-- CreateIndex
CREATE INDEX "field_labor_wage_claims_requested_by_idx" ON "field_labor_wage_claims"("requested_by");

-- CreateIndex
CREATE INDEX "field_labor_wage_claim_items_daily_labor_log_item_id_idx" ON "field_labor_wage_claim_items"("daily_labor_log_item_id");

-- CreateIndex
CREATE INDEX "field_labor_wage_claim_items_project_worker_id_idx" ON "field_labor_wage_claim_items"("project_worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_labor_wage_claim_items_field_labor_wage_claim_id_dail_key" ON "field_labor_wage_claim_items"("field_labor_wage_claim_id", "daily_labor_log_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_labor_wage_payment_proofs_proof_code_key" ON "field_labor_wage_payment_proofs"("proof_code");

-- CreateIndex
CREATE INDEX "field_labor_wage_payment_proofs_field_labor_wage_claim_id_idx" ON "field_labor_wage_payment_proofs"("field_labor_wage_claim_id");

-- CreateIndex
CREATE INDEX "field_labor_wage_payment_proofs_status_idx" ON "field_labor_wage_payment_proofs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "field_labor_wage_payment_proof_files_file_id_key" ON "field_labor_wage_payment_proof_files"("file_id");

-- CreateIndex
CREATE INDEX "field_labor_wage_payment_proof_files_field_labor_wage_payme_idx" ON "field_labor_wage_payment_proof_files"("field_labor_wage_payment_proof_id");

-- AddForeignKey
ALTER TABLE "field_labor_wage_claims" ADD CONSTRAINT "field_labor_wage_claims_sub_project_id_fkey" FOREIGN KEY ("sub_project_id") REFERENCES "sub_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_claims" ADD CONSTRAINT "field_labor_wage_claims_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_claims" ADD CONSTRAINT "field_labor_wage_claims_admin_validated_by_fkey" FOREIGN KEY ("admin_validated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_claims" ADD CONSTRAINT "field_labor_wage_claims_finance_reviewed_by_fkey" FOREIGN KEY ("finance_reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_claims" ADD CONSTRAINT "field_labor_wage_claims_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_claim_items" ADD CONSTRAINT "field_labor_wage_claim_items_field_labor_wage_claim_id_fkey" FOREIGN KEY ("field_labor_wage_claim_id") REFERENCES "field_labor_wage_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_claim_items" ADD CONSTRAINT "field_labor_wage_claim_items_daily_labor_log_item_id_fkey" FOREIGN KEY ("daily_labor_log_item_id") REFERENCES "daily_labor_log_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_claim_items" ADD CONSTRAINT "field_labor_wage_claim_items_project_worker_id_fkey" FOREIGN KEY ("project_worker_id") REFERENCES "project_workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_payment_proofs" ADD CONSTRAINT "field_labor_wage_payment_proofs_field_labor_wage_claim_id_fkey" FOREIGN KEY ("field_labor_wage_claim_id") REFERENCES "field_labor_wage_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_payment_proofs" ADD CONSTRAINT "field_labor_wage_payment_proofs_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_payment_proofs" ADD CONSTRAINT "field_labor_wage_payment_proofs_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_payment_proofs" ADD CONSTRAINT "field_labor_wage_payment_proofs_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_payment_proof_files" ADD CONSTRAINT "field_labor_wage_payment_proof_files_field_labor_wage_paym_fkey" FOREIGN KEY ("field_labor_wage_payment_proof_id") REFERENCES "field_labor_wage_payment_proofs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_labor_wage_payment_proof_files" ADD CONSTRAINT "field_labor_wage_payment_proof_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ------------------------------------------------------------
-- Tidak bisa dinyatakan di schema.prisma
-- ------------------------------------------------------------

ALTER TABLE "field_labor_wage_claims" ADD CONSTRAINT "field_labor_wage_claims_period_check"
  CHECK ("period_end" >= "period_start");
-- Jejak keputusan wajib lengkap sesuai status (alasan tolak/batal wajib) — pola pengajuan dana
ALTER TABLE "field_labor_wage_claims" ADD CONSTRAINT "field_labor_wage_claims_cancel_check"
  CHECK (("status" = 'cancelled') = ("cancelled_by" IS NOT NULL AND "cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
ALTER TABLE "field_labor_wage_claims" ADD CONSTRAINT "field_labor_wage_claims_admin_check"
  CHECK ("status" NOT IN ('waiting_finance_approval', 'approved')
    OR ("admin_validated_by" IS NOT NULL AND "admin_validated_at" IS NOT NULL));
ALTER TABLE "field_labor_wage_claims" ADD CONSTRAINT "field_labor_wage_claims_finance_check"
  CHECK (("finance_reviewed_at" IS NOT NULL) = ("status" = 'approved'
    OR ("status" = 'rejected' AND "admin_validated_at" IS NOT NULL AND "finance_notes" IS NOT NULL AND "finance_reviewed_by" IS NOT NULL)));
ALTER TABLE "field_labor_wage_claims" ADD CONSTRAINT "field_labor_wage_claims_reject_check"
  CHECK ("status" <> 'rejected' OR "finance_notes" IS NOT NULL OR "admin_notes" IS NOT NULL);

ALTER TABLE "field_labor_wage_claim_items" ADD CONSTRAINT "field_labor_wage_claim_items_wage_check"
  CHECK ("daily_wage" > 0 AND "overtime_amount" >= 0);
ALTER TABLE "field_labor_wage_claim_items" ADD CONSTRAINT "field_labor_wage_claim_items_text_check"
  CHECK (btrim("worker_code") <> '' AND btrim("worker_name") <> '' AND btrim("worker_role") <> '');

ALTER TABLE "field_labor_wage_payment_proofs" ADD CONSTRAINT "field_labor_wage_payment_proofs_amount_check"
  CHECK ("paid_amount" > 0);
ALTER TABLE "field_labor_wage_payment_proofs" ADD CONSTRAINT "field_labor_wage_payment_proofs_cancel_check"
  CHECK (("status" = 'cancelled') = ("cancelled_by" IS NOT NULL AND "cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
ALTER TABLE "field_labor_wage_payment_proofs" ADD CONSTRAINT "field_labor_wage_payment_proofs_finance_check"
  CHECK (("status" IN ('validated', 'rejected')) = ("validated_by" IS NOT NULL AND "validated_at" IS NOT NULL));
ALTER TABLE "field_labor_wage_payment_proofs" ADD CONSTRAINT "field_labor_wage_payment_proofs_reject_check"
  CHECK ("status" <> 'rejected' OR "finance_notes" IS NOT NULL);
-- L8: satu bukti AKTIF per klaim. Service memeriksa di bawah kunci klaim; index ini penjaga terakhir.
CREATE UNIQUE INDEX "field_labor_wage_payment_proofs_one_active_key" ON "field_labor_wage_payment_proofs"("field_labor_wage_claim_id")
  WHERE "status" IN ('submitted', 'validated');

-- Tabel baru WAJIB RLS tanpa policy (REST API publik Supabase), tanpa FORCE
ALTER TABLE "field_labor_wage_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_labor_wage_claim_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_labor_wage_payment_proofs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_labor_wage_payment_proof_files" ENABLE ROW LEVEL SECURITY;
