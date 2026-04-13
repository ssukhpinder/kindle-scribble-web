/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        charcoal: '#1C1C1E',
        cream: '#F5F0E8',
        amber: '#E8A838',
      },
      fontFamily: {
        ui: ['Inter', 'system-ui', 'sans-serif'],
        reading: ['Georgia', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
};
