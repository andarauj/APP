/** @type {import('tailwindcss').Config} */
// Theme colors (light / dark / oled) live in constants/colors.ts and flip via
// useTheme(). The `gf-*` tokens below mirror Colors.dark only as layout
// helpers for className — they do NOT follow light/OLED. Prefer
// style={{ color: colors.* }} for any color that must track the active theme.
// Do not use gf-* for theme-sensitive fills/text unless the screen is dark-only.
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Mirrors constants/colors.ts → Colors.dark (cyber navy). Not OLED.
        gf: {
          bg: '#070B14',
          surface: '#121A28',
          'surface-variant': '#1A2436',
          'surface-highlight': '#243044',
          primary: '#3D8BFF',
          'primary-container': '#15305F',
          secondary: '#3DFF8A',
          'secondary-container': '#0E3A22',
          accent: '#A78BFA',
          'accent-container': '#2A1F4D',
          error: '#FF4D55',
          'error-container': '#3F1418',
          success: '#3DFF8A',
          warning: '#FFC14D',
          text: '#F5F7FB',
          'text-secondary': '#A8B0C0',
          'text-tertiary': '#6E7789',
          border: '#2A3548',
          'border-light': '#364457',
          streak: '#FFC14D',
          rest: '#3D8BFF',
        },
      },
      borderRadius: {
        card: '16px',
        input: '12px',
      },
      fontFamily: {
        sans: ['Inter-Regular'],
        'sans-semibold': ['Inter-SemiBold'],
        'sans-bold': ['Inter-Bold'],
        'sans-extrabold': ['Inter-ExtraBold'],
        'sans-black': ['Inter-Black'],
      },
    },
  },
  plugins: [],
};
