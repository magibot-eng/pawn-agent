import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#171305",
        surfaceDim: "#171305",
        surfaceBright: "#3e3926",
        surfaceLowest: "#110e02",
        surfaceLow: "#1f1c0b",
        surfaceContainer: "#2b1d12",
        surfaceHigh: "#3d2b1f",
        surfaceHighest: "#4a3629",
        onSurface: "#f5e9c9",
        onSurfaceVariant: "#d4af37",
        outline: "#5c4033",
        outlineVariant: "#8b5a2b",
        primary: "#d4af37",
        onPrimary: "#1a0f08",
        primaryContainer: "#3d2b1f",
        onPrimaryContainer: "#ffd700",
        secondary: "#8b4513",
        onSecondary: "#ffffff",
        secondaryContainer: "#4e2a0c",
        onSecondaryContainer: "#ffcc99",
        tertiary: "#2f4f4f",
        onTertiary: "#ffffff",
        tertiaryContainer: "#1a2e2e",
        error: "#8b0000",
        onError: "#ffffff",
        errorContainer: "#4a0000",
        onErrorContainer: "#ffb4ab",
      },
      borderRadius: {
        panel: "4px",
      },
      boxShadow: {
        low: "0 2px 4px rgba(0,0,0,0.5)",
        high: "0 10px 20px rgba(0,0,0,0.8), inset 0 0 10px rgba(212, 175, 55, 0.2)",
      },
      backgroundImage: {
        maritime: "radial-gradient(circle at 20% 10%, rgba(212,175,55,0.08), transparent 25%), radial-gradient(circle at 85% 0%, rgba(47,79,79,0.12), transparent 22%), linear-gradient(180deg, #171305 0%, #110e02 100%)",
        card: "linear-gradient(135deg, #2b1d12 0%, #1a0f08 100%)",
        brassButton: "linear-gradient(to bottom, #d4af37, #8b5a2b)",
      },
    },
  },
  plugins: [],
};

export default config;
