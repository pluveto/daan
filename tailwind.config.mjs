/** @type {import('tailwindcss').Config} */
export default {
  publicDir: 'assets',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class', // Enable dark mode based on class
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'), // Useful for styling form elements like checkboxes/selects
  ],
};
