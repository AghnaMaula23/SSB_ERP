import { useState } from 'react';
import FieldLayout from '../components/FieldLayout.jsx';
import { parseFieldRoute } from '../utils/fieldRoute.js';
import MaterialRequestListPage from './MaterialRequestListPage.jsx';
import MaterialRequestFormPage from './MaterialRequestFormPage.jsx';
import MaterialRequestDetailPage from './MaterialRequestDetailPage.jsx';
import DeliveryFormPage from './DeliveryFormPage.jsx';
import ReceiptFormPage from './ReceiptFormPage.jsx';
import EquipmentRequestListPage from './EquipmentRequestListPage.jsx';
import EquipmentRequestFormPage from './EquipmentRequestFormPage.jsx';
import EquipmentRequestDetailPage from './EquipmentRequestDetailPage.jsx';
import CashRequestListPage from './CashRequestListPage.jsx';
import CashRequestFormPage from './CashRequestFormPage.jsx';
import CashRequestDetailPage from './CashRequestDetailPage.jsx';
import ExpenseReportListPage from './ExpenseReportListPage.jsx';
import ExpenseReportFormPage from './ExpenseReportFormPage.jsx';
import ExpenseReportDetailPage from './ExpenseReportDetailPage.jsx';
import WageClaimListPage from './WageClaimListPage.jsx';
import WageClaimFormPage from './WageClaimFormPage.jsx';
import WageClaimDetailPage from './WageClaimDetailPage.jsx';
import PaymentProofFormPage from './PaymentProofFormPage.jsx';

/** Modul milik Divisi Lapangan. Setiap halaman tujuan menampilkan pesan sukses dari form. */
export default function FieldWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseFieldRoute(route);
  const [flash, setFlash] = useState({ route: '', text: '' });
  const notice = flash.route === route ? flash.text : '';
  const go = (target, text = '') => { setFlash({ route: target, text }); onNavigate(target); };
  const { section, view, id, childId } = selection;
  const shared = { initialNotice: notice };

  const renderContent = () => {
    if (section === 'material') {
      const detail = `lapangan/material/${id}`;
      switch (view) {
        case 'new': return <MaterialRequestFormPage key={route} onCancel={() => go('lapangan/material')} onSaved={(saved) => go(`lapangan/material/${saved.id}`, `Request ${saved.requestCode} dikirim ke Admin.`)} />;
        case 'detail': return <MaterialRequestDetailPage key={route} {...shared} recordId={id} />;
        case 'delivery-new': return <DeliveryFormPage key={route} requestId={id} onCancel={() => go(detail)} onSaved={(saved) => go(detail, `Surat jalan ${saved.deliveryNoteNumber} tercatat (${saved.deliveryCode}).`)} />;
        case 'receipt-new': return <ReceiptFormPage key={route} requestId={id} deliveryId={childId} onCancel={() => go(detail)} onSaved={(saved) => go(detail, `Penerimaan ${saved.receiptCode} tercatat.`)} />;
        default: return <MaterialRequestListPage key={route} {...shared} />;
      }
    }
    if (section === 'alat') {
      switch (view) {
        case 'new': return <EquipmentRequestFormPage key={route} onCancel={() => go('lapangan/alat')} onSaved={(saved) => go(`lapangan/alat/${saved.id}`, `Request ${saved.requestCode} dikirim ke Admin.`)} />;
        case 'detail': return <EquipmentRequestDetailPage key={route} {...shared} recordId={id} />;
        default: return <EquipmentRequestListPage key={route} {...shared} />;
      }
    }
    if (section === 'kas') {
      switch (view) {
        case 'new': return <CashRequestFormPage key={route} onCancel={() => go('lapangan/kas')} onSaved={(saved) => go(`lapangan/kas/${saved.id}`, `Pengajuan ${saved.requestCode} dikirim ke Admin.`)} />;
        case 'detail': return <CashRequestDetailPage key={route} {...shared} recordId={id} />;
        case 'report-list': return <ExpenseReportListPage key={route} {...shared} />;
        case 'report-new': return <ExpenseReportFormPage key={route} onCancel={() => go('lapangan/kas/laporan')} onSaved={(saved) => go(`lapangan/kas/laporan/${saved.id}`, `Laporan ${saved.reportCode} dikirim ke Finance.`)} />;
        case 'report-from-request': return <ExpenseReportFormPage key={route} requestId={id} onCancel={() => go(`lapangan/kas/${id}`)} onSaved={(saved) => go(`lapangan/kas/laporan/${saved.id}`, `Laporan ${saved.reportCode} dikirim ke Finance.`)} />;
        case 'report-detail': return <ExpenseReportDetailPage key={route} {...shared} recordId={id} />;
        default: return <CashRequestListPage key={route} {...shared} />;
      }
    }
    switch (view) {
      case 'new': return <WageClaimFormPage key={route} onCancel={() => go('lapangan/upah')} onSaved={(saved) => go(`lapangan/upah/${saved.id}`, `Klaim ${saved.claimCode} dikirim ke Admin.`)} />;
      case 'detail': return <WageClaimDetailPage key={route} {...shared} recordId={id} />;
      case 'proof-new': return <PaymentProofFormPage key={route} claimId={id} onCancel={() => go(`lapangan/upah/${id}`)} onSaved={(saved) => go(`lapangan/upah/${id}`, `Bukti bayar ${saved.proofCode} dikirim ke Finance.`)} />;
      default: return <WageClaimListPage key={route} {...shared} />;
    }
  };

  return (
    <FieldLayout active={section} onNavigate={onNavigate} onBackToModules={onBackToModules} onSignOut={onSignOut}>
      {renderContent()}
    </FieldLayout>
  );
}
