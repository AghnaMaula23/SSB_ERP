import { useEffect, useRef, useState } from 'react';
import { getActivities, getUnreadCount, markAllRead } from '../../../services/activityLogService.js';

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

const moduleIcon = (module) => ({
  Information: '📋',
  'Purchase Order': '🛒',
  Maintenance: '🛠️',
  Kas: '💳',
  Items: '📦',
}[module] || '⚙️');

const timeAgo = (iso) => {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(diffMinutes)) return '-';
  if (diffMinutes < 1) return 'Baru saja';
  if (diffMinutes < 60) return `${diffMinutes} menit lalu`;
  if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)} jam lalu`;
  return `${Math.round(diffMinutes / 1440)} hari lalu`;
};

export default function AlatHeader({ collapsed, onToggle, user: userProp }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [activities, setActivities] = useState([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef(null);
  const user = userProp || readUser();
  const displayName = user.fullName || user.username || 'ERP User';
  const role = user.roles?.[0] || 'Authorized Personnel';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'EU';

  useEffect(() => {
    if (!panelOpen) return undefined;
    const refresh = () => { setActivities(getActivities()); setUnread(getUnreadCount()); };
    refresh();
    const handleOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) setPanelOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.clearInterval(timer);
    };
  }, [panelOpen]);

  const handleTogglePanel = () => {
    setPanelOpen((open) => {
      if (!open) markAllRead();
      return !open;
    });
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 flex h-16 items-center border-b border-slate-200 bg-white/95 px-4 shadow-xs backdrop-blur transition-[left] duration-300 ${
        collapsed ? 'lg:left-20' : 'lg:left-64'
      }`}
    >
      <div className="flex w-10 shrink-0 items-center lg:w-60">
        <button
          type="button"
          onClick={onToggle}
          className="mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Toggle navigation"
        >
          ☰
        </button>
        <span className="hidden text-xl font-bold tracking-tight text-slate-900 lg:block">ConstructERP</span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={handleTogglePanel}
            aria-expanded={panelOpen}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Aktivitas akun"
            title="Aktivitas akun"
          >
            🔔
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {panelOpen && (
            <div className="absolute right-0 top-11 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">Aktivitas Akun Ini</p>
                  <p className="text-[11px] text-slate-500">{displayName} · {role}</p>
                </div>
                <button type="button" onClick={() => { markAllRead(); setActivities(getActivities()); setUnread(0); }} className="text-[11px] font-semibold text-teal-700 hover:underline">
                  Tandai dibaca
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {activities.length > 0 ? activities.map((entry) => (
                  <div key={entry.id} className={`flex gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${entry.read ? '' : 'bg-teal-50/40'}`}>
                    <span className="mt-0.5 text-base">{moduleIcon(entry.module)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-900">{entry.action}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{entry.description || entry.module}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{entry.module} · {timeAgo(entry.at)}</p>
                    </div>
                  </div>
                )) : (
                  <p className="px-4 py-8 text-center text-xs text-slate-500">Belum ada aktivitas tercatat.</p>
                )}
              </div>
              <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">Log aktivitas disimpan di browser (endpoint activity belum tersedia).</p>
            </div>
          )}
        </div>

        <div className="ml-2 hidden border-l border-slate-200 pl-3 text-right md:block">
          <p className="text-xs font-bold text-slate-900">{displayName}</p>
          <p className="text-[11px] font-medium text-slate-500">{role}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white shadow-xs">
          {initials}
        </div>
      </div>
    </header>
  );
}
