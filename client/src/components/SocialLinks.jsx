import { useLanguage } from '../hooks/useLanguage';
import { SOCIAL } from '../utils/social';

/**
 * Tile colour and glyph colour per platform: each brand's own ground, with
 * the glyph in whichever of black or white that brand pairs it with.
 * Instagram is its gradient, because a flat pink is not how anyone knows it.
 */
const TILE = {
  instagram: { bg: 'linear-gradient(45deg, #F58529 0%, #DD2A7B 55%, #8134AF 100%)', fg: '#fff' },
  tiktok: { bg: '#010101', fg: '#fff' },
  snapchat: { bg: '#FFFC00', fg: '#000' },
  facebook: { bg: '#0866FF', fg: '#fff' },
  x: { bg: '#000', fg: '#fff' },
  linktree: { bg: '#43E55E', fg: '#000' },
};

function Glyph({ icon, size = 18, color = 'currentColor' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={icon.path} fill={color} />
    </svg>
  );
}

/**
 * The institute's social accounts.
 *
 * `row` is a quiet line of marks for a footer: grey at rest, the brand's own
 * ground on hover, so it never shouts next to the page it sits under.
 * `grid` is the invitation at the end of the welcome tour: each platform as
 * a tile with its name and handle, big enough to hit with a thumb.
 *
 * Every link opens outside the app and carries no referrer.
 */
export default function SocialLinks({ variant = 'row', className = '' }) {
  const { t } = useLanguage();

  if (variant === 'grid') {
    return (
      // Two across, always: the tour card is narrow, and three columns cut every
      // handle short and broke the longer Arabic names over two lines.
      <ul className={`grid grid-cols-2 gap-2.5 ${className}`}>
        {SOCIAL.map(({ key, url, handle, icon }) => (
          <li key={key}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-full items-center gap-3 rounded-xl border border-surface-200 bg-white p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-surface-300 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-surface-700 dark:bg-surface-800 dark:hover:border-surface-600"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-black/5 dark:ring-white/10"
                style={{ background: TILE[key].bg }}
              >
                <Glyph icon={icon} size={20} color={TILE[key].fg} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-surface-800 dark:text-surface-100">{t(`social.${key}`)}</span>
                <span dir="ltr" className="block truncate text-[11px] text-surface-400">{handle}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {SOCIAL.map(({ key, url, icon }) => {
        const name = t(`social.${key}`);
        return (
          <li key={key}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={name}
              aria-label={t('social.openIn', { name })}
              className="group relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-surface-400 ring-1 ring-surface-200 transition-colors duration-200 hover:text-white hover:ring-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-surface-500 dark:ring-surface-700"
            >
              {/* The brand's ground fades in behind the mark on hover. */}
              <span
                aria-hidden="true"
                className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
                style={{ background: TILE[key].bg }}
              />
              <span className="relative" style={{ color: 'inherit' }}>
                <span className="group-hover:hidden group-focus-visible:hidden"><Glyph icon={icon} size={16} /></span>
                <span className="hidden group-hover:block group-focus-visible:block"><Glyph icon={icon} size={16} color={TILE[key].fg} /></span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
