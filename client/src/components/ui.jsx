import { useEffect, useRef, useState } from 'react';
import { Loader2, X, Inbox, Eye, EyeOff } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useLanguage } from '../hooks/useLanguage';
import { pushBackHandler } from '../app/shell';

/**
 * Students_Alahliyya design system primitives.
 * Navy + champagne-gold identity, layered soft shadows, dark-mode aware.
 */

const cx = (...args) => args.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', loading, className = '', children, ...props }) {
  const variants = {
    primary: cx(
      'bg-brand-gradient text-white shadow-card sheen',
      'hover:shadow-glow hover:brightness-110 active:brightness-95'
    ),
    gold: cx(
      'bg-gold-gradient text-brand-950 font-semibold shadow-card',
      'hover:shadow-gold-glow hover:brightness-105 active:brightness-95'
    ),
    secondary: cx(
      'bg-surface-100 text-surface-800 dark:bg-surface-800 dark:text-surface-100',
      'hover:bg-surface-200 dark:hover:bg-surface-700'
    ),
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-card',
    ghost: 'text-surface-600 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800',
    outline: cx(
      'border border-surface-300 text-surface-700 dark:border-surface-600 dark:text-surface-200',
      'hover:border-brand-400 hover:text-brand-700 dark:hover:border-brand-500 dark:hover:text-brand-300',
      'hover:bg-brand-50/60 dark:hover:bg-brand-900/20'
    ),
  };
  // lg is the primary action on the auth screens; on a phone it wants a full
  // thumb-sized target, so it grows there and keeps its desktop height at sm:.
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-4 py-2.5 text-sm rounded-xl sm:py-2',
    lg: 'px-6 py-3.5 text-base rounded-xl sm:py-2.5 sm:text-[15px]',
  };
  return (
    <button
      className={cx(
        'relative inline-flex items-center justify-center gap-2 font-medium transition-all duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface-950',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100',
        variants[variant], sizes[size], className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className = '', hover = false, children, ...props }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-surface-200/80 bg-white shadow-card',
        'dark:border-surface-700/60 dark:bg-surface-900',
        hover && 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-brand-200 dark:hover:border-brand-700/60',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

const fieldBase = cx(
  // 16px text and a taller box on phones: easier to hit, and browsers do not
  // zoom the page when a sub-16px field takes focus. Desktop is unchanged.
  'w-full rounded-xl border bg-white px-3.5 py-3 text-base sm:py-2.5 sm:text-sm',
  'text-surface-900 transition-shadow duration-150',
  'placeholder:text-surface-400 dark:bg-surface-950/60 dark:text-surface-100',
  'focus:outline-none focus:ring-2 focus:ring-brand-500/70 focus:border-brand-400'
);

export function Input({ label, error, hint, className = '', ...props }) {
  // Password fields get a reveal toggle. Typing a password blind on a phone
  // keyboard is the most common cause of a failed sign-in, so every password
  // field in the app gets this by virtue of using Input.
  const isPassword = props.type === 'password';
  const [revealed, setRevealed] = useState(false);

  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-[13px] font-semibold text-surface-700 dark:text-surface-200">{label}</span>}
      <span className={isPassword ? 'relative block' : undefined}>
        <input
          {...props}
          type={isPassword && revealed ? 'text' : props.type}
          className={cx(
            fieldBase,
            error ? 'border-rose-400' : 'border-surface-300 dark:border-surface-700',
            // Room for the toggle so long passwords never run under it.
            isPassword && 'pe-11',
            className
          )}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            // Keep it out of the tab order: Tab should go from the field to the
            // submit button, not detour through a display option.
            tabIndex={-1}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-xl text-surface-400 transition-colors hover:text-surface-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:text-surface-200"
          >
            {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </span>
      {hint && !error && <span className="mt-1 block text-xs text-surface-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-500">{error}</span>}
    </label>
  );
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-[13px] font-semibold text-surface-700 dark:text-surface-200">{label}</span>}
      <textarea
        className={cx(fieldBase, 'min-h-[96px]', error ? 'border-rose-400' : 'border-surface-300 dark:border-surface-700', className)}
        {...props}
      />
      {error && <span className="mt-1 block text-xs text-rose-500">{error}</span>}
    </label>
  );
}

export function Select({ label, options = [], hint, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-[13px] font-semibold text-surface-700 dark:text-surface-200">{label}</span>}
      <select className={cx(fieldBase, 'border-surface-300 dark:border-surface-700 pe-8', className)} {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-xs text-surface-400">{hint}</span>}
    </label>
  );
}

export function Toggle({ label, checked, onChange, hint }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div>
        <div className="text-sm font-medium text-surface-700 dark:text-surface-200">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-surface-400">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand-600 shadow-inner' : 'bg-surface-300 dark:bg-surface-700'
        )}
      >
        <span className={cx(
          'absolute start-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
          // The knob travels toward the end of the line, whichever way that runs.
          checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
        )} />
      </button>
    </div>
  );
}

