/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        soviet: {
          red: '#CC0000',
          gold: '#FFD700',
          dark: '#1a1a1a',
        }
      }
    },
  },
  plugins: [],
}
