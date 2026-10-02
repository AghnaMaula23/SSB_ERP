const express = require('express');
const { body, param, query } = require('express-validator');
const { authenticate, authorize, authorizeStrict } = require('../../middleware/auth.js');
const validate = require('../../middleware/validate.js');
const controller = require('./purchase-request.controller.js');

const router = express.Router();
router.use(authenticate);

const ORDER_CATEGORIES = ['repair', 'maintenance', 'stock'];
const STATUSES = [
  'submitted', 'rejected_by_admin', 'waiting_finance_approval',
  'rejected_by_finance', 'approved', 'cancelled',
];

const idParam = param('id').isInt({ min: 1 }).withMessage('ID harus angka').toInt();

const pageRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka minimal 1').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100').toInt(),
];

// Kolom terkelola sistem. Ditolak terang-terangan supaya klien tidak bisa
// mengarang nomor dokumen, status, total, atau jejak siapa-menyetujui-apa.
const systemManagedRules = [
  body('requestCode').not().exists().withMessage('Nomor order dibuat otomatis oleh sistem'),
  body('status').not().exists().withMessage('Status digerakkan oleh aksi validate/approve/reject, bukan diisi manual'),
  body('totalEstimatedAmount').not().exists().withMessage('Total estimasi dihitung sistem dari item'),
  body('totalApprovedAmount').not().exists().withMessage('Total disetujui dihitung sistem saat Finance approve'),
  body('estimatedTotalPrice').not().exists().withMessage('Total per baris dihitung sistem dari jumlah x harga satuan'),
];

const repairItemRules = [
  body('repairItems').optional().isArray({ min: 1 }).withMessage('repairItems harus array dan tidak boleh kosong'),
  body('repairItems.*.damageLogId').if(body('repairItems').exists())
    .isInt({ min: 1 }).withMessage('damageLogId wajib diisi dan harus angka').toInt(),
  body('repairItems.*.serviceFee').optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('Harga jasa tidak boleh negatif').toFloat(),
  body('repairItems.*.notes').optional({ nullable: true }).trim(),
  body('repairItems.*.spareparts').optional().isArray().withMessage('spareparts harus array'),
  body('repairItems.*.spareparts.*.itemName').if(body('repairItems').exists())
    .trim().notEmpty().withMessage('Nama sparepart wajib diisi')
    .isLength({ max: 200 }).withMessage('Nama sparepart maksimal 200 karakter'),
  body('repairItems.*.spareparts.*.quantity').if(body('repairItems').exists())
    .isFloat({ gt: 0 }).withMessage('Jumlah sparepart harus lebih dari 0').toFloat(),
  body('repairItems.*.spareparts.*.estimatedUnitPrice').if(body('repairItems').exists())
    .isFloat({ min: 0 }).withMessage('Harga satuan sparepart tidak boleh negatif').toFloat(),
];

const maintenanceItemRules = [
  body('maintenanceItems').optional().isArray({ min: 1 }).withMessage('maintenanceItems harus array dan tidak boleh kosong'),
  body('maintenanceItems.*.maintenanceSettingId').if(body('maintenanceItems').exists())
    .isInt({ min: 1 }).withMessage('maintenanceSettingId wajib diisi dan harus angka').toInt(),
  body('maintenanceItems.*.estimatedPrice').if(body('maintenanceItems').exists())
    .isFloat({ min: 0 }).withMessage('Estimasi harga tidak boleh negatif').toFloat(),
];

const stockItemRules = [
  body('stockItems').optional().isArray({ min: 1 }).withMessage('stockItems harus array dan tidak boleh kosong'),
  body('stockItems.*.itemName').if(body('stockItems').exists())
    .trim().notEmpty().withMessage('Nama barang wajib diisi')
    .isLength({ max: 200 }).withMessage('Nama barang maksimal 200 karakter'),
  body('stockItems.*.quantity').if(body('stockItems').exists())
    .isFloat({ gt: 0 }).withMessage('Jumlah harus lebih dari 0').toFloat(),
  body('stockItems.*.estimatedUnitPrice').if(body('stockItems').exists())
    .isFloat({ min: 0 }).withMessage('Harga satuan tidak boleh negatif').toFloat(),
];

/**
 * Array item yang dikirim harus cocok dengan orderCategory. Tanpa ini, klien
 * bisa mengirim orderCategory=stock berisi repairItems, dan item-nya diam-diam
 * tidak tersimpan — order lolos tanpa isi.
 */
const itemsMatchCategory = body().custom((value) => {
  const category = value.orderCategory;
  if (!category) return true;

  const expected = { repair: 'repairItems', maintenance: 'maintenanceItems', stock: 'stockItems' }[category];
  const strays = ['repairItems', 'maintenanceItems', 'stockItems']
    .filter((key) => key !== expected && value[key] !== undefined);

  if (strays.length > 0) {
    throw new Error(`Order kategori "${category}" hanya menerima "${expected}", bukan ${strays.join(', ')}`);
  }
  return true;
});

