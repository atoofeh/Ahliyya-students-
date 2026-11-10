import { createContext, useContext } from 'react';

/**
 * Context for the confirm provider. Kept out of the provider file so that file
 * can fast-refresh, the same arrangement the toast and theme hooks use.
 */
export const ConfirmContext = createContext(null);

/**
 * Ask before doing something that cannot be undone.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm(t('vid.confirmDelete')))) return;
 *
 * Resolves true only when the person presses the confirming button; closing the
 * dialog, pressing Escape and the Android back button all resolve false. Takes
 * a message, or `{ title, message, confirmLabel, tone }` when the default
 * wording is not enough.
 *
 * This replaced `window.confirm`, which blocks the whole web view, cannot be
 * translated, cannot be read right-to-left, and inside the app announces itself
 * with the server's hostname as though the page were a stranger.
 */
export const useConfirm = () => useContext(ConfirmContext);
