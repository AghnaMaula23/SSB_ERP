import { useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, Notice, PageHeader, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { FilterChips, Pager } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatDate } from '../../admin/project/utils/projectFormat.js';
import { hasPermission } from '../../../services/permissions.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { listRoles, listUsers } from '../services/accountService.js';

const ACTIVE_STATUS = {
  true: { label: 'Aktif', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  false: { label: 'Nonaktif', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function AccountListPage({ initialNotice }) {
  const [search, setSearch] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [isActive, setIsActive] = useState('');
  const [page, setPage] = useState(1);
  const { data: roles } = useRecord(listRoles, 'roles');
  const { data, error } = useRecord(() => listUsers({ search: search.trim(), roleCode, isActive, page }), `${search}|${roleCode}|${isActive}|${page}`);
  const reset = (setter) => (value) => { setter(value); setPage(1); };

  return (
    <>
      <Breadcrumb items={[{ label: 'Manajemen Akun' }, { label: 'Akun User' }]} />
      <PageHeader
        title="Akun User"
        subtitle="Buat akun, atur role, dan nonaktifkan akun yang tidak dipakai lagi. Akun tidak dihapus supaya jejak dokumennya tetap utuh."
        actions={hasPermission('user:create') ? <a href="#/akun/new" className="btn btn-primary text-xs">+ Buat Akun</a> : null}
      />
      <Notice tone="success">{initialNotice}</Notice>

      <section className="card-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <input value={search} onChange={(event) => reset(setSearch)(event.target.value)} className="input-control h-9 text-xs lg:w-72" placeholder="Cari username, nama, atau email..." aria-label="Cari akun" />
          <div className="flex flex-wrap gap-2">
            <select value={roleCode} onChange={(event) => reset(setRoleCode)(event.target.value)} className="input-control h-9 text-xs sm:w-44" aria-label="Filter role">
              <option value="">Semua role</option>
              {(roles || []).map((role) => <option key={role.id} value={role.code}>{role.name}</option>)}
            </select>
            <FilterChips options={[{ value: '', label: 'Semua' }, { value: 'true', label: 'Aktif' }, { value: 'false', label: 'Nonaktif' }]} value={isActive} onChange={reset(setIsActive)} />
          </div>
        </div>
        <ResponsiveTable
          columns={[
            {
              key: 'user',
              label: 'Akun',
              primary: true,
              render: (row) => (
                <a href={`#/akun/${row.id}`} className="block hover:underline">
                  <span className="block font-semibold text-slate-900">{row.fullName}</span>
                  <span className="block font-mono text-[11px] text-slate-500">{row.username}</span>
                </a>
              ),
            },
            { key: 'email', label: 'Email', render: (row) => <span className="text-xs">{row.email}</span> },
            {
              key: 'roles',
              label: 'Role',
              render: (row) => (row.roles.length
                ? <span className="flex flex-wrap gap-1">{row.roles.map((role) => <span key={role.id} className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700">{role.code}</span>)}</span>
                : <span className="text-xs font-semibold text-amber-700">Belum ada role</span>),
            },
            { key: 'created', label: 'Dibuat', render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.createdAt)}</span> },
            { key: 'status', label: 'Status', align: 'center', render: (row) => <StatusBadge status={String(row.isActive)} map={ACTIVE_STATUS} /> },
            { key: 'action', label: 'Aksi', align: 'right', render: (row) => <a href={`#/akun/${row.id}`} className="btn btn-ghost px-2 py-1 text-[11px]">✎ Kelola</a> },
          ]}
          rows={data?.data || []}
          rowKey={(row) => row.id}
          loading={!data && !error}
          error={error}
          empty="Tidak ada akun yang cocok."
        />
        {data?.total > 0 && <Pager page={page} totalPages={Math.max(1, data.totalPages || 1)} total={data.total} shown={data.data.length} onChange={setPage} label="akun" />}
      </section>
    </>
  );
}
