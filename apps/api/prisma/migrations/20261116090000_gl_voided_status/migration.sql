-- G1 Divisi Finance (docs/claude_knowledge/plan-divisi-finance.md F6): status `voided`
-- = dibatalkan SETELAH divalidasi, dengan jurnal balik. Dipisah dari migrasi berikutnya:
-- nilai enum baru tidak boleh dipakai (CHECK) di transaksi yang sama dengan ADD VALUE.

-- AlterEnum
ALTER TYPE "field_expense_report_status" ADD VALUE 'voided';

-- AlterEnum
ALTER TYPE "labor_payment_proof_status" ADD VALUE 'voided';
