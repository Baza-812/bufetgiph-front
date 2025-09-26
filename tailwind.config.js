/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
  extend: {
    colors: {
      brand: {
        50:  '#fff7d1',
        100: '#ffe99a',
        200: '#ffdc63',
        300: '#ffd12e',
        400: '#ffca0a',
        500: '#ffc107',   // основной жёлтый
        600: '#e0ab06',
        700: '#b88c05',
        800: '#8f6e04',
        900: '#6b5203',
      },
      bg:    '#0e0f13',   // тёмный фон страницы
      panel: '#171923',   // тёмные панели/карточки
    },
    borderRadius: {
      xl: '0.9rem',
      '2xl': '1.2rem',
    }
  }
},
  plugins: []
};
