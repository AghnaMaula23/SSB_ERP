import { useEffect, useRef, useState } from 'react';
import { getActivities, getUnreadCount, markAllRead } from '../services/activityLogService.js';

const moduleIcon = (module) => ({
  Information: '📋',
  'Purchase Order': '🛒',
  Maintenance: '🛠️',
  Kas: '💳',
  Items: '📦',
  Project: '🏗️',
  Supply: '🚚',
  Rental: '🛠️',
  Income: '📊',
  Approvals: '✅',
  Files: '📁',
}[module] || '⚙️');

const timeAgo = (iso) => {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(diffMinutes)) return '-';
  if (diffMinutes < 1) return 'Baru saja';
  if (diffMinutes < 60) return `${diffMinutes} menit lalu`;
  if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)} jam lalu`;
  return `${Math.round(diffMinutes / 1440)} hari lalu`;
};

/**
 * Lonceng aktivitas — dipakai di header semua divisi supaya notifikasi &
 * "apa saja yang saya lakukan" punya perilaku dan tampilan yang sama.
 */
export default function ActivityBell({ align = 'right' }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [activities, setActivities] = useState([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef(null);

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

  const handleToggle = () => {
    setPanelOpen((open) => {
      if (!open) markAllRead();
      return !open;
    });
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={panelOpen}
        aria-label="Aktivitas akun"
        title="Aktivitas akun"
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
      >
        🔔
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {panelOpen && (
        <div className={`absolute top-12 z-40 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Aktivitas Akun Ini</p>
              <p className="text-[11px] text-slate-500">Semua yang pernah kamu lakukan di sistem</p>
            </div>
            <button type="button" onClick={() => { markAllRead(); setActivities(getActivities()); setUnread(0); }} className="text-[11px] font-semibold text-teal-700 hover:underline">
              Tandai dibaca
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto overscroll-contain">
            {activities.length > 0 ? activities.map((entry) => (
              <div key={entry.id} className={`flex gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${entry.read ? '' : 'bg-teal-50/40'}`}>
                <span className="mt-0.5 text-base" aria-hidden="true">{moduleIcon(entry.module)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900">{entry.action}</p>
                  {entry.description && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{entry.description}</p>}
                  <p className="mt-0.5 text-[10px] text-slate-400">{entry.module} · {timeAgo(entry.at)}</p>
                </div>
              </div>
            )) : (
              <p className="px-4 py-10 text-center text-xs text-slate-500">Belum ada aktivitas tercatat.</p>
            )}
          </div>
          <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">Log aktivitas disimpan di browser (endpoint activity belum tersedia).</p>
        </div>
      )}
    </div>
  );
}
