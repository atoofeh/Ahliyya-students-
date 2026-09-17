import { Languages } from 'lucide-react';
import { useLanguage, LANGUAGES } from '../hooks/useLanguage';

/**
 * Two languages, one control.
 *
 * A switch rather than a dropdown: with exactly two choices a menu is one more
 * tap for no information. Each side is labelled in its own script, so a student
 * who cannot read the current language can still find the other one — which is
 * the whole point of a language control.
 */
export default function LanguageToggle({ className = '' }) {
  const { lang, setLang, t } = useLanguage();

  return (
    <div
      className={`inline-flex items-center rounded-lg bg-surface-100 p-0.5 dark:bg-surface-800 ${className}`}
      role="group"
      aria-label={t('lang.switchTo')}
    >
      <Languages size={14} className="mx-1.5 shrink-0 text-surface-400" aria-hidden="true" />
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          lang={l.code}
          title={l.label}
          className={`min-w-[2rem] rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
            lang === l.code
              ? 'bg-white text-brand-700 shadow-sm dark:bg-surface-700 dark:text-brand-300'
              : 'text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200'
          }`}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
