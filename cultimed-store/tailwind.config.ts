import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Editorial Apothecary palette — warm, clinical, European
        paper: "#F4EFE6",          // warm cream — paper de receta
        "paper-dim": "#EBE5D9",    // ligeramente más oscuro
        "paper-bright": "#FAF6EE", // crema más clara
        ink: "#1B1F1E",            // graphite cálido (no negro puro)
        "ink-muted": "#5A5E5C",    // gris cálido para body secundario
        "ink-subtle": "#9C9D97",   // gris muy claro, micro-print
        forest: "#1F3A2D",         // verde laboratorio
        "forest-deep": "#0F1F18",  // verde más oscuro para profundidad
        "forest-soft": "#3D5C4E",  // verde más claro
        brass: "#A98B5C",          // latón antiguo
        "brass-dim": "#8B7148",    // latón más oscuro
        "brass-bright": "#C4A678", // latón más claro
        sangria: "#7A2E2E",        // wine clínico (solo advertencias)
        "sangria-dim": "#5C2222",
        rule: "#C9C2B3",           // hairline divisor
        "rule-soft": "#DDD7C8",    // hairline más sutil
      },
      fontFamily: {
        display: ['"Fraunces"', '"GT Sectra"', '"Tiempos"', "Georgia", "serif"],
        body: ['"Manrope"', '"Söhne"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        // Editorial display sizes
        "display-1": ["clamp(3.5rem, 8vw, 8rem)", { lineHeight: "0.95", letterSpacing: "-0.04em" }],
        "display-2": ["clamp(2.5rem, 5vw, 5rem)", { lineHeight: "1.0", letterSpacing: "-0.03em" }],
        "display-3": ["clamp(1.875rem, 3vw, 3rem)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        eyebrow: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.18em" }],
        micro: ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.04em" }],
      },
      letterSpacing: {
        widest: "0.18em",
        editorial: "0.04em",
      },
      boxShadow: {
        soft: "0 1px 3px rgba(27, 31, 30, 0.04), 0 8px 24px rgba(27, 31, 30, 0.04)",
        editorial: "0 24px 60px -20px rgba(27, 31, 30, 0.18)",
      },
      transitionTimingFunction: {
        editorial: "cubic-bezier(0.32, 0.72, 0.32, 1)",
      },
      animation: {
        "fade-up": "fadeUp 1s cubic-bezier(0.32,0.72,0.32,1) both",
        "fade-in": "fadeIn 1.2s cubic-bezier(0.32,0.72,0.32,1) both",
        "rule-grow": "ruleGrow 1.4s cubic-bezier(0.32,0.72,0.32,1) both",
      },
      keyframes: {
        // Use `both` fill mode so element is at "from" state during delay,
        // animates to "to" state, and stays there. Avoids needing opacity-0 base class.
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        ruleGrow: {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
