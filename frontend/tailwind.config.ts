import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#12345A",
          50: "#EEF3F9",
          100: "#DCE6F2",
          600: "#1D4F91",
          700: "#12345A",
          800: "#0E2743",
        },
        saffron: { DEFAULT: "#E87524", dark: "#C25E16" },
        bg: "#F5F7FA",
        surface: "#FFFFFF",
        text: "#172B4D",
        textmuted: "#667085",
        line: "#DCE3EC",
        ok: "#16804A",
        warn: "#B7791F",
        danger: "#C0392B",
        info: "#2870A8",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "Arial", "sans-serif"],
      },
      fontSize: {
        h1: ["1.75rem", { lineHeight: "2.125rem", fontWeight: "700" }],
        h2: ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        h3: ["1rem", { lineHeight: "1.5rem", fontWeight: "600" }],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,43,77,0.06), 0 1px 3px rgba(23,43,77,0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
