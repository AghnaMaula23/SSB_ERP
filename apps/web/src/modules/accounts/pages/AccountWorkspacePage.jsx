import { useState } from 'react';
import DivisionLayout from '../../../components/DivisionLayout.jsx';
import AccountListPage from './AccountListPage.jsx';
import AccountFormPage from './AccountFormPage.jsx';
import { parseAccountRoute } from '../utils/accountRoute.js';

const RAIL_ITEMS = [{ key: 'akun', label: 'Akun User', icon: '👤', route: 'akun' }];
const BRAND = { title: 'Manajemen Akun', subtitle: 'System Admin' };

export default function AccountWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseAccountRoute(route);
  const [flash, setFlash] = useState({ route: '', text: '' });
  const done = (_saved, text) => { setFlash({ route: 'akun', text }); onNavigate('akun'); };

  return (
    <DivisionLayout items={RAIL_ITEMS} brand={BRAND} storageKey="akun-sidebar-collapsed" active="akun" onNavigate={onNavigate} onBackToModules={onBackToModules} onSignOut={onSignOut}>
      {selection.view === 'list'
        ? <AccountListPage key={route} initialNotice={flash.route === route ? flash.text : ''} />
        : <AccountFormPage key={route} userId={selection.userId} onCancel={() => onNavigate('akun')} onSaved={done} />}
    </DivisionLayout>
  );
}
