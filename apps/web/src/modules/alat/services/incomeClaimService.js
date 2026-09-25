const STORAGE_KEY = 'income_claims';
const SEQ_KEY = 'income_claim_seq';

function readAll() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function writeAll(rows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function nextId() {
  const next = Number(localStorage.getItem(SEQ_KEY) || '0') + 1;
  localStorage.setItem(SEQ_KEY, String(next));
  return next;
}

export function getIncomeClaims({ status = 'all' } = {}) {
  const rows = status && status !== 'all'
    ? readAll().filter((row) => row.status === status)
    : readAll();
  return [...rows].sort((a, b) => b.id - a.id);
}

export function createIncomeClaim(payload) {
  const rows = readAll();
  const id = nextId();
  const claim = {
    id,
    claimCode: `CLM-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`,
    status: 'pending',
    claimDate: payload.date,
    project: payload.project,
    subProject: payload.subProject,
    clientName: payload.clientName,
    equipment: payload.equipment || [],
    materials: payload.materials || [],
    totalAmount: Number(payload.totalAmount) || 0,
    notes: payload.notes || '',
  };
  writeAll([...rows, claim]);
  return claim;
}

export const INCOME_CLAIM_STORAGE_KEY = STORAGE_KEY;
export const INCOME_CLAIM_SEQUENCE_KEY = SEQ_KEY;
