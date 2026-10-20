import AppHeader from '../../../components/AppHeader.jsx';

/**
 * Header Divisi Alat memakai header bersama supaya tampilan, lonceng
 * aktivitas, dan blok user identik dengan divisi lain.
 */
export default function AlatHeader({ collapsed, onToggle, user: userProp }) {
  return (
    <AppHeader
      collapsed={collapsed}
      onToggleMenu={onToggle}
      onBackToModules={() => { window.location.hash = '/modules'; }}
      user={userProp}
    />
  );
}
