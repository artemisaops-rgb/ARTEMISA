/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: "var(--brand)",
        "brand-2": "var(--brand-2)",
        deep: "var(--bg-deep)",
        card: "var(--bg-card)",
        neon: {
          cyan: "var(--neon-cyan)",
          gold: "var(--neon-gold)",
          pink: "var(--neon-pink)",
          blue: "var(--neon-blue)",
        },
      },
      boxShadow: {
        glow: "var(--glow-md)",
        "glow-sm": "var(--glow-sm)",
      },
      fontFamily: {
        orbitron: ["Orbitron", "sans-serif"],
      },
    },
  },
  plugins: [],
};
