import { useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { Breadcrumb, GuardedLink, Notice, PageHeader, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { FilterChips, Pager } from '../../approvals/components/ApprovalUi.jsx';
import { formatDate } from '../../project/utils/projectFormat.js';
import { useRecord } from '../../../lapangan/hooks/useFieldData.js';
import { hasPermission } from '../../../../services/permissions.js';
import { listEmployees } from '../../../finance/services/financeService.js';
import { DEPARTMENTS } from '../utils/employeeRoute.js';

const PAGE_SIZE = 15;
const ACTIVE = {
  true: { label: 'Aktif', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  false: { label: 'Keluar', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/** Master karyawan tetap. Nominal gaji tidak di sini — dikelola Finance (F29). */
export default function EmployeeListPage({ initialNotice }) {
  const [active, setActive] = useState('true');
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(initialNotice || '');
  const params = { page, limit: PAGE_SIZE, active, department, search: search.trim() };
  const { data: result, error } = useRecord(() => listEmployees(params), JSON.stringify(params));

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Admin' }, { label: 'Master Karyawan' }]} />
      <PageHeader
        title="Master Karyawan"
        subtitle="Karyawan tetap yang digaji bulanan. Pekerja harian proyek dikelola di menu Pekerja. Gaji pokok ditetapkan Finance."
        actions={<GuardedLink href="#/admin/employees/new" allowed={hasPermission('employee:create')} reason="Butuh izin employee:create">+ Tambah Karyawan</GuardedLink>}
      />
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      <section className="card-panel mb-4 grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-center" aria-label="Filter karyawan">
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="input-control text-xs" placeholder="Cari nama, kode EMP-, atau jabatan..." aria-label="Cari" />
        <select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} className="input-control text-xs" aria-label="Bagian">
          <option value="">Semua bagian</option>
          {Object.entries(DEPARTMENTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <FilterChips options={[{ value: 'true', label: 'Aktif' }, { value: 'false', label: 'Keluar' }, { value: '', label: 'Semua' }]} value={active} onChange={(value) => { setActive(value); setPage(1); }} />
      </section>
      <div className="table-container">
        <ResponsiveTable
          columns={[
            { key: 'name', label: 'Karyawan', primary: true, render: (row) => <a href={`#/admin/employees/${row.id}`} className="font-semibold text-brand-700 hover:underline">{row.fullName}</a>, sub: (row) => row.employeeCode },
            { key: 'dept', label: 'Bagian / Jabatan', render: (row) => <span className="text-xs">{DEPARTMENTS[row.department] || row.department}{row.positionName ? ` · ${row.positionName}` : ''}</span> },
            { key: 'join', label: 'Masuk', render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.joinDate)}{row.endDate ? ` – ${formatDate(row.endDate)}` : ''}</span> },
            { key: 'user', label: 'Akun', render: (row) => <span className="font-mono text-xs">{row.user?.username || '-'}</span> },
            { key: 'status', label: 'Status', align: 'center', render: (row) => <StatusBadge status={String(row.isActive)} map={ACTIVE} /> },
          ]}
          rows={result?.data || []}
          rowKey={(row) => row.id}
          loading={!result && !error}
          loadingText="Memuat karyawan..."
          empty="Belum ada karyawan yang cocok."
        />
        {result?.total > 0 && <Pager page={page} totalPages={result.totalPages || 1} total={result.total} shown={result.data.length} onChange={setPage} label="karyawan" />}
      </div>
    </>
  );
}
