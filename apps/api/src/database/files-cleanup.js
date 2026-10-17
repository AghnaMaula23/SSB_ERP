// Pembersih file (L6, docs/keputusan-desain-lampiran.md): objek storage yatim
// > 24 jam, lalu berkas project > 30 hari di sampah. Dijalankan dari cron apa pun
// (`npm run files:cleanup`); penjadwal dalam proses menunggu keputusan deploy.
require('dotenv').config();
const prisma = require('../config/database.js');
const { sweepOrphans, purgeTrash } = require('../modules/file/file.service.js');

(async () => {
  try {
    const trash = await purgeTrash();
    const orphans = await sweepOrphans();
    console.log(`[FILES] sampah dihapus permanen: ${trash.removed}, objek yatim dihapus: ${orphans.removed}`);
  } catch (err) {
    console.error(`[FILES] pembersihan gagal: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
