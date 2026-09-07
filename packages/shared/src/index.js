// Shared constants and enums across BE and FE
// Import in modules: const { ROLES } = require('@constructerp/shared');

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  FINANCE: 'finance',
  DIVISI_ALAT: 'divisi_alat',
  LAPANGAN: 'lapangan',
};

const MODULES = {
  AUTH: 'auth',
  PROJECT: 'project',
  REQUEST_ALAT: 'request_alat',
  REQUEST_MATERIAL: 'request_material',
  APPROVAL: 'approval',
  DIVISI_ALAT: 'divisi_alat',
  INCOME: 'income',
  FINANCE_FIELD: 'finance_field',
  FINANCE_ACCOUNTING: 'finance_accounting',
  PAYROLL: 'payroll',
};

module.exports = { ROLES, MODULES };
