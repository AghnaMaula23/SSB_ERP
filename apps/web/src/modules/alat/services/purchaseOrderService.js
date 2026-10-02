import { apiRequest } from '../../../services/api.js';

/**
 * Purchase Order — terhubung ke endpoint yang sudah disiapkan:
 *   GET    /api/equipment/purchase-requests        daftar + filter search/status/kategori
 *   GET    /api/equipment/purchase-requests/:id    detail + item (damage log, setting, sparepart)
 *   POST   /api/equipment/purchase-requests        ajukan order (per kategori: repair/maintenance/stock)
 *   PUT    /api/equipment/purchase-requests/:id    ubah item selagi status `submitted`
 *   PUT    /api/equipment/purchase-requests/:id/cancel  batalkan order milik pengaju
 *
 * Backend memakai satu relation item per kategori order, jadi bentuk kiriman
 * dan bentuk balasan berbeda-beda. `normalizeRequest` menyatukan semuanya ke
 * satu bentuk `items` supaya halaman cukup membaca satu struktur.
 *
 * Status & kategori TIDAK boleh diisi klien — backend menolak field itu
 * eksplisit, dan_status digerakkan aksi validate/approve/reject modul lain.
 */

const API_PREFIX = '/api/equipment/purchase-requests';

export const ORDER_CATEGORIES = [
  { value: 'repair', label: 'Repair / Service', hint: 'Untuk kerusakan: biaya jasa mekanik dan/atau sparepart dari supplier.' },
  { value: 'maintenance', label: 'Maintenance', hint: 'Perawatan berkala untuk aspek maintenance yang mendekati jatuh tempo.' },
  { value: 'stock', label: 'Stock Gudang', hint: 'Pengadaan barang persediaan gudang tanpa kerusakan terkait.' },
];

export const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Diajukan' },
  { value: 'waiting_finance_approval', label: 'Menunggu Finance' },
  { value: 'approved', label: 'Disetujui' },
  { value: 'rejected_by_admin', label: 'Ditolak Admin' },
  { value: 'rejected_by_finance', label: 'Ditolak Finance' },
  { value: 'cancelled', label: 'Dibatalkan' },
];

export const STATUS_STYLES = {
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  waiting_finance_approval: 'bg-violet-50 text-violet-700 border-violet-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected_by_admin: 'bg-red-50 text-red-700 border-red-200',
  rejected_by_finance: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const STATUS_ACCENTS = {
  submitted: 'bg-amber-400',
  waiting_finance_approval: 'bg-violet-400',
  approved: 'bg-emerald-400',
  rejected_by_admin: 'bg-red-400',
  rejected_by_finance: 'bg-red-400',
  cancelled: 'bg-slate-300',
};

export function statusLabel(status) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label || status || '-';
}

export function categoryLabel(orderCategory) {
  return ORDER_CATEGORIES.find((option) => option.value === orderCategory)?.label || orderCategory || '-';
}

/** Status saat pengaju masih boleh mengubah / membatalkan order. */
export function isEditableStatus(status) {
  return status === 'submitted';
}

// Nilai kategori lama (sebelum purchase-request batch 4) dipetakan ke kategori baru.
const LEGACY_CATEGORY_MAP = { perbaikan_alat: 'repair', servis_rutin: 'maintenance', suku_cadang: 'repair', service_rutin: 'maintenance' };
export function normalizeCategory(category) {
  return LEGACY_CATEGORY_MAP[category] || category;
}

const LEGACY_STATUS_MAP = { pending: 'submitted', rejected: 'rejected_by_admin' };
function normalizeStatus(status) {
  return LEGACY_STATUS_MAP[status] || status || 'submitted';
}

const money = (value) => Number(value || 0);
const userName = (user) => (user ? user.fullName || user.username : null);

