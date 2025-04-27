/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  plugins: [require('@tailwindcss/typography')],
  // Enable dark mode based on class
  theme: {
    extend: {},
  },
};
