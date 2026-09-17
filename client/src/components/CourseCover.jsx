import {
  FlaskConical, Calculator, Globe2, Palette, Cpu,
  HeartPulse, Scale, Languages, TrendingUp, Music4, GraduationCap,
} from 'lucide-react';

/**
 * Deterministic cover art for courses — no uploaded thumbnails needed.
 * Hashes the course title to one of six navy-family gradient duos and
 * picks a subject glyph from the category, so every course gets a
 * stable, branded visual identity.
 */

const PALETTES = [
  { from: '#1D3F78', to: '#0B1D38', glow: '#5C89C9' },   // brand navy
  { from: '#16406F', to: '#122A4E', glow: '#8AAEDD' },   // deep steel
  { from: '#0E4A5E', to: '#082B38', glow: '#3EA6C4' },   // ocean teal
  { from: '#3A2F6E', to: '#1E1840', glow: '#8B7AE0' },   // indigo violet
  { from: '#6C5421', to: '#3B2D10', glow: '#E0C572' },   // champagne bronze
  { from: '#5A2144', to: '#2E1024', glow: '#C96AA0' },   // royal plum
];

const CATEGORY_ICONS = [
  [/math|calc|algebra|geometr|statistic/i, Calculator],
  [/science|physic|chem|bio|lab/i, FlaskConical],
  [/language|english|arabic|french|عرب/i, Languages],
  [/program|coding|software|computer|web|data|it\b|tech/i, Cpu],
  [/business|finance|econom|account|market/i, TrendingUp],
  [/art|design|draw|photo/i, Palette],
  [/health|medic|nurs|anatomy/i, HeartPulse],
  [/law|legal|right/i, Scale],
  [/music/i, Music4],
  [/geo|history|social|culture|world/i, Globe2],
];

const hashOf = (str = '') => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
};

const coverPalette = (seed) => PALETTES[hashOf(seed) % PALETTES.length];

export default function CourseCover({ title = '', category = '', className = '', iconSize = 34, children }) {
  const p = coverPalette(title);
  const Icon = (CATEGORY_ICONS.find(([re]) => re.test(category || title)) || [null, GraduationCap])[1];

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${p.from} 0%, ${p.to} 100%)` }}
    >
      {/* Glow + geometry */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 85% -20%, ${p.glow}40, transparent 55%),
                       radial-gradient(80% 70% at -10% 110%, ${p.glow}26, transparent 50%)`,
        }}
      />
      <svg className="absolute inset-0 h-full w-full opacity-[0.13]" aria-hidden="true">
        <defs>
          <pattern id={`grid-${hashOf(title) % 7}`} width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M26 0H0V26" fill="none" stroke="white" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-${hashOf(title) % 7})`} />
      </svg>
      <div className="absolute -right-7 -top-9 h-28 w-28 rounded-full border border-white/10" />
      <div className="absolute -right-3 -top-5 h-16 w-16 rounded-full border border-white/15" />

      {/* Subject glyph */}
      <div className="absolute bottom-3 start-4 flex items-center justify-center rounded-xl bg-white/12 p-2.5 shadow-inner-top ring-1 ring-white/20 backdrop-blur-sm">
        <Icon size={iconSize * 0.55} className="text-white/90" />
      </div>
      {/* Oversized ghost initial */}
      <span
        className="pointer-events-none absolute -bottom-5 end-2 select-none font-display text-[84px] font-extrabold leading-none text-white/[0.08]"
        aria-hidden="true"
      >
        {(title.trim()[0] || 'A').toUpperCase()}
      </span>

      {children && <div className="absolute inset-0">{children}</div>}
    </div>
  );
}
