import type { Config } from "tailwindcss";

/**
 * CultiSoft — Editorial Apothecary palette (unified with cultimed-store).
 * Old token names are mapped to new editorial colors so existing pages keep
 * working without a full rewrite. New code should prefer the editorial tokens.
 */
const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ─── Editorial Apothecary primitives ───
        paper: "#F4EFE6",
        "paper-dim": "#EBE5D9",
        "paper-bright": "#FAF6EE",
        ink: "#1B1F1E",
        "ink-muted": "#5A5E5C",
        "ink-subtle": "#9C9D97",
        forest: "#1F3A2D",
        "forest-deep": "#0F1F18",
        "forest-soft": "#3D5C4E",
        brass: "#A98B5C",
        "brass-dim": "#8B7148",
        "brass-bright": "#C4A678",
        sangria: "#7A2E2E",
        "sangria-dim": "#5C2222",
        rule: "#C9C2B3",
        "rule-soft": "#DDD7C8",

        // ─── Legacy Material-clinical names mapped to editorial palette ───
        primary: "#1F3A2D",                    // forest replaces medical blue
        "primary-container": "#3D5C4E",
        "primary-fixed": "#DDD7C8",            // soft cream for active nav highlights
        "primary-fixed-dim": "#C9C2B3",
        "on-primary": "#F4EFE6",
        "on-primary-container": "#F4EFE6",
        "on-primary-fixed": "#1B1F1E",
        "on-primary-fixed-variant": "#1F3A2D",

        secondary: "#5A5E5C",
        "secondary-container": "#EBE5D9",
        "on-secondary": "#F4EFE6",
        "on-secondary-container": "#5A5E5C",
        "on-secondary-fixed-variant": "#5A5E5C",

        tertiary: "#A98B5C",                   // brass for accents
        "tertiary-container": "#C4A678",
        "on-tertiary": "#1B1F1E",
        "on-tertiary-container": "#1B1F1E",

        surface: "#F4EFE6",
        "surface-bright": "#FAF6EE",
        "surface-dim": "#EBE5D9",
        "surface-container": "#EBE5D9",
        "surface-container-low": "#EFE9DD",
        "surface-container-lowest": "#FAF6EE",
        "surface-container-high": "#E5DFD0",
        "surface-container-highest": "#DFD8C8",
        "surface-variant": "#E5DFD0",
        "on-surface": "#1B1F1E",
        "on-surface-variant": "#5A5E5C",

        outline: "#9C9D97",
        "outline-variant": "#C9C2B3",

        error: "#7A2E2E",
        "error-container": "#F0DCDC",
        "on-error": "#F4EFE6",
        "on-error-container": "#5C2222",

        success: "#1F3A2D",
        "success-container": "#D7E5DC",
        warning: "#A98B5C",
        "warning-container": "#F2E7D2",

        background: "#F4EFE6",
        "on-background": "#1B1F1E",
      },
      fontFamily: {
        display: ['"Fraunces"', '"GT Sectra"', "Georgia", "serif"],
        headline: ['"Fraunces"', "Georgia", "serif"],
        body: ['"Manrope"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        // legacy aliases
        label: ['"Manrope"', "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-1": ["clamp(2.5rem, 5vw, 4.5rem)", { lineHeight: "0.98", letterSpacing: "-0.03em" }],
        "display-2": ["clamp(2rem, 4vw, 3.5rem)", { lineHeight: "1.0", letterSpacing: "-0.02em" }],
        "display-3": ["clamp(1.5rem, 2.5vw, 2.25rem)", { lineHeight: "1.1", letterSpacing: "-0.015em" }],
        eyebrow: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.18em" }],
      },
      letterSpacing: {
        widest: "0.18em",
        editorial: "0.04em",
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        sm: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        full: "9999px",
      },
      boxShadow: {
        soft: "0 1px 3px rgba(27, 31, 30, 0.04), 0 8px 24px rgba(27, 31, 30, 0.04)",
        editorial: "0 24px 60px -20px rgba(27, 31, 30, 0.18)",
        clinical: "0 1px 3px rgba(27, 31, 30, 0.04), 0 8px 24px rgba(27, 31, 30, 0.04)",
        "clinical-lg": "0 24px 60px -20px rgba(27, 31, 30, 0.18)",
      },
      transitionTimingFunction: {
        editorial: "cubic-bezier(0.32, 0.72, 0.32, 1)",
      },
      animation: {
        "fade-up": "fadeUp 0.8s cubic-bezier(0.32,0.72,0.32,1) both",
        "fade-in": "fadeIn 0.8s cubic-bezier(0.32,0.72,0.32,1) both",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
