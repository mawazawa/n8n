/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        claude: {
          50: '#fdf8f6',
          100: '#f9ede7',
          200: '#f3d9cc',
          300: '#e9bfa6',
          400: '#dc9b78',
          500: '#cf7a52',
          600: '#c06341',
          700: '#a04f35',
          800: '#844230',
          900: '#6d392b',
          950: '#3a1c14',
        },
        dark: {
          50: '#f7f7f8',
          100: '#efeef0',
          200: '#dbd9de',
          300: '#bbb8c1',
          400: '#96919f',
          500: '#797384',
          600: '#635d6c',
          700: '#524d59',
          800: '#46424b',
          900: '#2d2a33',
          950: '#1a1820',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
