import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#C42633', dark: '#A51D29', light: '#FCE8E9' },
      },
    },
  },
  plugins: [],
}
export default config
