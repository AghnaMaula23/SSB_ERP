import { useEffect, useState } from 'react';
import Login from './pages/Login.jsx';
import ModuleSelection from './pages/ModuleSelection.jsx';
import ItemsPage from './modules/alat/pages/ItemsPage.jsx';
import ItemDetailPage from './modules/alat/pages/ItemDetailPage.jsx';

function getInitialRoute() {
  const route = window.location.hash.replace('#/', '');
  return route || (localStorage.getItem('token') ? 'modules' : 'login');
}

export default function App() {
  const [route, setRoute] = useState(getInitialRoute);

  useEffect(() => {
    const handleHashChange = () => setRoute(getInitialRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (nextRoute) => {
    window.location.hash = `/${nextRoute}`;
    setRoute(nextRoute);
  };

  const isKnownRoute = route === 'login' || route === 'modules' || route === 'alat/items' || route.startsWith('alat/items/');

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
  return null;
}
