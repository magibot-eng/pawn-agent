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
        abyss: "#07090d",
        brass: "#b68b47",
        brassLight: "#d6b37b",
        ember: "#f08a42",
        fog: "#aeb5c2",
        ink: "#0e131b",
        midnight: "#121722",
        wine: "#5b1f2e",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(182,139,71,0.16), 0 20px 60px rgba(0,0,0,0.35)",
        panel: "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(182,139,71,0.18), 0 18px 40px rgba(0,0,0,0.3)",
      },
      backgroundImage: {
        grain: "radial-gradient(circle at 20% 20%, rgba(240,138,66,0.08), transparent 30%), radial-gradient(circle at 80% 0%, rgba(91,31,46,0.18), transparent 25%), linear-gradient(180deg, #121722 0%, #07090d 100%)",
        frame: "linear-gradient(180deg, rgba(214,179,123,0.15), rgba(182,139,71,0.06))",
      },
    },
  },
  plugins: [],
};

export default config;
