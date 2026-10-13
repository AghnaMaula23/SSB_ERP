-- Satu dokumen sumber (purchase request, klaim pendapatan alat) hanya boleh
-- punya SATU baris Kas Alat. Lapis kedua di bawah claimTransition: 10 Okt 2026
-- terbukti tiga approval bersamaan menghasilkan tiga cash-out untuk satu order.
--
-- Baris manual (opening_balance, manual_expense, adjustment) selalu
-- source_id NULL — validator menolak sourceId dari klien — dan Postgres
-- menganggap NULL saling berbeda, jadi catatan manual tidak terhalang.
--
-- Index biasa di kolom yang sama digantikan index unik (yang juga berfungsi
-- sebagai index biasa). Saat ditulis: tabel kosong, 0 duplikat.

-- DropIndex
DROP INDEX "equipment_cash_transaction_source_type_source_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "equipment_cash_transaction_source_type_source_id_key" ON "equipment_cash_transaction"("source_type", "source_id");
