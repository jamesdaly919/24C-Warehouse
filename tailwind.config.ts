import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Per-company accent — set as CSS variables on the app wrapper
        brand: {
          DEFAULT: 'var(--brand)',
          dark:    'var(--brand-dark)',
          soft:    'var(--brand-soft)',
          on:      'var(--on-brand)',
        },
        // Neutral scale (light UI)
        canvas:  '#F4F5F7',
        surface: '#FFFFFF',
        line:    { DEFAULT: '#E5E7EB', strong: '#D1D5DB' },
        ink:     { DEFAULT: '#111827', 2: '#4B5563', 3: '#6B7280', 4: '#9CA3AF' },
        // Semantics
        good:     { DEFAULT: '#15803D', bg: '#ECFDF3', line: '#BBF7D0' },
        low:      { DEFAULT: '#B45309', bg: '#FFFBEB', line: '#FDE68A' },
        critical: { DEFAULT: '#B91C1C', bg: '#FEF2F2', line: '#FECACA' },
        empty:    { DEFAULT: '#475569', bg: '#F1F5F9', line: '#CBD5E1' },
        move: {
          in:    '#15803D', inBg:  '#ECFDF3',
          out:   '#B91C1C', outBg: '#FEF2F2',
          trf:   '#4338CA', trfBg: '#EEF2FF',
        },
      },
      borderRadius: { sm: '6px', DEFAULT: '10px', lg: '14px', xl: '20px' },
      boxShadow: {
        card:  '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
        lift:  '0 4px 12px rgba(16,24,40,.08), 0 1px 3px rgba(16,24,40,.06)',
        modal: '0 24px 48px -12px rgba(16,24,40,.25)',
      },
      animation: {
        'fade-in':  'fadeIn .18s ease-out',
        'slide-up': 'slideUp .22s ease-out',
        'pop':      'pop .25s cubic-bezier(.2,.9,.3,1.2)',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pop:     { from: { opacity: '0', transform: 'scale(.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
};

export default config;
