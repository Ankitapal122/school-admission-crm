/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#123B70',
          blue: '#2563EB',
          accent: '#0284C7',
          light: '#F5F8FC',
          card: '#FFFFFF',
          text: '#172B4D',
          muted: '#64748B',
          success: '#16A36A',
          warning: '#F59E0B',
          danger: '#DC4545',
        },
      },
    },
  },
  plugins: [],
}
