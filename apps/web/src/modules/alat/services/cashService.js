import { apiRequest } from '../../../services/api.js';

const API_PREFIX = '/api/equipment/cash';

/** Sumber yang boleh diketik manusia. `equipment_purchase_request` dan
 *  `equipment_income_claim` dibuat sistem dari dokumennya (backend menolak
 *  kalau dikirim manual). */
export const MANUAL_SOURCE_TYPES = [
  { value: 'opening_balance', label: 'Saldo Awal / Injeksi Dana' },
  { value: 'manual_expense', label: 'Transaksi Manual' },
  { value: 'adjustment', label: 'Koreksi' },
];

export const SOURCE_TYPE_LABELS = {
  opening_balance: 'Saldo Awal',
  equipment_income_claim: 'Klaim Pendapatan',
  equipment_purchase_request: 'Purchase Request',
  manual_expense: 'Transaksi Manual',
  adjustment: 'Koreksi',
};

export const TRANSACTION_TYPES = [
  { value: 'cash_in', label: 'Kas Masuk' },
  { value: 'cash_out', label: 'Kas Keluar' },
];

export function sourceLabel(sourceType) {
  return SOURCE_TYPE_LABELS[sourceType] || sourceType || '-';
}

export function categoryLabel(category) {
  if (!category) return '-';
  return category.categoryName || category.label || '-';
}

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

function normalizeTransaction(row) {
  return {
    id: row.id,
    transactionCode: row.transactionCode,
    date: row.transactionDate,
    type: row.transactionType === 'cash_in' ? 'masuk' : 'keluar',
    transactionType: row.transactionType,
    categoryId: row.category?.id ?? null,
    category: row.category?.categoryName || '-',
    orderCategory: row.category?.orderCategory || null,
    description: row.description,
    nominal: toNumber(row.amount) ?? 0,
    source: row.sourceType,
    sourceId: row.sourceId,
    sourceLabel: sourceLabel(row.sourceType),
    unitAlat: row.category?.orderCategory ? ORDER_CATEGORY_LABELS[row.category.orderCategory] || '-' : '-',
    isSystemGenerated: row.isSystemGenerated === true,
    isVoided: row.isVoided === true,
    voidReason: row.voidReason || '',
    voidedBy: row.voidedBy?.fullName || row.voidedBy?.username || null,
    createdBy: row.createdBy?.fullName || row.createdBy?.username || null,
    createdAt: row.createdAt,
  };
}

const ORDER_CATEGORY_LABELS = {
  repair: 'Perbaikan Alat',
  maintenance: 'Perawatan Berkala',
  stock: 'Stok Gudang',
};

function normalizeCategory(row) {
  return {
    id: row.id,
    name: row.categoryName,
    label: row.categoryName,
    transactionType: row.transactionType,
    orderCategory: row.orderCategory,
    description: row.description || '',
    isActive: row.isActive,
    transactionCount: row.transactionCount ?? null,
  };
}

export async function getCashBalance() {
  const result = await apiRequest(`${API_PREFIX}/balance`);
  return {
    totalIn: Number(result?.totalIn || 0),
    totalOut: Number(result?.totalOut || 0),
    balance: Number(result?.balance || 0),
  };
}

export async function getCashSummary({ dateFrom, dateTo } = {}) {
  const query = new URLSearchParams();
  if (dateFrom) query.set('dateFrom', dateFrom);
  if (dateTo) query.set('dateTo', dateTo);
  const result = await apiRequest(`${API_PREFIX}/summary${query.toString() ? `?${query}` : ''}`);
  return {
    balance: Number(result?.balance || 0),
    totalIn: Number(result?.totalIn || 0),
    totalOut: Number(result?.totalOut || 0),
    period: result?.period || { totalIn: 0, totalOut: 0, net: 0 },
    byCategory: (result?.byCategory || []).map((row) => ({
      categoryId: row.categoryId,
      name: row.categoryName,
      transactionType: row.transactionType,
      total: Number(row.total || 0),
      transactionCount: Number(row.transactionCount || 0),
    })),
  };
}

export async function getCashCategories({ transactionType, orderCategory, isActive } = {}) {
  const query = new URLSearchParams();
  if (transactionType) query.set('transactionType', transactionType);
  if (orderCategory) query.set('orderCategory', orderCategory);
  if (isActive !== undefined) query.set('isActive', String(isActive));  const result = await apiRequest(`${API_PREFIX}/categories${query.toString() ? `?${query}` : ''}`);
  const rows = Array.isArray(result) ? result : result?.data || [];
  return rows.map(normalizeCategory);
}

export async function getCashTransactions({ page = 1, limit = 50, transactionType, categoryId, sourceType, dateFrom, dateTo, search, includeVoided } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(Math.min(limit, 100)) });
  // Parameter kosong TIDAK ikut dikirim: validator backend menolak nilai kosong
  // untuk enum (mis. transactionType="") dengan 400.
  if (transactionType && transactionType !== 'all') query.set('transactionType', transactionType);
  if (categoryId && categoryId !== 'all') query.set('categoryId', String(categoryId));
  if (sourceType) query.set('sourceType', sourceType);
  if (dateFrom) query.set('dateFrom', dateFrom);
  if (dateTo) query.set('dateTo', dateTo);
  if (search && search.trim()) query.set('search', search.trim());
  if (includeVoided) query.set('includeVoided', 'true');
  const result = await apiRequest(`${API_PREFIX}/transactions?${query}`);
  return {
    data: (result.data || []).map(normalizeTransaction),
    total: result.total || 0,
    page: result.page || page,
    limit: result.limit || limit,
  };
}

export async function getCashTransactionDetail(id) {
  const result = await apiRequest(`${API_PREFIX}/transactions/${id}`);
  return result ? normalizeTransaction(result) : null;
}

export async function createCashTransaction(payload) {
  const result = await apiRequest(`${API_PREFIX}/transactions`, {
    method: 'POST',
    body: JSON.stringify({
      transactionDate: payload.date,
      transactionType: payload.transactionType,
      categoryId: Number(payload.categoryId),
      amount: Number(payload.nominal),
      sourceType: payload.sourceType,
      description: payload.description,
    }),
  });
  return normalizeTransaction(result);
}

export async function voidCashTransaction(id, voidReason) {
  const result = await apiRequest(`${API_PREFIX}/transactions/${id}/void`, {
    method: 'PUT',
    body: JSON.stringify({ voidReason }),
  });
  return normalizeTransaction(result);
}
