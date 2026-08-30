import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
// A dialog that asks for input should start in the input, not on its close button.
const FIELD = 'input:not([disabled]),select:not([disabled]),textarea:not([disabled])';

/**
 * Keeps keyboard focus inside `ref` while `active`, closes on Escape, and
 * returns focus to whatever was focused before the trap opened.
 */
export function useFocusTrap(ref, { active, onEscape }) {
  // Held in a ref, not a dependency: callers pass `onClose={() => …}`, a new
  // function on every render. As a dependency it re-ran the whole effect on each
  // keystroke, stealing focus back to the first element in the dialog.
  const escapeRef = useRef(onEscape);
  useEffect(() => { escapeRef.current = onEscape; }, [onEscape]);

  useEffect(() => {
    if (!active) return undefined;
    const opener = document.activeElement;
    const node = ref.current;
    (node?.querySelector(FIELD) || node?.querySelector(FOCUSABLE) || node)?.focus?.();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); escapeRef.current?.(); return; }
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
  }, [ref, active]);
}
