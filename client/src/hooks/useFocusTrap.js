import { useEffect } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside `ref` while `active`, closes on Escape, and
 * returns focus to whatever was focused before the trap opened.
 */
export function useFocusTrap(ref, { active, onEscape }) {
  useEffect(() => {
    if (!active) return undefined;
    const opener = document.activeElement;
    const node = ref.current;
    const first = node?.querySelector(FOCUSABLE);
    (first || node)?.focus?.();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onEscape?.(); return; }
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [ref, active, onEscape]);
}
