import { useState } from 'react';
import AdminLayout from '../../components/AdminLayout.jsx';
import IncomeListPage from './IncomeListPage.jsx';
import IncomeFormPage from './IncomeFormPage.jsx';
import IncomeDetailPage from './IncomeDetailPage.jsx';
import { parseIncomeRoute } from '../utils/incomeRoute.js';
import { formatCurrency } from '../../project/utils/projectFormat.js';

/** Menu Income Divisi Admin: daftar pengajuan, form per sumber, dan detail. */
export default function IncomeWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseIncomeRoute(route) || { view: 'list' };
  const [flash, setFlash] = useState({ route: '', text: '' });
  const flashFor = (target) => (flash.route === target ? flash.text : '');

  let content;
  if (selection.view === 'form') {
    content = (
      <IncomeFormPage
        key={route}
        sourceType={selection.sourceType}
        onNavigate={onNavigate}
        onSaved={(record) => {
          const target = `admin/income/${record.id}`;
          setFlash({ route: target, text: `Pendapatan #${record.referenceCode} senilai ${formatCurrency(record.totalAmount)} diajukan ke Finance.` });
          onNavigate(target);
        }}
      />
    );
  } else if (selection.view === 'detail') {
    content = <IncomeDetailPage key={route} recordId={selection.recordId} initialNotice={flashFor(route)} onNavigate={onNavigate} />;
  } else {
    content = <IncomeListPage key={route} initialNotice={flashFor(route)} />;
  }

  return (
    <AdminLayout active="income" onNavigate={onNavigate} onBackToModules={onBackToModules} onSignOut={onSignOut}>
      {content}
    </AdminLayout>
  );
}
