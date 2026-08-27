/**
 * Students_Alahliyya brand mark — vector recreation of the official logo
 * (graduation cap over an open book) so it renders crisp at every size and
 * adapts to light/dark surfaces.
 */
export function LogoMark({ size = 40, tone = 'navy', className = '' }) {
  const fill = tone === 'white' ? '#FFFFFF' : tone === 'gold' ? '#C9A648' : '#16406F';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      {/* Cap board */}
      <path d="M32 8 L56 19.5 L32 31 L8 19.5 Z" fill={fill} />
      {/* Cap base */}
      <path d="M22.5 26.5 L22.5 33 C22.5 36.4 41.5 36.4 41.5 33 L41.5 26.5 L32 31.2 Z" fill={fill} />
      {/* Highlight slit on cap (negative space) */}
      <path d="M31 20.5 L34.5 22.2 L34.5 30 L31 28.3 Z" fill={tone === 'white' ? 'rgba(22,64,111,0.35)' : 'rgba(255,255,255,0.85)'} />
      {/* Tassel */}
      <path d="M55 20 L55 29" stroke={fill} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="55" cy="31.4" r="2.6" fill={fill} />
      {/* Open book — left wing */}
      <path d="M30.5 51.5 C26 42.5 15.5 37.5 6.5 39.5 C4.2 44.5 8.2 52 16 54.6 C22 56.6 28 55 30.5 51.5 Z" fill={fill} />
      {/* Open book — right wing */}
      <path d="M33.5 51.5 C38 42.5 48.5 37.5 57.5 39.5 C59.8 44.5 55.8 52 48 54.6 C42 56.6 36 55 33.5 51.5 Z" fill={fill} />
      {/* Inner page lines */}
      <path d="M29 49 C25.5 43.5 18.5 40 12 40.8" stroke={tone === 'white' ? 'rgba(22,64,111,0.35)' : 'rgba(255,255,255,0.7)'} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M35 49 C38.5 43.5 45.5 40 52 40.8" stroke={tone === 'white' ? 'rgba(22,64,111,0.35)' : 'rgba(255,255,255,0.7)'} strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
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
