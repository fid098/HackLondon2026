/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
      },
      animation: {
        'orb-drift': 'orbDrift 8s ease-in-out infinite',
        'fade-up':   'fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        orbDrift: {
          '0%, 100%': { transform: 'translateY(0) translateX(0)' },
          '33%':      { transform: 'translateY(-20px) translateX(10px)' },
          '66%':      { transform: 'translateY(10px) translateX(-15px)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
