import { useRef } from 'react';
import AuthedImage from './AuthedImage';

const cx = (...a) => a.filter(Boolean).join(' ');

/**
 * Accessible quiz choices. Single-answer questions are a radiogroup with roving
 * focus and arrow-key selection; multi-answer questions are checkboxes.
 */
export default function ChoiceGroup({ multiple, options, value = [], onChange, name }) {
  const refs = useRef([]);
  const selected = (id) => value.includes(id);

  const toggle = (id) => {
    if (multiple) onChange(selected(id) ? value.filter((v) => v !== id) : [...value, id]);
    else onChange([id]);
  };

  const onKeyDown = (e, i) => {
    const last = options.length - 1;
    let next = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = i === last ? 0 : i + 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
    if (next != null) {
      e.preventDefault();
      refs.current[next]?.focus();
      if (!multiple) toggle(options[next].id);
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(options[i].id); }
  };

  // Roving tabindex: one stop for the whole radiogroup, every checkbox focusable.
  const focusIndex = Math.max(0, options.findIndex((o) => selected(o.id)));

  return (
    <div role={multiple ? 'group' : 'radiogroup'} aria-label={name} className="space-y-2">
      {options.map((o, i) => {
        const on = selected(o.id);
        return (
          <button
            key={o.id}
            type="button"
            ref={(el) => { refs.current[i] = el; }}
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            tabIndex={multiple || i === focusIndex ? 0 : -1}
            onClick={() => toggle(o.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              'flex w-full items-center gap-3 rounded-xl border-2 p-3.5 text-start text-sm transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface-900',
              on
                ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-900/20 dark:text-brand-200'
                : 'border-surface-200 text-surface-700 hover:border-brand-300 dark:border-surface-600 dark:text-surface-200'
            )}
          >
            <span className={cx(
              'flex h-5 w-5 shrink-0 items-center justify-center border-2',
              multiple ? 'rounded-md' : 'rounded-full',
              on ? 'border-brand-500 bg-brand-500' : 'border-surface-300 dark:border-surface-600'
            )}>
              {on && <span className={cx('bg-white', multiple ? 'h-2 w-2.5 rounded-[1px]' : 'h-2 w-2 rounded-full')} />}
            </span>
            {o.image && <AuthedImage fileId={o.image} className="h-20 rounded" />}
            {/* An answer is text someone wrote: it takes its direction from itself. */}
            {o.text && <span dir="auto">{o.text}</span>}
          </button>
        );
      })}
    </div>
  );
}
