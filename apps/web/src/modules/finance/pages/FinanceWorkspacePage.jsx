import { useState } from 'react';
import FinanceLayout from '../components/FinanceLayout.jsx';
import FieldCashReview from '../../admin/approvals/pages/FieldCashReview.jsx';
import WageClaimReview from '../../admin/approvals/pages/WageClaimReview.jsx';
import { parseFinanceRoute } from '../utils/financeRoute.js';
import FinanceApprovalsPage from './FinanceApprovalsPage.jsx';
import PurchaseRequestApproval from './PurchaseRequestApproval.jsx';
import MaterialRequestApproval from './MaterialRequestApproval.jsx';
import ExpenseReportReview from './ExpenseReportReview.jsx';
import PaymentProofReview from './PaymentProofReview.jsx';
import WagePayrollPage from './WagePayrollPage.jsx';
import EquipmentCashLedgerPage from './EquipmentCashLedgerPage.jsx';

// Layar periksa per antrean. Kas lapangan & klaim upah memakai layar Admin dengan stage finance.
const DETAIL = {
  pr: PurchaseRequestApproval,
  material: MaterialRequestApproval,
  kas: (props) => <FieldCashReview stage="finance" {...props} />,
  laporan: ExpenseReportReview,
  upah: (props) => <WageClaimReview stage="finance" {...props} />,
  bukti: PaymentProofReview,
};

/** Divisi Finance. Keputusan di detail kembali ke tab antreannya dengan pesan sukses. */
export default function FinanceWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseFinanceRoute(route);
  const [flash, setFlash] = useState({ route: '', text: '' });
  const listRoute = `finance/approvals/${selection.tab}`;
  const backWithNotice = (text) => { setFlash({ route: listRoute, text }); onNavigate(listRoute); };

  let content;
  if (selection.section === 'upah') content = <WagePayrollPage key={route} />;
  else if (selection.section === 'kas-alat') content = <EquipmentCashLedgerPage key={route} />;
  else if (selection.recordId) {
    const Detail = DETAIL[selection.tab];
    content = <Detail key={route} recordId={selection.recordId} onDone={backWithNotice} />;
  } else {
    content = <FinanceApprovalsPage key={route} tab={selection.tab} initialNotice={flash.route === route ? flash.text : ''} />;
  }

  return (
    <FinanceLayout active={selection.section} onNavigate={onNavigate} onBackToModules={onBackToModules} onSignOut={onSignOut}>
      {content}
    </FinanceLayout>
  );
}
