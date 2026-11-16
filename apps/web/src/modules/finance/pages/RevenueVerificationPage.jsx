import { Fragment, useState } from 'react';
import { Breadcrumb, MockBanner, Notice, PageHeader, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { RejectReasonForm, StatTile } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate, formatNumber } from '../../admin/project/utils/projectFormat.js';
import { decideIncomeRecord, listIncomeRecords } from '../../admin/income/services/incomeService.js';
import { COMPONENTS, INCOME_STATUS } from '../../admin/income/utils/incomeFormat.js';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { decideAlatIncome, journalIncome, listAlatIncome } from '../services/financeMockService.js';

const SECTIONS = [
  { key: 'construction_project', title: 'Pendapatan Project', icon: '🏗️', party: 'Proyek Utama' },
  { key: 'external_rental', title: 'Pendapatan Rental Alat', icon: '🛠️', party: 'Penyewa' },
  { key: 'external_supply', title: 'Pendapatan Supply Material', icon: '🚚', party: 'Pembeli' },
];
const ALAT_STATUS = {
  pending: { label: 'Menunggu Finance', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Dikonfirmasi', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  rejected: { label: 'Ditolak', className: 'bg-red-50 text-red-700 border-red-200' },
};

function ActionButtons({ onConfirm, onReject, confirmLabel = 'Confirm', disabled }) {
  return (
    <div className="flex justify-end gap-1.5">
      <button type="button" disabled={disabled} onClick={onConfirm} className="rounded-md bg-leaf-700 px-3 py-1.5 text-[11px] font-bold uppercase text-white hover:bg-leaf-800 disabled:opacity-40">{confirmLabel}</button>
      {onReject && <button type="button" disabled={disabled} onClick={onReject} className="rounded-md bg-red-600 px-3 py-1.5 text-[11px] font-bold uppercase text-white hover:bg-red-700 disabled:opacity-40">Reject</button>}
    </div>
  );
}

/**
 * Verifikasi pendapatan dari Income Admin (project, rental, supply) dan klaim
 * Divisi Alat. Confirm = pendapatan diakui (jurnal Piutang/Pendapatan); dari
 * "Terverifikasi", Tandai Lunas = uang diterima (jurnal Bank/Piutang).
 */
export default function RevenueVerificationPage() {
  const [showDone, setShowDone] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [notice, setNotice] = useState({ tone: 'success', text: '' });
  const [busy, setBusy] = useState(false);
  const { data, reload } = useRecord(async () => {
    const [records, alat] = await Promise.all([listIncomeRecords(), listAlatIncome()]);
    return { records, alat };
  }, 'revenue');

  const records = data?.records || [];
  const pending = records.filter((row) => row.status === 'submitted');
  const alatPending = (data?.alat || []).filter((row) => row.status === 'pending');
  const inflow = [...pending, ...alatPending].reduce((sum, row) => sum + row.totalAmount, 0);

  const run = async (action, text) => {
    setBusy(true);
    setNotice({ tone: 'success', text: '' });
    try {
      await action();
      setNotice({ tone: 'success', text });
      setRejecting(null);
      reload();
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const decideRecord = (row, status, notes) => run(async () => {
    const updated = await decideIncomeRecord(row.id, status, notes);
    if (status !== 'rejected') await journalIncome(updated, status);
  }, `${row.referenceCode} ${status === 'verified' ? 'diverifikasi — pendapatan diakui' : status === 'paid' ? 'ditandai lunas' : 'ditolak'}.`);

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Finance' }, { label: 'Verifikasi Pendapatan' }]} />
      <PageHeader
        title="Verifikasi & Konfirmasi Pendapatan"
        subtitle="Tagihan yang disusun Admin (Income) dan klaim Divisi Alat menunggu konfirmasi Finance."
        actions={<label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} className="accent-brand-700" /> Tampilkan yang sudah diputuskan</label>}
      />
      <MockBanner>Modul Income belum ada di backend — tagihan dan klaim di sini data contoh dari menu Income Admin dan Kas Divisi Alat.</MockBanner>
      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <StatTile label="Total Antrean Pendapatan" value={data ? `${pending.length + alatPending.length} Transaksi` : '…'} icon="📋" tone="amber" />
        <StatTile label="Estimasi Inflow Masuk" value={data ? formatCurrency(inflow) : '…'} icon="💰" tone="teal" />
      </div>

      {SECTIONS.map((section) => {
        const rows = records.filter((row) => row.projectSourceType === section.key && (showDone || ['submitted', 'verified'].includes(row.status)));
        return (
          <section key={section.key} className="mb-6" aria-label={section.title}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-leaf-800">{section.icon} Verifikasi {section.title}</h2>
            <div className="table-container">
              <div className="table-scroll-mobile overflow-x-auto">
                <table className="table-modern">
                  <thead><tr><th>Referensi</th><th>Tanggal</th><th>{section.party}</th><th>Proyek</th><th className="text-right">Pendapatan</th><th className="text-center">Status</th><th className="text-right">Aksi</th></tr></thead>
                  <tbody>
                    {!rows.length && <tr><td colSpan={7} className="py-8 text-center text-xs text-slate-500">Tidak ada tagihan yang menunggu.</td></tr>}
                    {rows.map((row) => (
                      <Fragment key={row.id}>
                        <tr>
                          <td><button type="button" onClick={() => setExpanded(expanded === row.id ? null : row.id)} className="font-mono text-xs font-bold text-leaf-700 hover:underline">{row.referenceCode} {expanded === row.id ? '▾' : '▸'}</button></td>
                          <td className="whitespace-nowrap text-xs">{formatDate(row.createdAt)}</td>
                          <td className="text-sm">{row.partyName}</td>
                          <td className="text-xs">{row.projectName}{row.subProjectLabel ? ` · ${row.subProjectLabel}` : ''}</td>
                          <td className="text-right font-mono text-sm font-semibold text-leaf-700">{formatCurrency(row.totalAmount)}</td>
                          <td className="text-center"><StatusBadge status={row.status} map={INCOME_STATUS} /></td>
                          <td>
                            {row.status === 'submitted' && <ActionButtons disabled={busy} onConfirm={() => window.confirm(`Verifikasi ${row.referenceCode} senilai ${formatCurrency(row.totalAmount)}?`) && decideRecord(row, 'verified')} onReject={() => setRejecting(`r-${row.id}`)} />}
                            {row.status === 'verified' && <ActionButtons disabled={busy} confirmLabel="Tandai Lunas" onConfirm={() => window.confirm(`Pembayaran ${row.referenceCode} sudah diterima?`) && decideRecord(row, 'paid')} />}
                          </td>
                        </tr>
                        {expanded === row.id && (
                          <tr><td colSpan={7} className="bg-slate-50">
                            <ul className="space-y-1 text-xs">
                              {row.items.map((item, index) => (
                                <li key={index} className="flex flex-wrap justify-between gap-2">
                                  <span>{COMPONENTS[item.incomeComponentType]?.icon} {item.description} · {formatNumber(item.quantity)} {item.unit} × {formatCurrency(item.rateSnapshot)}</span>
                                  <span className="font-mono font-semibold">{formatCurrency(item.subtotalAmount)}</span>
                                </li>
                              ))}
                            </ul>
                            {row.financeNotes && <p className="mt-2 text-xs text-red-700">Catatan Finance: {row.financeNotes}</p>}
                          </td></tr>
                        )}
                        {rejecting === `r-${row.id}` && (
                          <tr><td colSpan={7} className="bg-red-50/60">
                            <RejectReasonForm label={`Alasan menolak ${row.referenceCode}`} submitLabel="Tolak Tagihan" placeholder="Contoh: Tarif belum dilampiri addendum kontrak" onSubmit={(notes) => decideRecord(row, 'rejected', notes)} onCancel={() => setRejecting(null)} />
                          </td></tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}

      <section className="mb-6" aria-label="Pendapatan Divisi Alat">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-leaf-800">🚜 Verifikasi Pendapatan Divisi Alat</h2>
        <div className="table-container">
          <div className="table-scroll-mobile overflow-x-auto">
            <table className="table-modern">
              <thead><tr><th>Klaim</th><th>Tanggal</th><th>Penyewa</th><th>Proyek</th><th className="text-right">Pendapatan</th><th className="text-right">Unit</th><th className="text-right">Total Jam</th><th className="text-center">Status</th><th className="text-right">Aksi</th></tr></thead>
              <tbody>
                {(data?.alat || []).filter((row) => showDone || row.status === 'pending').map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td className="font-mono text-xs font-bold text-leaf-700">{row.claimCode}</td>
                      <td className="whitespace-nowrap text-xs">{formatDate(row.claimDate)}</td>
                      <td className="text-sm">{row.clientName}</td>
                      <td className="text-xs">{row.project}</td>
                      <td className="text-right font-mono text-sm font-semibold text-leaf-700">{formatCurrency(row.totalAmount)}</td>
                      <td className="text-right text-xs">{row.unitCount}</td>
                      <td className="text-right text-xs">{formatNumber(row.totalHours)} jam</td>
                      <td className="text-center"><StatusBadge status={row.status} map={ALAT_STATUS} /></td>
                      <td>{row.status === 'pending' && <ActionButtons disabled={busy} onConfirm={() => window.confirm(`Konfirmasi ${row.claimCode} senilai ${formatCurrency(row.totalAmount)}?`) && run(() => decideAlatIncome(row.id, 'approved'), `${row.claimCode} dikonfirmasi — Kas Alat bertambah.`)} onReject={() => setRejecting(`a-${row.id}`)} />}</td>
                    </tr>
                    {rejecting === `a-${row.id}` && (
                      <tr><td colSpan={9} className="bg-red-50/60">
                        <RejectReasonForm label={`Alasan menolak ${row.claimCode}`} submitLabel="Tolak Klaim" placeholder="Contoh: Jam kerja tidak sesuai timesheet" onSubmit={(notes) => run(() => decideAlatIncome(row.id, 'rejected', notes), `${row.claimCode} ditolak.`)} onCancel={() => setRejecting(null)} />
                      </td></tr>
                    )}
                  </Fragment>
                ))}
                {data && !(data.alat || []).some((row) => showDone || row.status === 'pending') && <tr><td colSpan={9} className="py-8 text-center text-xs text-slate-500">Tidak ada klaim yang menunggu.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
