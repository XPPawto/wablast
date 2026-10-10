/** Palet: hijau tinta (sidebar/aksen gelap), hijau WhatsApp (aksi & sukses), abu dingin (permukaan). */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: { 950: '#081C19', 900: '#0C2723', 800: '#12312C', 700: '#1A4A42', 600: '#256058', 300: '#8FB5AC', 200: '#BCD6CF' },
        wa: { 50: '#EDFAF2', 100: '#D3F3E0', 200: '#A8E6C3', 500: '#1FA855', 600: '#178A45', 700: '#12703A' },
        surface: '#F1F4F3',
        line: '#DDE4E2',
        bubble: '#D9FDD3',
        chat: '#EAE6DF',
      },
    },
  },
  plugins: [],
};
