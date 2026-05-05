/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // COMUNAS — paleta oficial. PROHIBIDO el verde en toda la app.
        // Estados OK/activo usan azul (#1D4ED8), nunca verde.
        primary: {
          DEFAULT: '#0F1C35',
          50:  '#E7EAF1',
          100: '#C5CCDA',
          200: '#9BA7BD',
          300: '#6E7E9C',
          400: '#475A7C',
          500: '#243A5E',
          600: '#172A47',
          700: '#0F1C35',
          800: '#0A1426',
          900: '#060D1A',
        },
        accent: {
          DEFAULT: '#C9A84C',
          50:  '#FBF5E2',
          100: '#F4E6B6',
          200: '#EAD485',
          300: '#DEC15F',
          400: '#D2B255',
          500: '#C9A84C',
          600: '#A8893A',
          700: '#7E682B',
          800: '#54461D',
          900: '#2A230E',
        },
        background: '#F5F4EF',
        border: '#DDE0EC',
        // Estado: azul para OK/activo (NUNCA verde)
        ok: {
          DEFAULT: '#1D4ED8',
          50:  '#EFF4FE',
          100: '#DBE5FC',
          500: '#1D4ED8',
          600: '#1842B5',
          700: '#143691',
        },
        warn:   '#C9A84C',
        danger: '#B23A3A',
        info:   '#1D4ED8',
      },
      fontFamily: {
        sans: ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sora: ['Sora', 'sans-serif'],
      },
      borderColor: {
        DEFAULT: '#DDE0EC',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 28, 53, 0.04), 0 4px 12px rgba(15, 28, 53, 0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
    },
  },
  plugins: [],
}
