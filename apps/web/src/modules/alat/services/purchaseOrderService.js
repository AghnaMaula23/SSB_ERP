import { apiRequest } from '../../../services/api.js';

/**
 * Purchase Order — localStorage-backed demo service.
 * The purchase-request API is documented but not mounted yet, so these records
 * are intentionally kept separate from database-backed equipment data. Divisi
 * Alat may submit/edit pending requests only; approval and rejection belong to
 * another module.
 */

const STORAGE_KEY = 'po_data';
const SEQ_KEY = 'po_seq';

const SEED_DATA = [
  { id: 1, orderCode: 'PO-2023-0892', date: '2023-10-10', category: 'perbaikan_alat', unitAlat: 'Bulldozer-02', description: 'Ban Bulldozer', quantity: 3, unitPrice: 600000, totalPrice: 1800000, status: 'pending', notes: '' },
  { id: 2, orderCode: 'PO-2023-0893', date: '2023-10-11', category: 'servis_rutin', unitAlat: 'HINO DT-01', description: 'Ganti Oli Gardan', quantity: 1, unitPrice: 500000, totalPrice: 500000, status: 'approved', notes: '' },
  { id: 3, orderCode: 'PO-2023-0894', date: '2023-10-14', category: 'perbaikan_alat', unitAlat: 'Bulldozer-03', description: 'Knalpot bulldozer', quantity: 10, unitPrice: 150000, totalPrice: 1500000, status: 'approved', notes: '' },
  { id: 4, orderCode: 'PO-2023-0895', date: '2023-10-15', category: 'servis_rutin', unitAlat: 'Excavator-PC200', description: 'Ganti Filter Oli & Inspeksi', quantity: 1, unitPrice: 850000, totalPrice: 850000, status: 'rejected', notes: 'Budget exceeded' },
];

function todayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

// Kategori lama (sebelum kategori dipilih per PO) dipetakan ke kategori baru.
const LEGACY_CATEGORY_MAP = { suku_cadang: 'perbaikan_alat', service_rutin: 'servis_rutin' };

export function normalizeCategory(category) {
  return LEGACY_CATEGORY_MAP[category] || category;
}

function itemTypeFromCategory(category) {
  return normalizeCategory(category) === 'servis_rutin' ? 'service' : 'sparepart';
}

function categoryFromItemType(itemType) {
  return itemType === 'service' ? 'servis_rutin' : 'perbaikan_alat';
}

function normalizeLocalOrder(row) {
  const items = row.items?.length ? row.items : [{
    id: row.id,
    itemType: itemTypeFromCategory(row.category),
    itemName: row.description || '',
    quantity: row.quantity || 0,
    unit: 'unit',
    estimatedUnitPrice: row.unitPrice || 0,
    relatedType: null,
    relatedId: null,
    relatedLabel: null,
    equipmentAssetCode: row.unitAlat || '',
  }];
  return {
    ...row,
    category: normalizeCategory(row.category),
    maintenanceSettingIds: (row.maintenanceSettingIds || []).map(String),
    maintenanceAspects: row.maintenanceAspects || [],
    purpose: row.purpose || row.description || '',
    description: row.description || row.purpose || '',
    items,
    totalPrice: Number(row.totalPrice) || items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.estimatedUnitPrice) || 0), 0),
    financeApprovedAmount: row.financeApprovedAmount ?? row.totalPrice ?? 0,
    apiBacked: row.apiBacked === true,
  };
}

function normalizeApiOrder(data) {
  const items = Array.isArray(data.items) ? data.items.map((item) => ({
    ...item,
    relatedType: item.relatedType || (item.damageLogId ? 'damage' : item.maintenanceSettingId ? 'maintenance' : null),
    relatedId: item.relatedId ?? item.damageLogId ?? item.maintenanceSettingId ?? null,
  })) : [];
  const first = items[0] || {};
  return normalizeLocalOrder({
    ...data,
    id: data.id,
    orderCode: data.requestCode || data.request_code || data.orderCode,
    date: data.requestDate || data.date,
    purpose: data.purpose || first.itemName || data.description,
    description: data.description || first.itemName || data.purpose,
    category: data.category || categoryFromItemType(first.itemType),
    unitAlat: data.unitAlat || first.equipmentAssetCode,
    quantity: first.quantity ?? data.quantity,
    unitPrice: first.estimatedUnitPrice ?? data.unitPrice,
    totalPrice: data.totalAmount ?? items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.estimatedUnitPrice) || 0), 0),
    status: data.status || 'pending',
    apiBacked: true,
    items,
  });
}

