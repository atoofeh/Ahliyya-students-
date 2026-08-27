/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand navy — sampled from the Students_Alahliyya logo.
        brand: {
          50: '#EEF4FB', 100: '#D9E6F6', 200: '#B6CEEC', 300: '#8AAEDD', 400: '#5C89C9',
          500: '#3A68AF', 600: '#274F92', 700: '#1D3F78', 800: '#16406F', 900: '#122A4E', 950: '#0B1D38',
        },
        // `primary` aliases brand so every existing token-based page restyles automatically.
        primary: {
          50: '#EEF4FB', 100: '#D9E6F6', 200: '#B6CEEC', 300: '#8AAEDD', 400: '#5C89C9',
          500: '#3A68AF', 600: '#274F92', 700: '#1D3F78', 800: '#16406F', 900: '#122A4E', 950: '#0B1D38',
        },
        // Champagne gold — the "excellence" accent.
        gold: {
          50: '#FBF7EB', 100: '#F6EDD2', 200: '#EDDCA6', 300: '#E0C572', 400: '#D4B052',
          500: '#C9A648', 600: '#A8862F', 700: '#856826', 800: '#6C5421', 900: '#59451E',
        },
        // Ice-tinted neutrals (light) / deep navy-tinted (dark).
        surface: {
          50: '#F6F9FC', 100: '#EDF2F8', 200: '#DFE7F0', 300: '#C6D3E1', 400: '#94A6BC',
          500: '#647892', 600: '#475D7A', 700: '#2E4160', 800: '#1A2C49', 900: '#101F38', 950: '#0A1729',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Tajawal', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'Tajawal', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Layered, soft, navy-tinted — the "expensive" shadow stack.
        card: '0 1px 2px rgba(18,42,78,0.06), 0 4px 12px rgba(18,42,78,0.06)',
        'card-hover': '0 2px 4px rgba(18,42,78,0.08), 0 12px 28px rgba(18,42,78,0.12)',
        float: '0 8px 30px rgba(18,42,78,0.14)',
        glow: '0 0 0 1px rgba(58,104,175,0.25), 0 8px 24px rgba(39,79,146,0.35)',
        'gold-glow': '0 0 0 1px rgba(201,166,72,0.35), 0 6px 20px rgba(201,166,72,0.25)',
        'inner-top': 'inset 0 1px 0 rgba(255,255,255,0.08)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #16406F 0%, #122A4E 55%, #0B1D38 100%)',
        'brand-radial': 'radial-gradient(1200px 600px at 15% -10%, rgba(58,104,175,0.35), transparent 60%), radial-gradient(900px 500px at 110% 110%, rgba(201,166,72,0.18), transparent 55%)',
        'gold-gradient': 'linear-gradient(135deg, #E0C572 0%, #C9A648 60%, #A8862F 100%)',
        'card-sheen': 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 40%)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.35s ease-out',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in': 'slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 2.2s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float-slow': 'floatSlow 7s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideIn: { '0%': { opacity: '0', transform: 'translateX(-14px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        shimmer: { '0%': { backgroundPosition: '-600px 0' }, '100%': { backgroundPosition: '600px 0' } },
        floatSlow: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
      },
    },
  },
  plugins: [],
};