function normalizeRequest(row) {
  const repairItems = row.repairItems || [];
  const maintenanceItems = row.maintenanceItems || [];
  const stockItems = row.stockItems || [];

  const items = [
    ...repairItems.map((item) => {
      const estimatedSpareparts = (item.spareparts || []).reduce((sum, sp) => sum + money(sp.estimatedTotalPrice), 0);
      const approvedSpareparts = (item.spareparts || []).reduce((sum, sp) => sum + money(sp.approvedTotalPrice), 0);
      return {
        id: item.id,
        itemType: 'repair',
        itemName: item.damageLog?.damageCode || `Kerusakan #${item.damageLogId}`,
        relatedType: 'damage',
        relatedId: item.damageLogId,
        relatedLabel: item.damageLog ? `${item.damageLog.damageCode} · ${item.damageLog.description}` : `Kerusakan #${item.damageLogId}`,
        equipmentAssetCode: item.damageLog?.equipmentItem?.assetCode || '',
        equipmentItemId: item.damageLog?.equipmentItem?.id || null,
        quantity: 1,
        unit: 'pekerjaan',
        estimatedUnitPrice: money(item.serviceFee),
        serviceFee: money(item.serviceFee),
        approvedServiceFee: money(item.approvedServiceFee),
        notes: item.notes,
        estimatedTotalPrice: money(item.serviceFee) + estimatedSpareparts,
        approvedTotalPrice: money(item.approvedServiceFee) + approvedSpareparts,
        spareparts: (item.spareparts || []).map((sp) => ({
          id: sp.id,
          itemName: sp.itemName,
          quantity: Number(sp.quantity || 0),
          unit: 'unit',
          estimatedUnitPrice: Number(sp.estimatedUnitPrice || 0),
          estimatedTotalPrice: Number(sp.estimatedTotalPrice || 0),
          approvedTotalPrice: Number(sp.approvedTotalPrice || 0),
        })),
      };
    }),
    ...maintenanceItems.map((item) => ({
      id: item.id,
      itemType: 'maintenance',
      itemName: item.maintenanceSetting?.maintenanceAspect?.aspectName || `Maintenance #${item.maintenanceSettingId}`,
      relatedType: 'maintenance',
      relatedId: item.maintenanceSettingId,
      relatedLabel: item.maintenanceSetting
        ? [item.maintenanceSetting.maintenanceAspect?.aspectName, item.maintenanceSetting.equipmentItem?.assetCode].filter(Boolean).join(' · ')
        : `Setting #${item.maintenanceSettingId}`,
      relatedStatus: item.maintenanceSetting?.status || null,
      equipmentAssetCode: item.maintenanceSetting?.equipmentItem?.assetCode || '',
      equipmentItemId: item.maintenanceSetting?.equipmentItem?.id || null,
      quantity: 1,
      unit: 'pelayanan',
      estimatedUnitPrice: money(item.estimatedPrice),
      approvedTotalPrice: money(item.approvedPrice),
      estimatedTotalPrice: money(item.estimatedPrice),
      spareparts: [],
    })),
    ...stockItems.map((item) => ({
      id: item.id,
      itemType: 'stock',
      itemName: item.itemName,
      relatedType: null,
      relatedId: null,
      relatedLabel: null,
      equipmentAssetCode: '',
      equipmentItemId: null,
      quantity: Number(item.quantity || 0),
      unit: 'unit',
      estimatedUnitPrice: Number(item.estimatedUnitPrice || 0),
      estimatedTotalPrice: Number(item.estimatedTotalPrice || 0),
      approvedTotalPrice: Number(item.approvedTotalPrice || 0),
      spareparts: [],
    })),
  ];

  return {
    id: row.id,
    orderCode: row.requestCode,
    date: row.requestDate,
    category: normalizeCategory(row.orderCategory),
    status: normalizeStatus(row.status),
    purpose: items.map((item) => item.itemName).join(', '),
    description: items.map((item) => item.itemName).join(', '),
    items,
    totalPrice: money(row.totalEstimatedAmount),
    totalEstimatedAmount: money(row.totalEstimatedAmount),
    financeApprovedAmount: money(row.totalApprovedAmount),
    totalApprovedAmount: money(row.totalApprovedAmount),
    submittedBy: userName(row.requestedBy) || 'Divisi Alat',
    requestedBy: row.requestedBy || null,
    adminValidatedBy: userName(row.adminValidatedBy),
    adminValidatedAt: row.adminValidatedAt || null,
    financeApprovedBy: userName(row.financeApprovedBy),
    financeApprovedAt: row.financeApprovedAt || null,
    cancelledBy: userName(row.cancelledBy),
    cancelledAt: row.cancelledAt || null,
    createdAt: row.createdAt || null,
    balanceWarning: row.balanceWarning || null,
    balanceProjection: row.balanceProjection || null,
    apiBacked: true,
  };
}

