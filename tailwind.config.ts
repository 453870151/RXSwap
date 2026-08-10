import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      maxWidth: {
        md: "30rem",
      },
      colors: {
        brand: {
          DEFAULT: "#E8B923",
          soft: "#F7D269",
          deep: "#B8860B",
        },
        accent: {
          DEFAULT: "#FFB800",
          soft: "#FFD166",
        },
        ink: {
          DEFAULT: "#020914",
          soft: "#0C0D14",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px -8px rgba(232,185,35,0.45)",
        "glow-soft": "0 0 30px -10px rgba(232,185,35,0.35)",
        card: "0 18px 50px -20px rgba(0,0,0,0.45)",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #F5C542 0%, #D4A017 100%)",
        "brand-gradient-soft":
          "linear-gradient(135deg, rgba(245,197,66,0.15) 0%, rgba(212,160,23,0.15) 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        float: "float 6s ease-in-out infinite",
        "spin-slow": "spin-slow 1.1s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
