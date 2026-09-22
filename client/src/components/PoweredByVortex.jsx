import { useLanguage } from '../hooks/useLanguage';

/**
 * The maker's mark, bottom left.
 *
 * Set the way Vortex sets it: the emblem *is* the V, and the word continues
 * from it — "ortex" — so the two read as one word rather than a logo with a
 * label beside it. The emblem therefore sits tight against the text with no
 * gap, and the type keeps one weight across the join.
 *
 * Two grounds, because "bottom left" means different furniture on different
 * screens. Signed in, the bottom left of the page is the sidebar's dark
 * footer, so `tone="dark"` sits there in the flow. On the auth screens there
 * is no sidebar, so the default floats over the page, clear of the phone's
 * gesture bar. A third, smaller copy (`size="sm"`, not floating) closes the
 * page foot under the social accounts, where it is also seen on a phone,
 * whose sidebar is hidden.
 *
 * Deliberately low-contrast either way: a supplier's mark should be findable,
 * not competing with the institution's own branding.
 */
// Two sizes of the same lockup: the emblem and the word scale together so
// the V still reads as the first letter of "ortex".
const SIZES = {
  md: { label: 'text-[10px]', mark: 'h-[17px] w-[17px]', word: 'text-[13px]', gap: 'gap-1.5' },
  sm: { label: 'text-[9px]', mark: 'h-[13px] w-[13px]', word: 'text-[11px]', gap: 'gap-1' },
};

/**
 * `floating` pins the light version to the bottom corner (the auth screens);
 * without it, the light version sits in the page flow — under the social
 * accounts at the foot of every page.
 */
export default function PoweredByVortex({ tone = 'light', size = 'md', floating = tone === 'light', className = '' }) {
  const { t } = useLanguage();
  const dark = tone === 'dark';
  const s = SIZES[size] || SIZES.md;

  const inner = (
    <>
      <span className={`${s.label} font-medium tracking-wide`}>{t('common.poweredBy')}</span>
      {/* No gap: the emblem is the V that "ortex" continues from. */}
      <span className="inline-flex items-center">
        <img
          src="/vortex-mark.png"
          alt=""
          aria-hidden="true"
          className={`-mb-px ${s.mark} shrink-0 object-contain opacity-90 transition-opacity group-hover:opacity-100`}
        />
        <span
          className={`${s.word} font-semibold tracking-tight transition-colors ${
            dark
              ? 'text-white/55 group-hover:text-white'
              : 'text-surface-500 group-hover:text-surface-800 dark:text-surface-400 dark:group-hover:text-surface-100'
          }`}
        >
          ortex
        </span>
      </span>
    </>
  );

  // The word runs left-to-right in both languages — it is a name, not prose.
  const common = `group inline-flex items-center ${s.gap} transition-colors`;

  if (dark) {
    return (
      <a
        href="https://vortexmind.co"
        target="_blank"
        rel="noopener noreferrer"
        title="vortexmind.co"
        dir="ltr"
        className={`${common} text-white/40 hover:text-white/75 ${className}`}
      >
        {inner}
      </a>
    );
  }

  if (!floating) {
    return (
      <a
        href="https://vortexmind.co"
        target="_blank"
        rel="noopener noreferrer"
        title="vortexmind.co"
        dir="ltr"
        className={`${common} text-surface-400 hover:text-surface-600 dark:text-surface-500 dark:hover:text-surface-300 ${className}`}
      >
        {inner}
      </a>
    );
  }

  return (
    <a
      href="https://vortexmind.co"
      target="_blank"
      rel="noopener noreferrer"
      title="vortexmind.co"
      dir="ltr"
      className={`${common} fixed bottom-0 start-0 z-30 rounded-se-lg bg-white/70 px-3 py-1.5
                  text-surface-400 backdrop-blur-sm hover:text-surface-700
                  dark:bg-surface-900/70 dark:text-surface-500 dark:hover:text-surface-200 ${className}`}
      style={{ paddingBottom: 'calc(0.375rem + var(--safe-bottom))' }}
    >
      {inner}
    </a>
  );
}
