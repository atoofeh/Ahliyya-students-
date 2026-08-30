/**
 * Students_Alahliyya brand mark — the institution's own artwork (the graduation
 * cap over an open book), exported white and navy so it sits correctly on both
 * dark and light surfaces. The same mark is the Android launcher icon, the
 * splash screen and the browser tab icon, so the platform shows one logo
 * everywhere rather than a redrawn approximation.
 *
 * The mark is wider than it is tall, so `size` sets its width and the height
 * follows the artwork.
 */
const MARK = {
  white: '/logo-mark-white.png',
  navy: '/logo-mark-navy.png',
};

export function LogoMark({ size = 40, tone = 'navy', className = '' }) {
  return (
    <img
      src={MARK[tone] || MARK.navy}
      width={size}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ width: size, height: 'auto' }}
    />
  );
}

/**
 * Full lockup: mark + wordmark + tagline.
 * tone: 'navy' (light surfaces) | 'white' (navy surfaces)
 */
export default function Logo({ size = 'md', tone = 'navy', tagline = true, className = '' }) {
  const dims = { sm: { mark: 30, word: 'text-sm', tag: 'text-[8.5px]' }, md: { mark: 40, word: 'text-lg', tag: 'text-[10px]' }, lg: { mark: 64, word: 'text-2xl', tag: 'text-xs' } }[size];
  const wordColor = tone === 'white' ? 'text-white' : 'text-brand-800 dark:text-white';
  const tagColor = tone === 'white' ? 'text-gold-300' : 'text-gold-600 dark:text-gold-400';

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={dims.mark} tone={tone} />
      <div className="leading-none">
        <div className={`font-display font-extrabold tracking-wide ${dims.word} ${wordColor}`}>
          STUDENTS<span className={tagColor}>_</span>ALAHLIYYA
        </div>
        {tagline && (
          <div className={`mt-1 flex items-center gap-1.5 font-semibold uppercase tracking-[0.28em] ${dims.tag} ${tagColor}`}>
            <span className={`h-px flex-1 ${tone === 'white' ? 'bg-white/25' : 'bg-brand-200 dark:bg-white/20'}`} />
            Rise to Excellence
            <span className={`h-px flex-1 ${tone === 'white' ? 'bg-white/25' : 'bg-brand-200 dark:bg-white/20'}`} />
          </div>
        )}
      </div>
    </div>
  );
}
