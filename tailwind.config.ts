import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bg: {
          base: '#0A0C0F',
          surface: '#12151A',
          elevated: '#1A1F26',
          border: '#252C35',
          hover: '#1F252E',
        },
        amber: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        ink: {
          primary: '#E8ECF0',
          secondary: '#8A95A3',
          muted: '#505A65',
          inverse: '#0A0C0F',
        },
        status: {
          good:     '#22C55E',
          goodBg:   '#052512',
          low:      '#F59E0B',
          lowBg:    '#1C1200',
          critical: '#EF4444',
          critBg:   '#1C0505',
          empty:    '#6B7280',
          emptyBg:  '#111318',
        },
        txn: {
          in:    '#22C55E',
          inBg:  '#052512',
          out:   '#EF4444',
          outBg: '#1C0505',
        },
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        lg: '10px',
        xl: '14px',
      },
      boxShadow: {
        'glow-amber': '0 0 20px rgba(245,158,11,0.15)',
        'glow-green': '0 0 20px rgba(34,197,94,0.10)',
        'glow-red':   '0 0 20px rgba(239,68,68,0.10)',
        'panel':      '0 4px 24px rgba(0,0,0,0.5)',
      },
      animation: {
        'fade-in':   'fadeIn 0.2s ease-out',
        'slide-up':  'slideUp 0.3s ease-out',
        'pulse-dot': 'pulseDot 2s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
