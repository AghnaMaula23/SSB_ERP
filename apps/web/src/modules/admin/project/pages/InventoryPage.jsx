import { Fragment, useEffect, useMemo, useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { Breadcrumb, GuardedLink, MetricCard, Notice, PageHeader } from '../components/ProjectUi.jsx';
import { RejectReasonForm } from '../../approvals/components/ApprovalUi.jsx';
import { cancelStockMovement, getStageStock, listStageMovements, listStageReceipts } from '../services/materialStockService.js';
import { actorName, formatDate, formatNumber, stageCrumbs, todayIso } from '../utils/projectFormat.js';
import { MOVEMENT_TYPES } from '../utils/stockFormat.js';

const HISTORY_TABS = [
  { value: '', label: 'Semua' },
  { value: 'receipt', label: 'Penerimaan' },
  { value: 'used', label: 'Pemakaian' },
  { value: 'adjustment', label: 'Koreksi' },
];

function currentUserId() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}').id;
  } catch {
    return undefined;
  }
}

/** Penerimaan & mutasi manual digabung jadi satu riwayat, terbaru di atas. */
function buildHistory(receipts, movements) {
  const fromReceipts = receipts.map((row) => ({
    key: `r${row.id}`,
    kind: 'receipt',
    date: String(row.receivedAt || '').slice(0, 10),
    material: row.materialType?.materialName,
    unit: row.unit,
    quantity: row.acceptedQuantity,
    sign: 1,
    note: [row.receiptCode, row.delivery?.deliveryNoteNumber && `SJ ${row.delivery.deliveryNoteNumber}`, row.rejectedQuantity > 0 && `${formatNumber(row.rejectedQuantity)} ${row.unit} ditolak`].filter(Boolean).join(' · '),
    by: row.createdBy,
    isCancelled: row.isCancelled,
    cancelReason: row.cancelReason,
  }));
  const fromMovements = movements.map((row) => ({
    key: `m${row.id}`,
    kind: row.movementType,
    movementId: row.id,
    date: row.movementDate,
    material: row.materialType?.materialName,
    unit: row.unit,
    quantity: row.quantity,
    sign: MOVEMENT_TYPES[row.movementType]?.sign || -1,
    note: row.notes,
    by: row.createdBy,
    isCancelled: row.isCancelled,
    cancelReason: row.cancelReason,
  }));
  return [...fromReceipts, ...fromMovements].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

const KIND_BADGE = {
  receipt: { label: 'Penerimaan', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  ...MOVEMENT_TYPES,
};

/** Stok material per tahapan — saldo dari penerimaan + mutasi (API RM-5). */
export default function InventoryPage({ project, stage, canRecord, initialNotice }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState({ key: null, stock: [], history: [], error: '' });
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('');
  const [cancellingKey, setCancellingKey] = useState(null);
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });
  const requestKey = `${stage.id}|${reloadKey}`;
  const loading = result.key !== requestKey;
  const userId = currentUserId();
  const base = `#/admin/projects/${project.id}/sub/${stage.id}/inventory`;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getStageStock(stage.id), listStageReceipts(stage.id), listStageMovements(stage.id)])
      .then(([stock, receipts, movements]) => {
        if (!cancelled) setResult({ key: requestKey, stock: stock || [], history: buildHistory(receipts, movements), error: '' });
      })
      .catch((error) => { if (!cancelled) setResult({ key: requestKey, stock: [], history: [], error: error.message }); });
    return () => { cancelled = true; };
  }, [requestKey, stage.id]);

  const query = search.trim().toLowerCase();
  const stock = useMemo(() => result.stock.filter((row) => !query || `${row.materialType.materialName} ${row.materialType.materialCode}`.toLowerCase().includes(query)), [query, result.stock]);
  const history = useMemo(() => result.history.filter((row) => (!tab || row.kind === tab || (tab === 'adjustment' && row.kind.startsWith('adjustment')))
    && (!query || String(row.material || '').toLowerCase().includes(query))), [query, result.history, tab]);

  const today = todayIso();
  const active = result.history.filter((row) => !row.isCancelled);
  const emptyCount = result.stock.filter((row) => row.balance <= 0).length;

  const cancelMovement = async (row, reason) => {
    try {
      await cancelStockMovement(row.movementId, reason);
      setNotice({ tone: 'success', text: `Mutasi ${row.material} dibatalkan.` });
    } catch (error) {
      // Selain 409 (sudah dibatalkan / stok jadi minus) tampil di bawah isian alasan.
      if (error.status !== 409) throw error;
      setNotice({ tone: 'error', text: error.message });
    }
    setCancellingKey(null);
    setReloadKey((key) => key + 1);
  };

  return (
    <>
      <Breadcrumb items={stageCrumbs(project, stage, { label: 'Inventory' })} />
      <PageHeader
        title="Inventory Material"
        subtitle="Saldo dihitung dari penerimaan material dan mutasi pemakaian / koreksi di tahapan ini."
        actions={(
          <GuardedLink href={`${base}/new`} allowed={canRecord} reason="Pencatatan pemakaian & koreksi stok milik Divisi Lapangan (material-stock:create).">
            + Catat Mutasi
          </GuardedLink>
        )}
      />
      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      {!loading && result.error && <Notice tone="error">{result.error}</Notice>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Jenis Material" value={result.stock.length} accent loading={loading} />
        <MetricCard label="Stok Habis" value={String(emptyCount).padStart(2, '0')} tone={emptyCount ? 'red' : 'slate'} hint="Saldo 0" loading={loading} />
        <MetricCard label="Penerimaan" value={active.filter((row) => row.kind === 'receipt').length} tone="teal" hint="Dari Divisi Lapangan" loading={loading} />
        <MetricCard label="Mutasi Hari Ini" value={active.filter((row) => row.date === today).length} loading={loading} />
      </div>

      <section className="card-panel mb-4 p-4" aria-label="Cari material">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true">🔍</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-control pl-8 text-xs" placeholder="Cari nama atau kode material..." aria-label="Cari material" />
        </div>
      </section>

      <div className="table-container mb-6">
        <ResponsiveTable
          columns={[
            {
              key: 'material',
              label: 'Material',
              primary: true,
              render: (row) => (
                <span className="block">
                  <span className="block font-semibold text-slate-900">{row.materialType.materialName}</span>
                  <span className="block font-mono text-[11px] text-slate-400">{row.materialType.materialCode}</span>
                </span>
              ),
            },
            ...['received', 'adjustmentIn', 'used', 'adjustmentOut'].map((key) => ({
              key,
              label: { received: 'Diterima', adjustmentIn: 'Koreksi +', used: 'Dipakai', adjustmentOut: 'Koreksi −' }[key],
              align: 'right',
              render: (row) => <span className="font-mono text-xs text-slate-600">{row[key] ? formatNumber(row[key]) : '-'}</span>,
            })),
            {
              key: 'balance',
              label: 'Saldo',
              align: 'right',
              render: (row) => (
                <span className="whitespace-nowrap">
                  <span className={`font-mono font-bold ${row.balance <= 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatNumber(row.balance)}</span>
                  <span className="ml-1 text-[11px] text-slate-500">{row.unit}</span>
                </span>
              ),
            },
            ...(canRecord ? [{
              key: 'action',
              label: 'Aksi',
              align: 'right',
              render: (row) => <a href={`${base}/${row.materialType.id}/mutasi`} className="text-xs font-semibold text-brand-700 hover:underline">Catat Mutasi</a>,
            }] : []),
          ]}
          rows={stock}
          rowKey={(row) => row.materialType.id}
          loading={loading}
          loadingText="Memuat stok..."
          empty={result.stock.length ? 'Tidak ada material yang cocok.' : 'Belum ada stok. Material muncul di sini begitu ada penerimaan atau koreksi masuk.'}
        />
      </div>

      <section className="card-panel overflow-hidden" aria-label="Riwayat stok">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Riwayat Stok</h2>
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-200/60 p-1" role="tablist" aria-label="Jenis riwayat">
            {HISTORY_TABS.map((option) => (
              <button
                key={option.value || 'all'}
                type="button"
                role="tab"
                aria-selected={tab === option.value}
                onClick={() => setTab(option.value)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${tab === option.value ? 'bg-white text-brand-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="table-scroll-mobile overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Jenis</th>
                <th>Material</th>
                <th className="text-right">Jumlah</th>
                <th>Keterangan</th>
                <th>Dicatat</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-500">Memuat riwayat...</td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-500">Belum ada riwayat.</td></tr>
              ) : history.map((row) => {
                const badge = KIND_BADGE[row.kind];
                const canCancel = row.movementId && !row.isCancelled && row.by?.id === userId;
                return (
                  <Fragment key={row.key}>
                    <tr className={row.isCancelled ? 'bg-slate-50 opacity-60' : ''}>
                      <td className="whitespace-nowrap text-xs">{formatDate(row.date)}</td>
                      <td>
                        <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge?.className || ''}`}>{badge?.label || row.kind}</span>
                        {row.isCancelled && <span className="ml-1 rounded bg-red-50 px-1 py-0.5 text-[10px] font-bold uppercase text-red-600">Batal</span>}
                      </td>
                      <td className="text-sm text-slate-800">{row.material || '-'}</td>
                      <td className={`whitespace-nowrap text-right font-mono text-sm font-bold ${row.isCancelled ? 'line-through' : row.sign > 0 ? 'text-leaf-700' : 'text-red-600'}`}>
                        {row.sign > 0 ? '+' : '−'}{formatNumber(row.quantity)} <span className="text-[11px] font-medium text-slate-500">{row.unit}</span>
                      </td>
                      <td className="max-w-64 truncate text-xs text-slate-600" title={row.isCancelled ? `Dibatalkan: ${row.cancelReason || '-'}` : row.note || undefined}>
                        {row.isCancelled ? `Dibatalkan: ${row.cancelReason || '-'}` : row.note || '-'}
                      </td>
                      <td className="text-xs text-slate-600">{row.by ? actorName(row.by) : '-'}</td>
                      <td className="text-right">
                        {canCancel && (
                          <button type="button" disabled={cancellingKey !== null} onClick={() => setCancellingKey(row.key)} className="btn btn-ghost px-2 py-1 text-[11px] text-red-600 hover:bg-red-50">Batalkan</button>
                        )}
                      </td>
                    </tr>
                    {cancellingKey === row.key && (
                      <tr className="bg-red-50/60">
                        <td colSpan={7}>
                          <RejectReasonForm
                            label={`Alasan membatalkan mutasi ${row.material}`}
                            submitLabel="Batalkan Mutasi"
                            placeholder="Contoh: Salah input jumlah, seharusnya 12"
                            onSubmit={(reason) => cancelMovement(row, reason)}
                            onCancel={() => setCancellingKey(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
