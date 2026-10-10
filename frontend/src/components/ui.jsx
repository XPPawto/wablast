// Primitif UI kecil yang dipakai seluruh halaman.
import { Loader2, X, Inbox as InboxIcon } from 'lucide-react';

const TONES = {
  green: 'bg-wa-100 text-wa-700', yellow: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-700',
  blue: 'bg-sky-100 text-sky-800', gray: 'bg-surface text-ink-600 border border-line', violet: 'bg-violet-100 text-violet-800',
};
export const Badge = ({ tone = 'gray', children }) => (
  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>
);

/** Peta status → [label, warna]. Dipakai untuk kampanye, log pesan, dan template. */
export const STATUS = {
  draft: ['Draft', 'gray'], scheduled: ['Terjadwal', 'blue'], running: ['Berjalan', 'green'], paused: ['Dijeda', 'yellow'],
  completed: ['Selesai', 'green'], failed: ['Gagal', 'red'], cancelled: ['Dibatalkan', 'gray'],
  queued: ['Antre', 'gray'], sending: ['Mengirim', 'blue'], sent: ['Terkirim', 'blue'], delivered: ['Sampai', 'green'], read: ['Dibaca', 'violet'],
  APPROVED: ['Approved', 'green'], PENDING: ['Menunggu review', 'yellow'], REJECTED: ['Ditolak', 'red'], PAUSED: ['Dijeda', 'yellow'], DISABLED: ['Nonaktif', 'gray'],
};
export const StatusBadge = ({ status }) => {
  const [label, tone] = STATUS[status] || [status, 'gray'];
  return <Badge tone={tone}>{status === 'running' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-wa-600" />}{label}</Badge>;
};

export const Spinner = ({ className = '' }) => <Loader2 className={`h-4 w-4 animate-spin ${className}`} />;

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-1 max-w-xl text-sm text-ink-600">{subtitle}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
);

export const EmptyState = ({ icon: Icon = InboxIcon, title, children, action }) => (
  <div className="flex flex-col items-center px-6 py-14 text-center">
    <Icon className="mb-3 h-9 w-9 text-ink-300" />
    <p className="font-display text-lg font-medium">{title}</p>
    {children && <p className="mt-1 max-w-sm text-sm text-ink-600">{children}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ProgressBar = ({ value, tone = 'bg-wa-500', className = 'h-2' }) => (
  <div className={`w-full overflow-hidden rounded-full bg-surface ${className}`}>
    <div className={`h-full rounded-full transition-all duration-500 ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
  </div>
);

export const ErrorNote = ({ error }) =>
  error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error.message || String(error)}</div> : null;

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:rounded-xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-ink-600 hover:bg-surface" aria-label="Tutup"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/** Input tag: ketik lalu Enter/koma untuk menambah. Tampil sebagai #tag. */
export function TagInput({ value, onChange, placeholder = 'Ketik tag lalu Enter' }) {
  const add = (raw) => {
    const t = raw.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
    if (t && !value.includes(t)) onChange([...value, t]);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-white px-2 py-1.5 focus-within:border-wa-500 focus-within:ring-2 focus-within:ring-wa-500/20">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded bg-wa-100 px-2 py-0.5 text-xs font-medium text-wa-700">
          #{t}<button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Hapus ${t}`}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input className="min-w-[8rem] flex-1 border-0 bg-transparent p-1 text-sm outline-none" placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(e.target.value); e.target.value = ''; }
          else if (e.key === 'Backspace' && !e.target.value && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={(e) => { add(e.target.value); e.target.value = ''; }} />
    </div>
  );
}
