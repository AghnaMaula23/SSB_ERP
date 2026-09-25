import { useCallback, useEffect, useState } from 'react';
import Login from './pages/Login.jsx';
import ModuleSelection from './pages/ModuleSelection.jsx';
import ItemsPage from './modules/alat/pages/ItemsPage.jsx';
import ItemDetailPage from './modules/alat/pages/ItemDetailPage.jsx';
import InformationPage from './modules/alat/information/pages/InformationPage.jsx';
import MaintenancePage from './modules/alat/pages/MaintenancePage.jsx';
import ResetMaintenancePage from './modules/alat/pages/ResetMaintenancePage.jsx';
import PurchaseOrderPage from './modules/alat/pages/PurchaseOrderPage.jsx';
import PurchaseOrderCreatePage from './modules/alat/pages/PurchaseOrderCreatePage.jsx';
import PurchaseOrderEditPage from './modules/alat/pages/PurchaseOrderEditPage.jsx';
import KasPage from './modules/alat/pages/KasPage.jsx';
import KasClaimPendapatanPage from './modules/alat/pages/KasClaimPendapatanPage.jsx';
import { clearSession, getCurrentUser } from './services/auth.js';

function getInitialRoute() {
  const route = window.location.hash.replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '');
  return route || (localStorage.getItem('token') ? 'modules' : 'login');
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function isKnownRoute(route) {
  return route === 'login' ||
    route === 'modules' ||
    route === 'alat/items' ||
    /^\/alat\/items\/\d+\/?$/.test(`/${route}`) ||
    route === 'alat/information' ||
    route === 'alat/maintenance' ||
    /^alat\/maintenance\/reset\/\d+\/?$/.test(route) ||
    route === 'alat/purchase-orders' ||
    route === 'alat/purchase-orders/create' ||
    /^alat\/purchase-orders\/\d+\/edit\/?$/.test(route) ||
    route === 'alat/kas' ||
    route === 'alat/kas/claim-pendapatan' ||
    route === 'alat/kas/request-pendapatan';
}

function AppLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
      Memuat sesi...
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState(getInitialRoute);
  const [user, setUser] = useState(readStoredUser);
  const [authStatus, setAuthStatus] = useState(() => (localStorage.getItem('token') ? 'checking' : 'anonymous'));
  const [maintenanceNotice, setMaintenanceNotice] = useState('');

  const navigate = useCallback((nextRoute) => {
    const cleanRoute = String(nextRoute).replace(/^#?\/?/, '').split('?')[0].replace(/\/+$/, '');
    if (window.location.hash !== `#/${cleanRoute}`) window.location.hash = `/${cleanRoute}`;
  }, []);

  useEffect(() => {
    const handleHashChange = () => setRoute(getInitialRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('token')) return undefined;

    let cancelled = false;
    getCurrentUser()
      .then((currentUser) => {
        if (!cancelled) {
          setUser(currentUser);
          setAuthStatus('authenticated');
        }
      })
      .catch((error) => {
        if (cancelled) return;
        if (error?.status === 401) {
          clearSession();
          setUser(null);
          setAuthStatus('anonymous');
          return;
        }
        // A temporary network/server failure must not destroy a valid local
        // session or its demo data. Individual screens will surface API errors.
        setUser(readStoredUser());
        setAuthStatus('authenticated');
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearSession();
      setUser(null);
      setAuthStatus('anonymous');
      navigate('login');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [navigate]);

  useEffect(() => {
    if (authStatus === 'checking') return;

    const hasToken = Boolean(localStorage.getItem('token'));
    if (!hasToken) {
      if (route !== 'login') navigate('login');
      return;
    }
    if (route === 'login') {
      navigate('modules');
      return;
    }
    if (!isKnownRoute(route)) navigate('modules');
  }, [authStatus, navigate, route]);

  const signOut = () => {
    clearSession();
    setUser(null);
    setAuthStatus('anonymous');
    navigate('login');
  };

  if (authStatus === 'checking' || (authStatus !== 'authenticated' && route !== 'login')) return <AppLoading />;
  if (authStatus === 'authenticated' && route === 'login') return <AppLoading />;
  if (route === 'login') return <Login onLoginSuccess={({ user: loggedInUser }) => { setUser(loggedInUser); setAuthStatus('authenticated'); navigate('modules'); }} />;
  if (route === 'modules') return <ModuleSelection user={user || {}} onSelectModule={navigate} onSignOut={signOut} />;
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
  if (route === 'alat/purchase-orders')
    return <PurchaseOrderPage key={route} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (route === 'alat/purchase-orders/create')
    return <PurchaseOrderCreatePage key={route} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (route.startsWith('alat/purchase-orders/') && route.endsWith('/edit')) {
    const poId = route.split('/')[2];
    return <PurchaseOrderEditPage key={route} poId={poId} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  }
  if (route === 'alat/kas')
    return <KasPage key={route} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (route === 'alat/kas/claim-pendapatan' || route === 'alat/kas/request-pendapatan')
    return <KasClaimPendapatanPage key={route} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;

  return <AppLoading />;
}

