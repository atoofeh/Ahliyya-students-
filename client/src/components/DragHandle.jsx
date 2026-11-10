import { GripVertical } from 'lucide-react';

/**
 * The grip a row is dragged by — the last control in a row, after delete.
 *
 * `touch-none` is not decoration: without it the browser claims the gesture for
 * scrolling and the row never moves on a phone. The handle is a real button so
 * it can be reached by keyboard, where Space picks the row up and the arrow
 * keys move it.
 */
export default function DragHandle({ attributes, listeners, label, disabled }) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      disabled={disabled}
      aria-label={label}
      className="touch-none cursor-grab rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-surface-800 dark:hover:text-surface-200"
    >
      <GripVertical size={16} aria-hidden="true" />
    </button>
  );
}
