const SYMBOLS = {
  view: '↗',
  edit: '✎',
  approve: '✓',
  resolve: '✓',
  reject: '✕',
  cancel: '✕',
  delete: '🗑',
  settings: '⚙',
  download: '↓',
  add: '+',
  save: '✓',
  back: '←',
  reset: '↺',
};

const TONES = {
  default: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  success: 'text-emerald-600 hover:bg-emerald-50',
  danger: 'text-red-600 hover:bg-red-50',
  primary: 'text-teal-700 hover:bg-teal-50',
};

/**
 * Tombol aksi berbasis simbol. `showLabel` menampilkan teks di samping simbol —
 * dipakai untuk aksi utama halaman karena tooltip tidak muncul di layar sentuh.
 */
export default function ActionButton({ kind = 'view', label, onClick, disabled = false, tone = 'default', className = '', showLabel = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-ghost min-h-8 min-w-8 py-1 text-xs ${showLabel ? 'px-3' : 'px-2'} ${TONES[tone] || TONES.default} ${className}`}
      aria-label={showLabel ? undefined : label}
      title={label}
    >
      <span aria-hidden={showLabel ? 'true' : undefined}>{SYMBOLS[kind] || kind}</span>
      {showLabel && <span>{label}</span>}
    </button>
  );
}
