import { lazy, useCallback, useEffect, useState } from 'react';
import Login from './pages/Login.jsx';
import ModuleSelection from './pages/ModuleSelection.jsx';
import { parseProjectRoute } from './modules/admin/project/utils/projectRoute.js';
import { parseSupplyRoute } from './modules/admin/supply/utils/supplyRoute.js';
import { parseRentalRoute } from './modules/admin/rental/utils/rentalRoute.js';
import { parseIncomeRoute } from './modules/admin/income/utils/incomeRoute.js';
import { parseApprovalRoute } from './modules/admin/approvals/utils/approvalRoute.js';
import { parseFilesRoute } from './modules/admin/files/utils/filesRoute.js';
import FieldLayout from './modules/lapangan/components/FieldLayout.jsx';
import { parseFieldRoute } from './modules/lapangan/utils/fieldRoute.js';
import { clearSession, getCurrentUser } from './services/auth.js';

// Tiap halaman dimuat saat dibuka, bukan semuanya sekaligus saat aplikasi mulai.
const ItemsPage = lazy(() => import('./modules/alat/pages/ItemsPage.jsx'));
const RegisterItemPage = lazy(() => import('./modules/alat/pages/RegisterItemPage.jsx'));
const ItemDetailPage = lazy(() => import('./modules/alat/pages/ItemDetailPage.jsx'));
const InformationPage = lazy(() => import('./modules/alat/information/pages/InformationPage.jsx'));
const DamageLogFormPage = lazy(() => import('./modules/alat/information/pages/DamageLogFormPage.jsx'));
const DamageLogDetailPage = lazy(() => import('./modules/alat/information/pages/DamageLogDetailPage.jsx'));
const MaintenancePage = lazy(() => import('./modules/alat/pages/MaintenancePage.jsx'));
const MaintenanceThresholdPage = lazy(() => import('./modules/alat/pages/MaintenanceThresholdPage.jsx'));
const ResetMaintenancePage = lazy(() => import('./modules/alat/pages/ResetMaintenancePage.jsx'));
const PurchaseOrderPage = lazy(() => import('./modules/alat/pages/PurchaseOrderPage.jsx'));
const PurchaseOrderCreatePage = lazy(() => import('./modules/alat/pages/PurchaseOrderCreatePage.jsx'));
const PurchaseOrderDetailPage = lazy(() => import('./modules/alat/pages/PurchaseOrderDetailPage.jsx'));
const KasPage = lazy(() => import('./modules/alat/pages/KasPage.jsx'));
const KasClaimPendapatanPage = lazy(() => import('./modules/alat/pages/KasClaimPendapatanPage.jsx'));
const ProjectWorkspacePage = lazy(() => import('./modules/admin/project/pages/ProjectWorkspacePage.jsx'));
const SupplyWorkspacePage = lazy(() => import('./modules/admin/supply/pages/SupplyWorkspacePage.jsx'));
const RentalWorkspacePage = lazy(() => import('./modules/admin/rental/pages/RentalWorkspacePage.jsx'));
const IncomeWorkspacePage = lazy(() => import('./modules/admin/income/pages/IncomeWorkspacePage.jsx'));
const ApprovalWorkspacePage = lazy(() => import('./modules/admin/approvals/pages/ApprovalWorkspacePage.jsx'));
const FilesWorkspacePage = lazy(() => import('./modules/admin/files/pages/FilesWorkspacePage.jsx'));
const FieldWorkspacePage = lazy(() => import('./modules/lapangan/pages/FieldWorkspacePage.jsx'));

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
    route === 'alat/items/register' ||
    /^\/alat\/items\/\d+\/?$/.test(`/${route}`) ||
    route === 'alat/information' ||
    route === 'alat/information/create' ||
    /^\/alat\/information\/\d+\/?$/.test(`/${route}`) ||
    /^alat\/information\/\d+\/edit\/?$/.test(route) ||
    route === 'alat/maintenance' ||
    route === 'alat/maintenance/thresholds' ||
    /^alat\/maintenance\/reset\/\d+\/?$/.test(route) ||
    route === 'alat/purchase-orders' ||
    route === 'alat/purchase-orders/create' ||
    /^alat\/purchase-orders\/\d+\/?$/.test(route) ||
    route === 'alat/kas' ||
    route === 'alat/kas/claim-pendapatan' ||
    route === 'alat/kas/request-pendapatan' ||
    parseProjectRoute(route) !== null ||
    parseSupplyRoute(route) !== null ||
    parseRentalRoute(route) !== null ||
    parseIncomeRoute(route) !== null ||
    parseApprovalRoute(route) !== null ||
    parseFilesRoute(route) !== null ||
    parseFieldRoute(route) !== null;
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
  if (route === 'alat/items/register') return <RegisterItemPage onBackToItems={() => navigate('alat/items')} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (route.startsWith('alat/items/')) return <ItemDetailPage key={route} itemId={route.split('/')[2]} onBackToItems={() => navigate('alat/items')} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (route === 'alat/information') return <InformationPage onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (route === 'alat/information/create') return <DamageLogFormPage onBack={() => navigate('alat/information')} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (route.startsWith('alat/information/') && route.endsWith('/edit')) {
    const logId = route.split('/')[2];
    return <DamageLogFormPage key={route} logId={logId} onBack={() => navigate('alat/information')} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  }
  if (route.startsWith('alat/information/')) {
    const logId = route.split('/')[2];
    return <DamageLogDetailPage key={route} logId={logId} onBack={() => navigate('alat/information')} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  }
  if (route === 'alat/maintenance')
    return (
      <MaintenancePage
        key={route}
        initialNotice={maintenanceNotice}
        onNavigateToReset={(unitId) => navigate(`alat/maintenance/reset/${unitId}`)}
         onNavigateToThresholds={() => navigate('alat/maintenance/thresholds')}
        onBackToModules={() => navigate('modules')}
        onSignOut={signOut}
      />
    );
  if (route === 'alat/maintenance/thresholds')
    return <MaintenanceThresholdPage onBack={() => navigate('alat/maintenance')} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
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
    return <PurchaseOrderPage key={route} onBackToModules={() => navigate('modules')} onSignOut={signOut} onViewDetails={(order) => navigate(`alat/purchase-orders/${order.id}`)} />;
  if (route === 'alat/purchase-orders/create')
    return <PurchaseOrderCreatePage key={route} onBackToModules={() => navigate('modules')} onBackToPurchaseOrders={() => navigate('alat/purchase-orders')} onSignOut={signOut} />;
  if (route.startsWith('alat/purchase-orders/')) {
    const poId = route.split('/')[2];
    return <PurchaseOrderDetailPage key={route} orderId={poId} onBack={() => navigate('alat/purchase-orders')} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  }
  if (route === 'alat/kas')
    return <KasPage key={route} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  // Satu instance untuk seluruh rute admin/projects/* supaya pohon project dan
  // cache tahapan tidak dimuat ulang setiap kali pindah halaman.
  // Divisi Lapangan memakai halaman Project & Rental yang sama, dengan menu sendiri.
  const layoutProps = route.startsWith('lapangan/') ? { Layout: FieldLayout } : {};
  if (parseProjectRoute(route))
    return <ProjectWorkspacePage {...layoutProps} route={route} onNavigate={navigate} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (parseSupplyRoute(route))
    return <SupplyWorkspacePage route={route} onNavigate={navigate} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (parseRentalRoute(route))
    return <RentalWorkspacePage {...layoutProps} route={route} onNavigate={navigate} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (parseIncomeRoute(route))
    return <IncomeWorkspacePage route={route} onNavigate={navigate} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (parseApprovalRoute(route))
    return <ApprovalWorkspacePage route={route} onNavigate={navigate} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (parseFieldRoute(route))
    return <FieldWorkspacePage route={route} onNavigate={navigate} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (parseFilesRoute(route))
    return <FilesWorkspacePage route={route} onNavigate={navigate} onBackToModules={() => navigate('modules')} onSignOut={signOut} />;
  if (route === 'alat/kas/claim-pendapatan' || route === 'alat/kas/request-pendapatan')
    return <KasClaimPendapatanPage key={route} onBackToModules={() => navigate('modules')} onBackToKas={() => navigate('alat/kas')} onSignOut={signOut} />;

  return <AppLoading />;
}