/**
 * Daftar order. Endpoint menerima `search` (kode order) dan `status`;
 * rentang tanggal tidak didukung backend sehingga difilter di sisi klien.
 */
export async function getPurchaseOrders({ search = '', status = '', orderCategory = '', startDate = '', endDate = '', limit = 100 } = {}) {
  const query = new URLSearchParams({ page: '1', limit: String(Math.min(limit, 100)) });
  if (search && search.trim()) query.set('search', search.trim());
  if (status) query.set('status', normalizeStatus(status));
  if (orderCategory) query.set('orderCategory', normalizeCategory(orderCategory));

  const result = await apiRequest(`${API_PREFIX}?${query}`);
  const rows = (result.data || []).map(normalizeRequest);
  return rows
    .filter((row) => (!startDate || row.date >= startDate) && (!endDate || row.date <= endDate))
    .sort((a, b) => (a.date === b.date ? b.id - a.id : (a.date < b.date ? 1 : -1)));
}

export async function getPurchaseOrderDetail(id) {
  const result = await apiRequest(`${API_PREFIX}/${id}`);
  return result ? normalizeRequest(result) : null;
}

/** Bentuk item yang dipakai formulir → payload backend per kategori order. */
export function buildRequestPayload({ date, category, items = [] }) {
  const orderCategory = normalizeCategory(category);
  const requestDate = date;

  if (orderCategory === 'repair') {
    return {
      requestDate,
      orderCategory,
      repairItems: items.map((item) => ({
        damageLogId: Number(item.relatedId),
        serviceFee: Number(item.serviceFee || 0),
        notes: item.notes || null,
        spareparts: (item.spareparts || []).map((sp) => ({
          itemName: sp.itemName,
          quantity: Number(sp.quantity),
          estimatedUnitPrice: Number(sp.estimatedUnitPrice),
        })),
      })),
    };
  }

  if (orderCategory === 'maintenance') {
    return {
      requestDate,
      orderCategory,
      maintenanceItems: items.map((item) => ({
        maintenanceSettingId: Number(item.relatedId),
        estimatedPrice: Number(item.estimatedUnitPrice || 0),
      })),
    };
  }

  return {
    requestDate,
    orderCategory: 'stock',
    stockItems: items.map((item) => ({
      itemName: item.itemName,
      quantity: Number(item.quantity),
      estimatedUnitPrice: Number(item.estimatedUnitPrice),
    })),
  };
}

export async function createPurchaseOrderRequest(payload) {
  const result = await apiRequest(API_PREFIX, { method: 'POST', body: JSON.stringify(buildRequestPayload(payload)) });
  return normalizeRequest(result);
}

export async function updatePurchaseOrderRequest(id, payload) {
  const result = await apiRequest(`${API_PREFIX}/${id}`, { method: 'PUT', body: JSON.stringify(buildRequestPayload(payload)) });
  return normalizeRequest(result);
}

export async function cancelPurchaseOrder(id) {
  const result = await apiRequest(`${API_PREFIX}/${id}/cancel`, { method: 'PUT', body: '{}' });
  return normalizeRequest(result);
}

// --- Helper lintas halaman -------------------------------------------------

/** Aspek maintenance milik `unitId` yang tercantum pada order. */
export function maintenanceAspectsForUnit(order, unitId) {
  return (order?.items || [])
    .filter((item) => item.relatedType === 'maintenance' && String(item.equipmentItemId) === String(unitId))
    .map((item) => ({ settingId: String(item.relatedId), name: item.itemName }));
}

export const maintenanceSettingIdsForUnit = (order, unitId) => maintenanceAspectsForUnit(order, unitId).map((aspect) => aspect.settingId);

/** Damage log yang sudah punya order pengajuan. */
export function ordersForDamageLog(orders, damageLogId) {
  return (orders || []).filter((order) => (order.items || []).some((item) => item.relatedType === 'damage' && String(item.relatedId) === String(damageLogId)));
}

/** Order approved yang bisa dipakai untuk melaksanakan service pada unit ini. */
export async function getApprovedPurchaseOrdersForUnit(equipmentItemId) {
  const orders = await getPurchaseOrders({ status: 'approved' });
  if (!equipmentItemId) return orders;
  return orders.filter((order) => order.items.some((item) => item.equipmentItemId && String(item.equipmentItemId) === String(equipmentItemId)));
}