function readAll() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
    localStorage.setItem(SEQ_KEY, String(SEED_DATA.length));
    return SEED_DATA;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_DATA;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
    return SEED_DATA;
  }
}

function writeAll(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function persistApiOrder(order) {
  const rows = readAll().filter((row) => String(row.id) !== String(order.id));
  writeAll([...rows, { ...order, apiBacked: true }]);
}
function nextId() {
  const next = Number(localStorage.getItem(SEQ_KEY) || '0') + 1;
  localStorage.setItem(SEQ_KEY, String(next));
  return next;
}

export function getPurchaseOrders({ search = '', status = '', startDate = '', endDate = '' } = {}) {
  let rows = readAll().map(normalizeLocalOrder);
  if (search) {
    const query = search.toLowerCase();
    rows = rows.filter((row) => [row.orderCode, row.unitAlat, row.description, row.purpose].some((value) => String(value || '').toLowerCase().includes(query)));
  }
  if (status && status !== 'all') rows = rows.filter((row) => row.status === status);
  if (startDate) rows = rows.filter((row) => row.date >= startDate);
  if (endDate) rows = rows.filter((row) => row.date <= endDate);
  return rows.sort((a, b) => b.id - a.id);
}

export function getPurchaseOrderById(id) {
  const row = readAll().find((item) => item.id === Number(id));
  return row ? normalizeLocalOrder(row) : null;
}

export async function getPurchaseOrderDetail(id) {
  const localOrder = getPurchaseOrderById(id);
  if (localOrder && !localOrder.apiBacked) return localOrder;
  try {
    const result = await apiRequest(`/api/equipment/purchase-requests/${id}`);
    if (!result) return localOrder;
    return normalizeApiOrder(result);
  } catch (error) {
    if (error?.status === 401) throw error;
    return localOrder;
  }
}

export async function createPurchaseOrderRequest(data) {
  const payload = {
    requestDate: data.date,
    category: data.category,
    purpose: data.purpose,
    description: data.description || data.purpose,
    ...(data.equipmentItemId ? { equipmentItemId: Number(data.equipmentItemId) } : {}),
    ...(data.category === 'servis_rutin' ? { maintenanceSettingIds: (data.maintenanceSettingIds || []).filter((id) => !String(id).startsWith('demo-')).map(Number) } : {}),
    items: (data.items || []).map((item) => {
      const isDemoReference = String(item.relatedId || '').startsWith('demo-');
      return {
        itemType: item.itemType,
        itemName: item.itemName,
        quantity: item.quantity,
        unit: item.unit,
        estimatedUnitPrice: item.estimatedUnitPrice,
        ...(!isDemoReference && item.relatedId && item.relatedType === 'damage' ? { damageLogId: item.relatedId } : {}),
        ...(!isDemoReference && item.relatedId && item.relatedType === 'maintenance' ? { maintenanceSettingId: item.relatedId } : {}),
        ...(!isDemoReference ? {} : { relatedType: item.relatedType, relatedLabel: item.relatedLabel }),
        ...(item.equipmentItemId && !String(item.equipmentItemId).startsWith('demo-') ? { equipmentItemId: Number(item.equipmentItemId) } : {}),
        ...(item.maintenanceSettingIds?.length ? { maintenanceSettingIds: item.maintenanceSettingIds.filter((settingId) => !String(settingId).startsWith('demo-')).map(Number) } : {}),
      };
    }),
  };
  try {
    const result = await apiRequest('/api/equipment/purchase-requests', { method: 'POST', body: JSON.stringify(payload) });
    if (!result) return createPurchaseOrder(data);
    const normalized = normalizeApiOrder({ ...orderReferenceFields(data), ...result });
    persistApiOrder(normalized);
    return normalized;
  } catch (error) {
    if (error?.status === 401) throw error;
    if (![404, 405, 501].includes(error?.status) && error?.status !== 0) throw error;
    return createPurchaseOrder(data);
  }
}

function orderReferenceFields(data) {
  return {
    category: data.category,
    equipmentItemId: data.equipmentItemId ? Number(data.equipmentItemId) || data.equipmentItemId : null,
    equipmentAssetCode: data.equipmentAssetCode || '',
    damageLogId: data.damageLogId || null,
    maintenanceSettingIds: (data.maintenanceSettingIds || []).map(String),
    maintenanceAspects: data.maintenanceAspects || [],
  };
}

export function createPurchaseOrder(data) {
  const rows = readAll();
  const id = nextId();
  const items = (data.items?.length ? data.items : [{ itemType: data.itemType || 'sparepart', itemName: data.description || data.purpose || '', quantity: data.quantity, unit: data.unit || 'unit', estimatedUnitPrice: data.unitPrice }]).map((item, index) => ({
    id: `${id}-${index + 1}`,
    itemType: item.itemType || 'sparepart',
    itemName: item.itemName || '',
    quantity: Number(item.quantity) || 0,
    unit: item.unit || 'unit',
    estimatedUnitPrice: Number(item.estimatedUnitPrice) || 0,
    relatedType: item.relatedType || null,
    relatedId: item.relatedId ? Number(item.relatedId) || item.relatedId : null,
    relatedLabel: item.relatedLabel || null,
    equipmentAssetCode: item.equipmentAssetCode || data.unitAlat || '',
    equipmentItemId: item.equipmentItemId ? Number(item.equipmentItemId) || item.equipmentItemId : null,
    maintenanceSettingIds: (item.maintenanceSettingIds || []).map(String),
    maintenanceAspects: item.maintenanceAspects || [],
  }));
  const first = items[0];
  const totalPrice = items.reduce((sum, item) => sum + item.quantity * item.estimatedUnitPrice, 0);
  const newItem = normalizeLocalOrder({
    id,
    orderCode: `PO-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`,
    date: data.date || todayDate(),
    ...orderReferenceFields(data),
    category: data.category || categoryFromItemType(first.itemType),
    unitAlat: first.equipmentAssetCode || data.unitAlat || '',
    purpose: data.purpose || first.itemName,
    description: data.description || first.itemName,
    quantity: first.quantity,
    unitPrice: first.estimatedUnitPrice,
    items,
    totalPrice,
    status: 'pending',
    notes: data.notes || '',
    submittedBy: 'Divisi Alat',
    apiBacked: false,
  });
  writeAll([...rows, newItem]);
  return newItem;
}

export async function updatePurchaseOrderRequest(id, data) {
  const payload = {
    purpose: data.purpose,
    description: data.description,
    items: (data.items || []).map((item) => ({
      itemType: item.itemType,
      itemName: item.itemName,
      quantity: item.quantity,
      unit: item.unit,
      estimatedUnitPrice: item.estimatedUnitPrice,
      ...(item.relatedId && item.relatedType === 'damage' ? { damageLogId: item.relatedId } : {}),
      ...(item.relatedId && item.relatedType === 'maintenance' ? { maintenanceSettingId: item.relatedId } : {}),
    })),
  };
  try {
    const result = await apiRequest(`/api/equipment/purchase-requests/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!result) return updatePurchaseOrder(id, data);
    const normalized = normalizeApiOrder(result);
    persistApiOrder(normalized);
    return normalized;
  } catch (error) {
    if (error?.status === 401) throw error;
    if (![404, 405, 501].includes(error?.status) && error?.status !== 0) throw error;
    return updatePurchaseOrder(id, data);
  }
}

export function updatePurchaseOrder(id, data) {
  if (Object.prototype.hasOwnProperty.call(data, 'status')) throw new Error('Status purchase request tidak dapat diubah dari Divisi Alat.');
  const rows = readAll();
  const index = rows.findIndex((row) => row.id === Number(id));
  if (index === -1) throw new Error('Purchase order tidak ditemukan');
  if (rows[index].status !== 'pending') throw new Error('Purchase order yang sudah diproses tidak dapat diubah dari Divisi Alat.');
  const updated = { ...rows[index], ...data };
  if (data.items?.length) updated.totalPrice = data.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.estimatedUnitPrice) || 0), 0);
  else {
    const currentItems = updated.items?.length ? updated.items : [{ itemType: itemTypeFromCategory(updated.category), itemName: updated.description || '', quantity: updated.quantity || 0, unit: 'unit', estimatedUnitPrice: updated.unitPrice || 0, equipmentAssetCode: updated.unitAlat || '' }];
    updated.items = currentItems.map((item, index) => index === 0 ? { ...item, itemName: updated.description, quantity: Number(updated.quantity) || 0, estimatedUnitPrice: Number(updated.unitPrice) || 0, equipmentAssetCode: updated.unitAlat || item.equipmentAssetCode || '' } : item);
    updated.totalPrice = updated.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.estimatedUnitPrice) || 0), 0);
  }
  rows[index] = updated;
  writeAll(rows);
  return normalizeLocalOrder(updated);
}

export function deletePurchaseOrder(id) {
  const rows = readAll();
  const target = rows.find((row) => row.id === Number(id));
  if (!target) throw new Error('Purchase order tidak ditemukan');
  if (target.status !== 'pending') throw new Error('Purchase order yang sudah diproses tidak dapat dihapus dari Divisi Alat.');
  writeAll(rows.filter((row) => row.id !== Number(id)));
}

/**
 * Aspek maintenance servis rutin yang dicakup PO untuk satu unit.
 * Unit & aspek disimpan per item; PO lama menyimpannya di level order.
 */
export function maintenanceAspectsForUnit(order, unitId) {
  const fromItems = (order.items || [])
    .filter((item) => String(item.equipmentItemId) === String(unitId))
    .flatMap((item) => item.maintenanceAspects?.length ? item.maintenanceAspects : (item.maintenanceSettingIds || []).map((settingId) => ({ settingId: String(settingId), name: String(settingId) })));
  const legacy = String(order.equipmentItemId) === String(unitId) ? order.maintenanceAspects || [] : [];
  const bySetting = new Map([...legacy, ...fromItems].map((aspect) => [String(aspect.settingId), aspect]));
  return [...bySetting.values()];
}

export const maintenanceSettingIdsForUnit = (order, unitId) => maintenanceAspectsForUnit(order, unitId).map((aspect) => String(aspect.settingId));

/** PO perbaikan alat yang memuat item terhubung ke damage log tertentu. */
export const ordersForDamageLog = (orders, damageLogId) => orders.filter((order) => order.category === 'perbaikan_alat'
  && (order.items || []).some((item) => item.relatedType === 'damage' && String(item.relatedId) === String(damageLogId)));

export const ITEM_TYPE_OPTIONS = [
  { value: 'sparepart', label: 'Sparepart' },
  { value: 'service', label: 'Service' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'other', label: 'Other' },
];
export const CATEGORY_OPTIONS = [
  { value: 'perbaikan_alat', label: 'Perbaikan Alat' },
  { value: 'servis_rutin', label: 'Servis Rutin' },
  { value: 'stok_gudang', label: 'Stok Gudang' },
];
export const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];
export const categoryLabel = (value) => {
  if (value === 'sparepart') return 'Suku Cadang';
  if (value === 'service') return 'Service Rutin';
  if (value === 'consumable') return 'Consumable';
  const category = normalizeCategory(value);
  return CATEGORY_OPTIONS.find((option) => option.value === category)?.label || value;
};
export const statusLabel = (value) => STATUS_OPTIONS.find((option) => option.value === value)?.label || value;
