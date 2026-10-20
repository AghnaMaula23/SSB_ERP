import { useEffect, useRef, useState } from 'react';
import AdminLayout from '../../components/AdminLayout.jsx';
import { Breadcrumb, EmptyPanel, PageHeader } from '../../project/components/ProjectUi.jsx';
import ApprovalQueue from './ApprovalQueue.jsx';
import EquipmentRequestReview from './EquipmentRequestReview.jsx';
import MaterialRequestReview from './MaterialRequestReview.jsx';
import ProgressLogReview from './ProgressLogReview.jsx';
import PurchaseRequestQueue from './PurchaseRequestQueue.jsx';
import PurchaseRequestDetail from './PurchaseRequestDetail.jsx';
import FieldCashQueue from './FieldCashQueue.jsx';
import FieldCashDetail from './FieldCashDetail.jsx';
import { getApprovalSummary } from '../services/approvalService.js';
import { listFieldCash } from '../services/fieldCashMockService.js';
import { parseApprovalRoute } from '../utils/approvalRoute.js';

/**
 * Enam antrean Admin, urut sesuai alur. `sourceType` = sumber di
 * /api/approval-queue (null = antrean belum ada di backend). `status`:
 *   live    — backend ada, data asli
 *   mock    — backend belum ada (Build Order 7), layar memakai data contoh
 *   pending — backend & layar belum ada
 */
const TABS = [
  { key: 'pr', label: 'PR Divisi Alat', icon: '🔧', sourceType: 'purchase_request', status: 'live' },
  { key: 'material', label: 'Request Material', icon: '🧱', sourceType: 'material_request', status: 'live' },
  { key: 'alat', label: 'Request Alat', icon: '🚜', sourceType: 'equipment_request', status: 'live' },
  { key: 'progress', label: 'Progress Harian', icon: '📈', sourceType: 'progress_log', status: 'live' },
  { key: 'kas', label: 'Kas Lapangan', icon: '💵', sourceType: null, status: 'mock' },
  { key: 'upah', label: 'Klaim Upah Harian', icon: '👷', sourceType: null, status: 'pending' },
];

/** Jumlah yang menunggu Admin per tab — dari summary backend (+ data contoh kas). */
function useTabCounts(refreshKey) {
  const [counts, setCounts] = useState({});
  useEffect(() => {
    let cancelled = false;
    getApprovalSummary()
      .then((response) => {
        if (cancelled) return;
        const next = {};
        (response.items || []).filter((item) => item.stage === 'admin').forEach((item) => {
          const tab = TABS.find((entry) => entry.sourceType === item.sourceType);
          if (tab) next[tab.key] = (next[tab.key] || 0) + item.count;
        });
        setCounts((previous) => ({ ...previous, ...next }));
      })
      .catch(() => {});
    listFieldCash()
      .then((rows) => { if (!cancelled) setCounts((previous) => ({ ...previous, kas: rows.filter((row) => row.status === 'submitted').length })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey]);
  return counts;
}

function WageClaimPlaceholder() {
  return (
    <EmptyPanel icon="👷" title="Klaim upah pekerja harian belum tersedia">
      Admin nantinya memvalidasi atau menolak klaim upah yang diajukan Lapangan di sini. Backend-nya
      (<code className="font-mono">/api/finance-field/wage-claims</code>) masih masuk Build Order 7, jadi
      antrean ini akan aktif setelah endpoint tersebut dibuat.
    </EmptyPanel>
  );
}

/**
 * Pusat Approval Divisi Admin — satu tab per antrean. Detail yang dibuka dari
 * sebuah tab kembali ke tab itu setelah diputuskan.
 */
export default function ApprovalWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseApprovalRoute(route) || { tab: 'pr', detail: null, recordId: null, subProjectId: null };
  const [flash, setFlash] = useState({ route: '', text: '' });
  const listRoute = `admin/approvals/${selection.tab}`;
  const flashFor = (target) => (flash.route === target ? flash.text : '');
  const backWithNotice = (text) => { setFlash({ route: listRoute, text }); onNavigate(listRoute); };
  // Hitungan dimuat ulang setiap pindah halaman, jadi keputusan di detail langsung terlihat di badge.
  const counts = useTabCounts(route);
  const activeTab = TABS.find((tab) => tab.key === selection.tab) || TABS[0];
  const tabStripRef = useRef(null);

  // Di HP tab berupa strip geser: pastikan tab aktif terlihat (geser horizontal
  // saja — scrollIntoView bisa ikut menggulir halaman secara vertikal).
  useEffect(() => {
    const strip = tabStripRef.current;
    const active = strip?.querySelector('[aria-current="page"]');
    if (!strip || !active || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
  }, [selection.tab, selection.detail]);

  let content;
  switch (selection.detail) {
    case 'pr':
      content = <PurchaseRequestDetail key={route} recordId={selection.recordId} onDone={backWithNotice} />;
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
      if (selection.tab === 'pr') content = <PurchaseRequestQueue key={route} initialNotice={flashFor(listRoute)} />;
      else if (selection.tab === 'kas') content = <FieldCashQueue key={route} initialNotice={flashFor(listRoute)} />;
      else if (selection.tab === 'upah') content = <WageClaimPlaceholder />;
      else content = <ApprovalQueue key={route} sourceType={activeTab.sourceType} initialNotice={flashFor(listRoute)} />;
  }

  return (
    <AdminLayout active="approvals" onNavigate={onNavigate} onBackToModules={onBackToModules} onSignOut={onSignOut}>
      {!selection.detail && (
        <>
          <Breadcrumb items={[{ label: 'Divisi Admin' }, { label: 'Pusat Approval' }, { label: activeTab.label }]} />
          <PageHeader title="Pusat Approval" subtitle="Semua dokumen yang menunggu keputusan Admin, dipisah per antrean." />
          {/* Mobile: strip yang bisa digeser. Desktop: grid 6 kolom / 3 kolom. */}
          <nav
            ref={tabStripRef}
            className="-mx-4 -mt-2 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 xl:grid-cols-6"
            aria-label="Antrean approval"
          >
            {TABS.map((tab) => {
              const active = tab.key === selection.tab;
              const count = counts[tab.key];
              return (
                <a
                  key={tab.key}
                  href={`#/admin/approvals/${tab.key}`}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-w-[10rem] shrink-0 items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition sm:min-w-0 ${
                    active
                      ? 'border-teal-600 bg-teal-50 shadow-xs ring-1 ring-teal-600'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-lg leading-none" aria-hidden="true">{tab.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold leading-tight ${active ? 'text-teal-900' : 'text-slate-800'}`}>{tab.label}</span>
                  </span>
                  {tab.status === 'pending' ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">Soon</span>
                  ) : count > 0 ? (
                    <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white" aria-label={`${count} menunggu`}>{count}</span>
                  ) : null}
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