const createRules = [
  body('requestDate').notEmpty().withMessage('Tanggal pengajuan wajib diisi')
    .isISO8601().withMessage('requestDate harus format tanggal YYYY-MM-DD'),
  body('orderCategory').notEmpty().withMessage('Kategori order wajib diisi')
    .isIn(ORDER_CATEGORIES).withMessage(`orderCategory harus salah satu dari: ${ORDER_CATEGORIES.join(', ')}`),
  ...systemManagedRules,
  ...repairItemRules,
  ...maintenanceItemRules,
  ...stockItemRules,
  itemsMatchCategory,
];

const updateRules = [
  idParam,
  body('requestDate').optional().isISO8601().withMessage('requestDate harus format tanggal YYYY-MM-DD'),
  body('orderCategory').optional().isIn(ORDER_CATEGORIES)
    .withMessage(`orderCategory harus salah satu dari: ${ORDER_CATEGORIES.join(', ')}`),
  ...systemManagedRules,
  ...repairItemRules,
  ...maintenanceItemRules,
  ...stockItemRules,
  itemsMatchCategory,
];

// Alasan validasi/penolakan/persetujuan BELUM punya tempat menyimpan: desainnya
// menaruh itu di approval_task_logs (Approval Center, belum dibangun) dan header
// PR sengaja tidak punya kolom teks. Ditolak terang-terangan daripada diterima
// lalu dibuang diam-diam.
const notesNotSupported = body('notes').not().exists()
  .withMessage('Catatan approval belum bisa disimpan — tempatnya di Approval Center yang belum dibangun');

router.get('/',
  authorize('purchase-request:read'),
  validate([
    ...pageRules,
    query('orderCategory').optional().isIn(ORDER_CATEGORIES)
      .withMessage(`orderCategory harus salah satu dari: ${ORDER_CATEGORIES.join(', ')}`),
    query('status').optional().isIn(STATUSES)
      .withMessage(`status harus salah satu dari: ${STATUSES.join(', ')}`),
    query('search').optional().trim(),
  ]),
  controller.list);

router.get('/:id', authorize('purchase-request:read'), validate([idParam]), controller.detail);

router.post('/', authorize('purchase-request:create'), validate(createRules), controller.store);

router.put('/:id', authorize('purchase-request:update'), validate(updateRules), controller.update);

router.put('/:id/cancel',
  authorize('purchase-request:update'),
  validate([idParam, notesNotSupported]),
  controller.cancel);

// authorizeStrict: super_admin TIDAK di-bypass di dua endpoint berikut.
// Pemisahan wewenang mengalahkan bypass — keputusan 27 September 2026.
router.put('/:id/validate',
  authorizeStrict('purchase-request:validate'),
  validate([idParam, notesNotSupported]),
  controller.validateByAdmin);

router.put('/:id/approve',
  authorizeStrict('purchase-request:approve'),
  validate([
    idParam,
    notesNotSupported,
    body('approvedRepairItems').optional().isArray(),
    body('approvedRepairItems.*.repairItemId').if(body('approvedRepairItems').exists())
      .isInt({ min: 1 }).withMessage('repairItemId harus angka').toInt(),
    body('approvedRepairItems.*.approvedServiceFee').optional({ nullable: true })
      .isFloat({ min: 0 }).withMessage('Nominal jasa tidak boleh negatif').toFloat(),
    body('approvedRepairItems.*.spareparts.*.sparepartId').if(body('approvedRepairItems').exists())
      .isInt({ min: 1 }).withMessage('sparepartId harus angka').toInt(),
    body('approvedRepairItems.*.spareparts.*.approvedTotalPrice').if(body('approvedRepairItems').exists())
      .isFloat({ min: 0 }).withMessage('Nominal sparepart tidak boleh negatif').toFloat(),
    body('approvedMaintenanceItems').optional().isArray(),
    body('approvedMaintenanceItems.*.itemId').if(body('approvedMaintenanceItems').exists())
      .isInt({ min: 1 }).withMessage('itemId harus angka').toInt(),
    body('approvedMaintenanceItems.*.approvedPrice').if(body('approvedMaintenanceItems').exists())
      .isFloat({ min: 0 }).withMessage('Nominal tidak boleh negatif').toFloat(),
    body('approvedStockItems').optional().isArray(),
    body('approvedStockItems.*.itemId').if(body('approvedStockItems').exists())
      .isInt({ min: 1 }).withMessage('itemId harus angka').toInt(),
    body('approvedStockItems.*.approvedTotalPrice').if(body('approvedStockItems').exists())
      .isFloat({ min: 0 }).withMessage('Nominal tidak boleh negatif').toFloat(),
  ]),
  controller.approve);

// Penolakan dipegang Admin (saat submitted) atau Finance (saat menunggu
// pencairan). Keduanya aksi berwenang, jadi ikut authorizeStrict.
router.put('/:id/reject',
  authorizeStrict('purchase-request:validate', 'purchase-request:approve'),
  validate([idParam, notesNotSupported]),
  controller.reject);

module.exports = router;
