import { createContext, useContext } from 'react';

/** Context for the theme provider. Kept out of the provider file so it can fast-refresh. */
export const ThemeContext = createContext(null);

/** Current theme ('light' | 'dark' | 'system'), the resolved isDark flag and the cycle action. */
export const useTheme = () => useContext(ThemeContext);
