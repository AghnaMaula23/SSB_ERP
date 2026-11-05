import { useEffect, useMemo, useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { MockBanner, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { formatCurrency, formatDate, formatDateTime } from '../../project/utils/projectFormat.js';
import { DecisionButtons, FilterChips, Pager, StatTile } from '../components/ApprovalUi.jsx';
import { KAS_CATEGORIES, decideFieldCash, listFieldCash } from '../services/fieldCashMockService.js';
import { KAS_STATUS } from '../utils/approvalFormat.js';

const PAGE_SIZE = 8;

/** Antrean klaim kas lapangan — DATA CONTOH sampai backend Finance Field ada. */
export default function FieldCashQueue({ initialNotice }) {
  const [rows, setRows] = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);
  const [status, setStatus] = useState('submitted');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState({ id: null, notes: '', error: '' });
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });

  useEffect(() => {
    let cancelled = false;
    listFieldCash().then((data) => { if (!cancelled) { setRows(data); setLoadedAt(new Date().toISOString()); } });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const all = useMemo(() => rows || [], [rows]);
  const pending = all.filter((row) => row.status === 'submitted');
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return all.filter((row) => (!status || row.status === status)
      && (!category || row.category === category)
      && (!query || [row.requestCode, row.projectName, row.description, row.requestedBy?.fullName].some((value) => String(value || '').toLowerCase().includes(query))));
  }, [all, category, search, status]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const approve = async (row) => {
    if (!window.confirm(`Setujui klaim ${row.requestCode} senilai ${formatCurrency(row.amount)}?`)) return;
    try {
      await decideFieldCash(row.id, 'approved');
      setNotice({ tone: 'success', text: `${row.requestCode} disetujui.` });
      setReloadKey((key) => key + 1);
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    }
  };

  const submitReject = async (row) => {
    if (!rejecting.notes.trim()) {
      setRejecting((value) => ({ ...value, error: 'Alasan penolakan wajib diisi.' }));
      return;
    }
    try {
      await decideFieldCash(row.id, 'rejected', rejecting.notes);
      setRejecting({ id: null, notes: '', error: '' });
      setNotice({ tone: 'success', text: `${row.requestCode} ditolak. Alasan tersimpan untuk lapangan.` });
      setReloadKey((key) => key + 1);
    } catch (error) {
      setRejecting((value) => ({ ...value, error: error.message }));
    }
  };

  const count = (value) => all.filter((row) => row.status === value).length;

  return (
    <>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatTile label="Total Antrean Klaim" value={rows ? pending.length : '…'} hint="Membutuhkan review segera" icon="🧾" tone="amber" />
        <StatTile label="Total Nilai Klaim Lapangan" value={rows ? formatCurrency(pending.reduce((sum, row) => sum + row.amount, 0)) : '…'} hint="Akumulasi klaim menunggu verifikasi" icon="💵" />
        <StatTile label="Update Terakhir" value={loadedAt ? formatDateTime(loadedAt) : '…'} hint="Data contoh di browser ini" icon="🕘" />
      </div>

      <MockBanner>Backend Finance Field (klaim kas lapangan) belum tersedia — antrean ini data contoh dan keputusan hanya tersimpan di browser ini.</MockBanner>
      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>

      <section className="card-panel overflow-hidden" aria-label="Antrean klaim kas lapangan">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-leaf-50/60 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Data Antrean Klaim Kas</h2>
          <div className="flex flex-wrap gap-2">
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="input-control h-9 w-52 text-xs" placeholder="Cari kode, proyek, pemohon..." aria-label="Cari klaim" />
            <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className="input-control h-9 w-40 text-xs" aria-label="Filter kategori">
              <option value="">Semua kategori</option>
              {KAS_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </div>
        <div className="border-b border-slate-200 px-5 py-3">
          <FilterChips
            value={status}
            onChange={(value) => { setStatus(value); setPage(1); }}
            options={[
              { value: 'submitted', label: 'Menunggu', count: count('submitted') },
              { value: 'approved', label: 'Disetujui', count: count('approved') },
              { value: 'rejected', label: 'Ditolak', count: count('rejected') },
              { value: '', label: 'Semua', count: all.length },
            ]}
          />
        </div>

        <ResponsiveTable
          columns={[
            {
              key: 'project',
              label: 'Proyek',
              primary: true,
              render: (row) => <a href={`#/admin/approvals/kas/${row.id}`} className="font-semibold text-leaf-800 hover:underline">{row.projectName}</a>,
              sub: (row) => `${row.subProjectLabel} · ${row.requestCode}`,
            },
            { key: 'date', label: 'Tanggal', render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.requestDate)}</span> },
            {
              key: 'description',
              label: 'Keterangan',
              render: (row) => (
                <span className="block max-w-56 truncate text-xs text-slate-800" title={row.description}>
                  <span className="block truncate">{row.description}</span>
                  <span className="block text-[11px] text-slate-400">{row.category} · {row.requestedBy?.fullName}</span>
                </span>
              ),
            },
            { key: 'amount', label: 'Nominal', align: 'right', render: (row) => <span className="font-mono font-semibold text-slate-900">{formatCurrency(row.amount)}</span> },
            { key: 'nota', label: 'Nota', render: (row) => <a href={`#/admin/approvals/kas/${row.id}`} className="whitespace-nowrap text-xs font-semibold text-leaf-700 hover:underline">📎 View Nota ({row.attachments.length})</a> },
            {
              key: 'action',
              label: 'Aksi',
              align: 'right',
              render: (row) => (row.status === 'submitted'
                ? <DecisionButtons onApprove={() => approve(row)} onReject={() => setRejecting({ id: row.id, notes: '', error: '' })} />
                : <StatusBadge status={row.status} map={KAS_STATUS} />),
            },
          ]}
          rows={visible}
          rowKey={(row) => row.id}
          loading={!rows}
          loadingText="Memuat klaim..."
          empty={status === 'submitted' ? 'Tidak ada klaim yang menunggu. 🎉' : 'Tidak ada data.'}
          expandedRow={(row) => (rejecting.id === row.id ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <label className="flex-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-700">Alasan penolakan {row.requestCode}</span>
                <input
                  autoFocus
                  value={rejecting.notes}
                  onChange={(event) => setRejecting((value) => ({ ...value, notes: event.target.value, error: '' }))}
                  onKeyDown={(event) => { if (event.key === 'Enter') submitReject(row); if (event.key === 'Escape') setRejecting({ id: null, notes: '', error: '' }); }}
                  className="input-control mt-1 text-sm"
                  placeholder="Contoh: Nota tidak terbaca, mohon unggah ulang"
                />
                {rejecting.error && <span className="mt-1 block text-[11px] font-medium text-red-600">{rejecting.error}</span>}
              </label>
              <div className="flex gap-2 sm:pt-5">
                <button type="button" onClick={() => setRejecting({ id: null, notes: '', error: '' })} className="btn btn-secondary text-xs">Batal</button>
                <button type="button" onClick={() => submitReject(row)} className="btn btn-danger text-xs">Tolak Klaim</button>
              </div>
            </div>
          ) : null)}
        />
        <Pager page={current} totalPages={totalPages} total={filtered.length} shown={visible.length} onChange={setPage} label="klaim" />
      </section>
    </>
  );
}
