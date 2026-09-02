/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aerospace: {
          950: '#06090e',
          900: '#0a0e14',
          850: '#0f151f',
          800: '#131a24',
          700: '#1c2533',
          600: '#2b3648',
          500: '#475569',
          400: '#8b95a1',
          300: '#c3cad3',
          200: '#dfe4ea',
          100: '#f2f5f8',
        },
        telemetry: {
          cyan: '#4ecdf0',
          amber: '#ff9f1c',
          green: '#39ff8a',
          red: '#ff4d4d',
          purple: '#a78bfa',
          blue: '#1c5c8c',
        }
      },
      fontFamily: {
        mono: ['Consolas', 'Courier New', 'monospace'],
        sans: ['Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
