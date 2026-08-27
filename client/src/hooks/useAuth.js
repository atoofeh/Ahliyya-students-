import { createContext, useContext } from 'react';

/** Context for the auth provider. Kept out of the provider file so it can fast-refresh. */
export const AuthContext = createContext(null);

/** Session, current user and the login/logout actions. */
export const useAuth = () => useContext(AuthContext);
