import { useState } from 'react';
import AdminLayout from '../../components/AdminLayout.jsx';
import { Breadcrumb, PageHeader } from '../../project/components/ProjectUi.jsx';
import ApprovalQueue from './ApprovalQueue.jsx';
import EquipmentRequestReview from './EquipmentRequestReview.jsx';
import MaterialRequestReview from './MaterialRequestReview.jsx';
import ProgressLogReview from './ProgressLogReview.jsx';
import PurchaseRequestQueue from './PurchaseRequestQueue.jsx';
import PurchaseRequestDetail from './PurchaseRequestDetail.jsx';
import FieldCashQueue from './FieldCashQueue.jsx';
import FieldCashDetail from './FieldCashDetail.jsx';
import { parseApprovalRoute } from '../utils/approvalRoute.js';

const TABS = [
  { key: 'antrean', label: 'Approval Center', hint: 'Semua sumber' },
  { key: 'po', label: 'PO Suku Cadang & Servis Rutin', hint: 'Riwayat PO' },
  { key: 'kas', label: 'Verifikasi Kas Lapangan', hint: 'Data contoh' },
];

/**
 * Pusat Approval Divisi Admin. Tab utamanya Approval Center Admin
 * (docs/keputusan-desain-approval-center.md); detail yang dibuka dari sana
 * kembali ke sana setelah diputuskan.
 */
export default function ApprovalWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseApprovalRoute(route) || { tab: 'antrean', detail: null, recordId: null, subProjectId: null };
  const [flash, setFlash] = useState({ route: '', text: '' });
  const listRoute = `admin/approvals/${selection.tab}`;
  const flashFor = (target) => (flash.route === target ? flash.text : '');
  const backWithNotice = (text) => { setFlash({ route: listRoute, text }); onNavigate(listRoute); };
  const fromQueue = selection.tab === 'antrean';

  let content;
  switch (selection.detail) {
    case 'po':
      content = (
        <PurchaseRequestDetail
          key={route}
          recordId={selection.recordId}
          onDone={backWithNotice}
          listHref={`#/${listRoute}`}
          listLabel={fromQueue ? 'Approval Center' : 'PO Suku Cadang & Servis'}
        />
      );
      break;
    case 'alat':
      content = <EquipmentRequestReview key={route} recordId={selection.recordId} onDone={backWithNotice} />;
      break;
    case 'material':
      content = <MaterialRequestReview key={route} recordId={selection.recordId} onDone={backWithNotice} />;
      break;
    case 'progress':
      content = <ProgressLogReview key={route} subProjectId={selection.subProjectId} recordId={selection.recordId} onDone={backWithNotice} />;
      break;
    case 'kas':
      content = <FieldCashDetail key={route} recordId={selection.recordId} onDone={backWithNotice} />;
      break;
    default:
      if (selection.tab === 'po') content = <PurchaseRequestQueue key={route} initialNotice={flashFor(listRoute)} />;
      else if (selection.tab === 'kas') content = <FieldCashQueue key={route} initialNotice={flashFor(listRoute)} />;
      else content = <ApprovalQueue key={route} initialNotice={flashFor(listRoute)} />;
  }

  return (
    <AdminLayout active="approvals" onNavigate={onNavigate} onBackToModules={onBackToModules} onSignOut={onSignOut}>
      {!selection.detail && (
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
