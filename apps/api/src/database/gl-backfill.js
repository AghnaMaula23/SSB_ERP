// Backfill jurnal GL (docs/claude_knowledge/plan-divisi-finance.md G1, F1).
// Dokumen yang sudah sah SEBELUM modul GL ada belum punya jurnal: laporan realisasi
// `validated`, bukti bayar upah `validated`, dan request material `approved`.
// Skrip ini menjurnal mereka dengan fungsi yang SAMA dengan jalur hidup, bertanggal
// tanggal bisnis aslinya. Idempoten: yang sudah punya jurnal dilewati (dan dijaga
// unique index satu-jurnal-per-sumber). Jalankan SEKALI saat go-live, sebelum bulan
// mana pun ditutup: `npm run gl:backfill` (tambah `-- --dry-run` untuk melihat saja).
require('dotenv').config();
const prisma = require('../config/database.js');
const { postReportJournal } = require('../modules/finance-field/field-expense-report.service.js');
const { postProofJournal } = require('../modules/labor/labor-payment-proof.service.js');
const { postRequestJournal } = require('../modules/request-material/request-material.service.js');

const dryRun = process.argv.includes('--dry-run');

const SOURCES = [
  {
    sourceType: 'field_expense_report', label: 'laporan realisasi', post: postReportJournal,
    pending: () => prisma.$queryRaw`
      SELECT r.id, r.report_code AS code, r.validated_by AS "userId" FROM field_expense_reports r
      WHERE r.status = 'validated' AND NOT EXISTS (
        SELECT 1 FROM journal_entries j WHERE j.source_type = 'field_expense_report' AND j.source_id = r.id)
      ORDER BY r.id`,
  },
  {
    sourceType: 'labor_payment_proof', label: 'bukti bayar upah', post: postProofJournal,
    pending: () => prisma.$queryRaw`
      SELECT p.id, p.proof_code AS code, p.validated_by AS "userId" FROM field_labor_wage_payment_proofs p
      WHERE p.status = 'validated' AND NOT EXISTS (
        SELECT 1 FROM journal_entries j WHERE j.source_type = 'labor_payment_proof' AND j.source_id = p.id)
      ORDER BY p.id`,
  },
  {
    sourceType: 'material_request', label: 'request material', post: postRequestJournal,
    pending: () => prisma.$queryRaw`
      SELECT m.id, m.request_code AS code, m.finance_reviewed_by AS "userId" FROM material_requests m
      WHERE m.status = 'approved' AND NOT EXISTS (
        SELECT 1 FROM journal_entries j WHERE j.source_type = 'material_request' AND j.source_id = m.id)
      ORDER BY m.id`,
  },
];

(async () => {
  let failed = 0;
  try {
    for (const source of SOURCES) {
      const rows = await source.pending();
      let posted = 0;
      let skipped = 0;
      for (const row of rows) {
        if (dryRun) { console.log(`[GL] (dry-run) ${source.label} ${row.code}`); continue; }
        try {
          const journal = await prisma.$transaction((tx) => source.post(tx, row.id, row.userId));
          if (journal) posted += 1; else skipped += 1; // nominal 0 — tidak ada yang dijurnal
        } catch (err) {
          failed += 1;
          console.error(`[GL] ${source.label} ${row.code} gagal: ${err.message}`);
        }
      }
      console.log(`[GL] ${source.label}: ${rows.length} tanpa jurnal, ${posted} dijurnal, ${skipped} bernominal 0`);
    }
  } catch (err) {
    failed += 1;
    console.error(`[GL] backfill gagal: ${err.message}`);
  } finally {
    if (failed) process.exitCode = 1;
    await prisma.$disconnect();
  }
})();
