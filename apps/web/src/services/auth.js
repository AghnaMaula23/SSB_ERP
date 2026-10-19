import { apiRequest } from './api.js';

export function saveSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user || {}));
}

export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  // Sisa store lokal yang masih dipakai karena endpoint-nya belum ada:
  // - income_claims : modul income belum di-mount, klaim pendapatan masih lokal
  // - maintenance_* : threshold per tipe & reset reference belum punya endpoint
  // - admin_mock_*  : inventory, pekerja, supply, rental, income, kas lapangan & files Admin, backend belum ada
  localStorage.removeItem('po_data');
  localStorage.removeItem('po_seq');
  localStorage.removeItem('kas_data');
  localStorage.removeItem('kas_seq');
  localStorage.removeItem('maintenance_reset_purchase_refs');
  localStorage.removeItem('income_claims');
  localStorage.removeItem('income_claim_seq');
  localStorage.removeItem('maintenance_type_thresholds');
  localStorage.removeItem('maintenance_custom_aspects');
  localStorage.removeItem('admin_mock_inventory');
  localStorage.removeItem('admin_mock_workers');
  localStorage.removeItem('admin_mock_workers_v2');
  localStorage.removeItem('admin_mock_supply_deliveries');
  localStorage.removeItem('admin_mock_supply_deliveries_v2');
  localStorage.removeItem('admin_mock_supply_deliveries_v3');
  localStorage.removeItem('admin_mock_supply_projects');
  localStorage.removeItem('admin_mock_rental');
  localStorage.removeItem('admin_mock_income_records');
  localStorage.removeItem('admin_mock_field_cash');
  localStorage.removeItem('admin_mock_files');
  // Isi berkas modul Files Admin disimpan di IndexedDB (lihat fileStore.js).
  if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('constructerp-files');
}

export async function login(credentials) {
  const payload = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

  if (!payload?.token || !payload?.user) {
    throw new Error('Respons login dari server tidak valid.');
  }

  saveSession(payload.token, payload.user);
  try {
    const currentUser = await getCurrentUser();
    return { ...payload, user: currentUser };
  } catch (error) {
    if (error?.status === 401) {
      clearSession();
      throw error;
    }
    return payload;
  }
}

export async function getHealth() {
  return apiRequest('/api/health');
}

export async function getCurrentUser() {
  const user = await apiRequest('/api/auth/me');
  if (!user?.id) throw new Error('Respons sesi dari server tidak valid.');
  localStorage.setItem('user', JSON.stringify(user));
  return user;
}
