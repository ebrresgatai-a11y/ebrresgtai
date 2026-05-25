import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          deep: "#1E3A5F",
          blue: "#3B82F6",
          ice: "#F8FAFC",
          soft: "#E5E7EB",
          green: "#22C55E",
          red: "#EF4444",
          gold: "#F59E0B"
        }
      },
      boxShadow: {
        soft: "0 18px 50px rgba(30, 58, 95, 0.10)",
        glow: "0 18px 44px rgba(59, 130, 246, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
