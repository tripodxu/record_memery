import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        film: {
          50: "#faf8f5",
          100: "#f0ebe3",
          200: "#e0d5c6",
          300: "#c9b89f",
          400: "#b39a7a",
          500: "#a38563",
          600: "#967457",
          700: "#7d5e49",
          800: "#674e40",
          900: "#554137",
          950: "#2e211c",
        },
        dark: {
          50: "#f6f6f7",
          100: "#e2e2e5",
          200: "#c4c4ca",
          300: "#9f9faa",
          400: "#7b7b89",
          500: "#616170",
          600: "#4d4d59",
          700: "#3f3f49",
          800: "#27272a",
          900: "#18181b",
          950: "#0a0a0c",
        },
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', "Georgia", "serif"],
        sans: ['"Inter"', '"Noto Sans SC"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
