import { useState, useEffect, useMemo, useCallback } from 'react';
import { LanguageContext, DICTIONARIES, dirOf } from '../hooks/useLanguage';

const STORAGE_KEY = 'lms_lang';

const readStored = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTIONARIES[saved]) return saved;
  } catch { /* private mode — fall through to the default */ }
  // A phone set to Arabic opens in Arabic, without anyone having to find the toggle.
  try {
    if (typeof navigator !== 'undefined' && /^ar\b/i.test(navigator.language || '')) return 'ar';
  } catch { /* no navigator */ }
  return 'en';
};

/**
 * Language, and the direction that comes with it.
 *
 * Arabic reads right to left, so choosing it is not only a matter of words:
 * `dir` on the document flips the whole layout, and the choice is remembered
 * so nobody has to set it again on every visit.
 */
export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStored);
  const dir = dirOf(lang);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', lang);
    root.setAttribute('dir', dir);
  }, [lang, dir]);

  const setLang = useCallback((next) => {
    if (!DICTIONARIES[next]) return;
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* choice lasts the session only */ }
  }, []);

  const t = useCallback((key, vars) => {
    const raw = DICTIONARIES[lang]?.[key] ?? DICTIONARIES.en[key] ?? key;
    if (!vars) return raw;
    return Object.keys(vars).reduce((s, k) => s.replaceAll(`{${k}}`, String(vars[k])), raw);
  }, [lang]);

  const value = useMemo(() => ({ lang, dir, setLang, t }), [lang, dir, setLang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
