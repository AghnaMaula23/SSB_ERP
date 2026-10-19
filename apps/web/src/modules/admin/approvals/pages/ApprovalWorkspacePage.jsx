import { useState } from 'react';
import AdminLayout from '../../components/AdminLayout.jsx';
import { Breadcrumb, PageHeader } from '../../project/components/ProjectUi.jsx';
import ApprovalQueue from './ApprovalQueue.jsx';
import EquipmentRequestReview from './EquipmentRequestReview.jsx';
import MaterialRequestReview from './MaterialRequestReview.jsx';
import PurchaseRequestQueue from './PurchaseRequestQueue.jsx';
import PurchaseRequestDetail from './PurchaseRequestDetail.jsx';
import FieldCashQueue from './FieldCashQueue.jsx';
import FieldCashDetail from './FieldCashDetail.jsx';
import { parseApprovalRoute } from '../utils/approvalRoute.js';

const TABS = [
  { key: 'antrean', label: 'Antrean Approval', hint: 'Semua sumber' },
  { key: 'po', label: 'PO Suku Cadang & Servis Rutin', hint: 'Riwayat PO' },
  { key: 'kas', label: 'Verifikasi Kas Lapangan', hint: 'Data contoh' },
];

/** Pusat Approval Pengeluaran Divisi Admin. */
export default function ApprovalWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseApprovalRoute(route) || { tab: 'antrean', recordId: null };
  const [flash, setFlash] = useState({ route: '', text: '' });
  // Review Request Alat/Material selalu dibuka dari antrean, jadi kembali ke sana.
  const listRoute = `admin/approvals/${['alat', 'material'].includes(selection.tab) ? 'antrean' : selection.tab}`;
  const flashFor = (target) => (flash.route === target ? flash.text : '');
  const backWithNotice = (text) => { setFlash({ route: listRoute, text }); onNavigate(listRoute); };

  let content;
  if (selection.tab === 'antrean') {
    content = <ApprovalQueue key={route} initialNotice={flashFor(listRoute)} />;
  } else if (selection.tab === 'alat') {
    content = <EquipmentRequestReview key={route} recordId={selection.recordId} onDone={backWithNotice} />;
  } else if (selection.tab === 'material') {
    content = <MaterialRequestReview key={route} recordId={selection.recordId} onDone={backWithNotice} />;
  } else if (selection.tab === 'po') {
    content = selection.recordId
      ? <PurchaseRequestDetail key={route} recordId={selection.recordId} onDone={backWithNotice} />
      : <PurchaseRequestQueue key={route} initialNotice={flashFor(listRoute)} />;
  } else {
    content = selection.recordId
      ? <FieldCashDetail key={route} recordId={selection.recordId} onDone={backWithNotice} />
      : <FieldCashQueue key={route} initialNotice={flashFor(listRoute)} />;
  }

  return (
    <AdminLayout active="approvals" onNavigate={onNavigate} onBackToModules={onBackToModules} onSignOut={onSignOut}>
      {!selection.recordId && (
        <>
          <Breadcrumb items={[{ label: 'Divisi Admin' }, { label: 'Approvals' }]} />
          <PageHeader title="Pusat Approval Pengeluaran" subtitle="Gatekeeper otoritas pengeluaran konstruksi & logistik operasional" />
          <nav className="-mt-2 mb-6 inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-xs" aria-label="Jenis approval">
            {TABS.map((tab) => {
              const active = tab.key === selection.tab;
              return (
                <a
                  key={tab.key}
                  href={`#/admin/approvals/${tab.key}`}
                  aria-current={active ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition sm:text-sm ${active ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                >
                  {tab.label}
                  <span className={`ml-2 hidden text-[10px] font-medium sm:inline ${active ? 'text-teal-100' : 'text-slate-400'}`}>{tab.hint}</span>
                </a>
              );
            })}
          </nav>
        </>
      )}
      {content}
    </AdminLayout>
  );
}
