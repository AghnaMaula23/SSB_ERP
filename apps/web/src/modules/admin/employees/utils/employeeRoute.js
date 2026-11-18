/** Rute Master Karyawan (Admin): admin/employees, admin/employees/new, admin/employees/:id. */
export function parseEmployeeRoute(route) {
  const parts = String(route).split('/');
  if (parts[0] !== 'admin' || parts[1] !== 'employees') return null;
  if (parts.length === 2) return { view: 'list', employeeId: null };
  if (parts.length === 3 && parts[2] === 'new') return { view: 'form', employeeId: null };
  if (parts.length === 3 && /^\d+$/.test(parts[2])) return { view: 'form', employeeId: Number(parts[2]) };
  return null;
}

export const DEPARTMENTS = { kantor: 'Kantor', finance: 'Finance', divisi_alat: 'Divisi Alat', lapangan: 'Lapangan' };
