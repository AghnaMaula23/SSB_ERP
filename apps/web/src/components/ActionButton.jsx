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

export default function ActionButton({ kind = 'view', label, onClick, disabled = false, tone = 'default', className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-ghost px-2 py-1 text-xs ${TONES[tone] || TONES.default} ${className}`}
      aria-label={label}
      title={label}
    >
      {SYMBOLS[kind] || kind}
    </button>
  );
}
