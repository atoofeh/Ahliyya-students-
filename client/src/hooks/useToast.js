import { createContext, useContext } from 'react';

/** Context for the toast provider. Kept out of the provider file so it can fast-refresh. */
export const ToastContext = createContext(null);

/** toast(message, type), plus success/error/info shorthands. */
export const useToast = () => useContext(ToastContext);
