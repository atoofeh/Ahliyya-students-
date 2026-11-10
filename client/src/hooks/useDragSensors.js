import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * How a drag starts, kept in one place so every sortable list in the app
 * behaves the same way.
 *
 * A mouse begins dragging as soon as it moves a few pixels. A finger has to
 * hold still for a moment first: without that delay the page could never be
 * scrolled past a list, because the first touch on any row would carry the row
 * away instead of the page. The keyboard sensor is what replaced the up and
 * down arrow buttons — focus a handle, then Space and the arrow keys move the
 * row, so reordering never depended on being able to drag.
 */
export const useDragSensors = () => useSensors(
  useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);

/** The transform dnd-kit hands a moving row, as a style object. */
export const dragStyle = (transform, transition) => ({
  transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  transition,
});
