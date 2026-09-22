import { useEffect, useState } from 'react';
import Login from './pages/Login.jsx';
import ModuleSelection from './pages/ModuleSelection.jsx';
import ItemsPage from './modules/alat/pages/ItemsPage.jsx';
import ItemDetailPage from './modules/alat/pages/ItemDetailPage.jsx';
import InformationPage from './modules/alat/information/pages/InformationPage.jsx';
import MaintenancePage from './modules/alat/pages/MaintenancePage.jsx';
import ResetMaintenancePage from './modules/alat/pages/ResetMaintenancePage.jsx';

function getInitialRoute() {
  const route = window.location.hash.replace('#/', '');
  return route || (localStorage.getItem('token') ? 'modules' : 'login');
}

export default function App() {
  const [route, setRoute] = useState(getInitialRoute);
  const [maintenanceNotice, setMaintenanceNotice] = useState('');

  useEffect(() => {
    const handleHashChange = () => setRoute(getInitialRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (nextRoute) => {
    window.location.hash = `/${nextRoute}`;
    setRoute(nextRoute);
  };

  const isKnownRoute =
    route === 'login' ||
    route === 'modules' ||
    route === 'alat/items' ||
    route.startsWith('alat/items/') ||
    route === 'alat/information' ||
    route === 'alat/maintenance' ||
    route.startsWith('alat/maintenance/reset/');

  const signOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('login');
  };

  useEffect(() => {
    if (!isKnownRoute) {
      window.location.hash = `/${localStorage.getItem('token') ? 'modules' : 'login'}`;
    }
  }, [isKnownRoute, route]);

  if (route === 'login') return <Login onLoginSuccess={() => navigate('modules')} />;
  if (route === 'modules') return <ModuleSelection onSelectModule={navigate} onSignOut={signOut} />;
  if (route === 'alat/items') return <ItemsPage onBackToModules={() => navigate('modules')} onSignOut={signOut} onViewDetails={(itemId) => navigate(`alat/items/${itemId}`)} />;
  if (route.startsWith('alat/items/')) return <ItemDetailPage key={route} itemId={route.split('/')[2]} onBackToItems={() => navigate('alat/items')} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (route === 'alat/information') return <InformationPage onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (route === 'alat/maintenance')
    return (
      <MaintenancePage
        key={route}
        initialNotice={maintenanceNotice}
        onNavigateToReset={(unitId) => navigate(`alat/maintenance/reset/${unitId}`)}
        onBackToModules={() => navigate('modules')}
        onSignOut={signOut}
      />
    );
  if (route.startsWith('alat/maintenance/reset/')) {
    const unitId = route.split('/')[3];
    return (
      <ResetMaintenancePage
        key={route}
        unitId={unitId}
        onBack={(noticeMessage) => {
          if (noticeMessage) setMaintenanceNotice(noticeMessage);
          navigate('alat/maintenance');
        }}
        onBackToModules={() => navigate('modules')}
        onSignOut={signOut}
      />
    );
  }
  return null;
}