const badgeColors = {
  gray: 'bg-surface-100 text-surface-600 ring-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:ring-surface-700',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800',
  red: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800',
  primary: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-800',
  gold: 'bg-gold-50 text-gold-700 ring-gold-200 dark:bg-gold-900/30 dark:text-gold-300 dark:ring-gold-700/50',
};

export function Badge({ color = 'gray', children, className = '' }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', badgeColors[color], className)}>
      {children}
    </span>
  );
}

export function Spinner({ full }) {
  const spinner = (
    <div className="relative">
      <Loader2 className="animate-spin text-brand-500" size={full ? 38 : 22} />
    </div>
  );
  if (full) return <div className="flex h-64 items-center justify-center">{spinner}</div>;
  return spinner;
}

export function Modal({ open, onClose, title, children, wide }) {
  const { t } = useLanguage();
  const panelRef = useRef(null);
  useFocusTrap(panelRef, { active: open, onEscape: onClose });
  // Android back closes the dialog instead of leaving the page behind it.
  useEffect(() => (open ? pushBackHandler(onClose) : undefined), [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cx(
          'relative w-full rounded-2xl bg-white shadow-float dark:bg-surface-900 dark:border dark:border-surface-700/60',
          'animate-scale-in max-h-[90vh] overflow-y-auto',
          wide ? 'max-w-3xl' : 'max-w-lg'
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-surface-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-surface-700/60 dark:bg-surface-900/95">
          <h3 className="font-display text-[15px] font-bold text-surface-900 dark:text-white">{title}</h3>
          <button onClick={onClose} aria-label={t('common.closeDialog')}
            className="rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-800 dark:hover:text-surface-200">
            <X size={17} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="mb-3.5 rounded-full border-2 border-dashed border-brand-200/80 p-1.5 dark:border-surface-700">
        <div className="rounded-full bg-brand-50 p-4 text-brand-400 dark:bg-surface-800 dark:text-surface-500">
          {icon || <Inbox size={26} />}
        </div>
      </div>
      <p className="font-display font-semibold text-surface-800 dark:text-surface-100">{title}</p>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-surface-400">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({ icon, label, value, sub, progress, color = 'primary' }) {
  const colors = {
    primary: 'bg-brand-50 text-brand-600 dark:bg-brand-900/50 dark:text-brand-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300',
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300',
    gold: 'bg-gold-50 text-gold-600 dark:bg-gold-900/30 dark:text-gold-300',
  };
  return (
    <Card hover className="group relative overflow-hidden p-4">
      <div className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-brand-50/70 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:bg-brand-900/20" />
      <div className="relative flex items-center gap-3.5">
        <div className={cx('rounded-xl p-2.5 transition-transform duration-200 group-hover:scale-105', colors[color])}>{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold uppercase tracking-wider text-surface-400">{label}</p>
          <p className="font-display text-[22px] font-extrabold leading-tight text-surface-900 dark:text-white">{value ?? '—'}</p>
          {sub && <p className="truncate text-xs text-surface-400">{sub}</p>}
        </div>
      </div>
      {progress != null && <ProgressBar value={progress} className="relative mt-3" />}
    </Card>
  );
}

export function ProgressBar({ value = 0, gold = false, className = '' }) {
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-surface-200/80 dark:bg-surface-800', className)}>
      <div
        className={cx('h-full rounded-full transition-all duration-500', gold ? 'bg-gold-gradient' : 'bg-gradient-to-r from-brand-500 to-brand-600')}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-surface-200 dark:border-surface-700/60">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cx(
            '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-all duration-150',
            active === t.key
              ? 'border-gold-500 text-brand-800 dark:text-white'
              : 'border-transparent text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  const { t } = useLanguage();
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-surface-500">
      <span className="rounded-full bg-surface-100 px-3 py-1 text-xs font-semibold text-surface-500 dark:bg-surface-800 dark:text-surface-300">
        {t('common.pageOf', { page: meta.page, total: meta.totalPages, count: meta.total })}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={!meta.hasPrevPage} onClick={() => onPage(meta.page - 1)}>{t('common.previous')}</Button>
        <Button size="sm" variant="outline" disabled={!meta.hasNextPage} onClick={() => onPage(meta.page + 1)}>{t('common.next')}</Button>
      </div>
    </div>
  );
}

export function ConfirmButton({ onConfirm, children, message = 'Are you sure?', variant = 'danger', size = 'sm' }) {
  return (
    <Button variant={variant} size={size} onClick={() => { if (window.confirm(message)) onConfirm(); }}>
      {children}
    </Button>
  );
}

/** Section heading with the brand's gold accent tick — use above card groups. */
export function SectionTitle({ title, subtitle, action, className = '' }) {
  return (
    <div className={cx('mb-3 flex flex-wrap items-end justify-between gap-2', className)}>
      <div className="flex items-center gap-2.5">
        <span className="h-5 w-1 rounded-full bg-gold-gradient" />
        <div>
          <h2 className="font-display text-[15px] font-bold text-surface-900 dark:text-white">{title}</h2>
          {subtitle && <p className="text-xs text-surface-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

const AVATAR_HUES = [
  'bg-brand-600', 'bg-sky-600', 'bg-indigo-600', 'bg-teal-600',
  'bg-gold-600', 'bg-rose-500', 'bg-violet-600', 'bg-emerald-600',
];

/** Initials avatar with a stable per-name hue. */
export function Avatar({ name = '', size = 'md', className = '' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const sizes = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm' };
  return (
    <span className={cx(
      'inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white shadow-inner-top ring-1 ring-white/20',
      AVATAR_HUES[h % AVATAR_HUES.length], sizes[size], className
    )}>
      {initials}
    </span>
  );
}

/** Circular progress ring — clearer than a bar for card corners. */
export function RingProgress({ value = 0, size = 46, stroke = 4, gold = false, className = '' }) {
  const pct = Math.min(100, Math.max(0, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cx('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none"
          className="stroke-surface-200 dark:stroke-surface-700" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round"
          className={gold ? 'stroke-gold-500' : 'stroke-brand-500'}
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
      </svg>
      <span className="absolute text-[10px] font-bold text-surface-700 dark:text-surface-200">{Math.round(pct)}%</span>
    </div>
  );
}

/** Pulsing placeholder block for loading states. */
export function Skeleton({ className = '' }) {
  return <div className={cx('animate-pulse rounded-xl bg-surface-200/70 dark:bg-surface-800', className)} />;
}

/** Quiet page header — the default for every page. */
export function PageIntro({ title, subtitle, actions, className = '' }) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-[22px] font-extrabold tracking-tight text-surface-900 dark:text-white md:text-[26px]"
          style={{ textWrap: 'balance' }}>
          {title}
        </h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-surface-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Gradient header band. Reserved for the student home hero — every other page uses PageIntro. */
export function PageHeader({ title, subtitle, actions, gold = false }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 shadow-float sheen md:p-7">
      <div className="absolute inset-0 bg-brand-radial opacity-70" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-extrabold text-white md:text-2xl">{title}</h1>
          {subtitle && <p className={cx('mt-1 text-sm', gold ? 'text-gold-300' : 'text-brand-100/90')}>{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
