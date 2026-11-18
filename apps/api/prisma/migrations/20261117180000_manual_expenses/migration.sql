-- G8 Divisi Finance — pengeluaran manual Finance (langsung menjurnal, koreksi lewat void).
-- docs/claude_knowledge/plan-divisi-finance.md F9 + 3b. Tiga DROP tertunda (field_pic_id,
-- threshold_value, default_threshold_value) yang diusulkan `migrate diff` sengaja TIDAK di sini.

-- CreateTable
CREATE TABLE "finance_manual_expenses" (
    "id" SERIAL NOT NULL,
    "expense_code" VARCHAR(50) NOT NULL,
    "expense_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payee_name" VARCHAR(150),
    "payment_method" "income_payment_method",
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recorded_by" INTEGER NOT NULL,
    "voided_by" INTEGER,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_manual_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_manual_expense_files" (
    "id" SERIAL NOT NULL,
    "finance_manual_expense_id" INTEGER NOT NULL,
    "file_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_manual_expense_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_manual_expenses_expense_code_key" ON "finance_manual_expenses"("expense_code");

-- CreateIndex
CREATE INDEX "finance_manual_expenses_expense_date_idx" ON "finance_manual_expenses"("expense_date");

-- CreateIndex
CREATE UNIQUE INDEX "finance_manual_expense_files_file_id_key" ON "finance_manual_expense_files"("file_id");

-- CreateIndex
CREATE INDEX "finance_manual_expense_files_finance_manual_expense_id_idx" ON "finance_manual_expense_files"("finance_manual_expense_id");

-- AddForeignKey
ALTER TABLE "finance_manual_expenses" ADD CONSTRAINT "finance_manual_expenses_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_manual_expenses" ADD CONSTRAINT "finance_manual_expenses_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_manual_expense_files" ADD CONSTRAINT "finance_manual_expense_files_finance_manual_expense_id_fkey" FOREIGN KEY ("finance_manual_expense_id") REFERENCES "finance_manual_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_manual_expense_files" ADD CONSTRAINT "finance_manual_expense_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ------------------------------------------------------------
-- Constraint yang tidak bisa dinyatakan Prisma
-- ------------------------------------------------------------
ALTER TABLE "finance_manual_expenses" ADD CONSTRAINT "finance_manual_expenses_amount_check"
  CHECK ("amount" > 0);
ALTER TABLE "finance_manual_expenses" ADD CONSTRAINT "finance_manual_expenses_void_check"
  CHECK (("voided_at" IS NULL) = ("voided_by" IS NULL) AND ("voided_at" IS NULL) = ("void_reason" IS NULL));

-- RLS (CLAUDE.md 3b): tabel baru tertutup bagi REST API Supabase; backend = pemilik tabel
ALTER TABLE "finance_manual_expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_manual_expense_files" ENABLE ROW LEVEL SECURITY;
