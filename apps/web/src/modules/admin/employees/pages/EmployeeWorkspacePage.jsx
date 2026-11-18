import { useState } from 'react';
import AdminLayout from '../../components/AdminLayout.jsx';
import EmployeeListPage from './EmployeeListPage.jsx';
import EmployeeFormPage from './EmployeeFormPage.jsx';
import { parseEmployeeRoute } from '../utils/employeeRoute.js';

/** Menu Master Karyawan Divisi Admin (plan Finance F26). */
export default function EmployeeWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseEmployeeRoute(route);
  const [flash, setFlash] = useState({ route: '', text: '' });
  const back = (text) => { setFlash({ route: 'admin/employees', text }); onNavigate('admin/employees'); };
  return (
    <AdminLayout active="employees" onNavigate={onNavigate} onBackToModules={onBackToModules} onSignOut={onSignOut}>
      {selection.view === 'list'
        ? <EmployeeListPage key={route} initialNotice={flash.route === route ? flash.text : ''} />
        : <EmployeeFormPage key={route} employeeId={selection.employeeId} onCancel={() => onNavigate('admin/employees')} onSaved={back} />}
    </AdminLayout>
  );
}
