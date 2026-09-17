import { createContext, useContext } from 'react';
import en from '../i18n/en';
import ar from '../i18n/ar';

export const DICTIONARIES = { en, ar };

export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN', dir: 'ltr' },
  { code: 'ar', label: 'العربية', short: 'ع', dir: 'rtl' },
];

export const dirOf = (code) => (code === 'ar' ? 'rtl' : 'ltr');

export const LanguageContext = createContext({
  lang: 'en',
  dir: 'ltr',
  setLang: () => {},
  t: (key) => key,
});

/**
 * Translation for the current language.
 *
 * `t('some.key')` falls back to English and then to the key itself, so a
 * missing Arabic string shows the English wording rather than a blank or a
 * crash — a half-translated screen is usable, an empty one is not.
 *
 * `t('greeting', { name })` fills {name} placeholders.
 */
export const useLanguage = () => useContext(LanguageContext);
