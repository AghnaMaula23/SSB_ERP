import { useState } from 'react';
import AdminLayout from '../../components/AdminLayout.jsx';
import PurchaseRequestQueue from './PurchaseRequestQueue.jsx';
import PurchaseRequestDetail from './PurchaseRequestDetail.jsx';
import FieldCashQueue from './FieldCashQueue.jsx';
import FieldCashDetail from './FieldCashDetail.jsx';
import { parseApprovalRoute } from '../utils/approvalRoute.js';

const TABS = [
  { key: 'po', label: 'PO Suku Cadang & Servis Rutin', hint: 'API Divisi Alat' },
  { key: 'kas', label: 'Verifikasi Kas Lapangan', hint: 'Data contoh' },
];

/** Pusat Approval Pengeluaran Divisi Admin. */
export default function ApprovalWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseApprovalRoute(route) || { tab: 'po', recordId: null };
  const [flash, setFlash] = useState({ route: '', text: '' });
  const listRoute = `admin/approvals/${selection.tab}`;
  const flashFor = (target) => (flash.route === target ? flash.text : '');
  const backWithNotice = (text) => { setFlash({ route: listRoute, text }); onNavigate(listRoute); };

  let content;
  if (selection.tab === 'po') {
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
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pusat Approval Pengeluaran</h1>
          <p className="mt-1 text-sm text-slate-500">Gatekeeper otoritas pengeluaran konstruksi &amp; logistik operasional</p>
          <nav className="mb-6 mt-5 inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-xs" aria-label="Jenis approval">
            {TABS.map((tab) => {
              const active = tab.key === selection.tab;
              return (
                <a
                  key={tab.key}
                  href={`#/admin/approvals/${tab.key}`}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition sm:text-sm ${active ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
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
