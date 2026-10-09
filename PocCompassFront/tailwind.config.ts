import type { Config } from "tailwindcss";

// Tokens live in app/globals.css (:root). Do not hard-code brand colors in components.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "rgb(var(--border))",
        input: "rgb(var(--input))",
        ring: "rgb(var(--ring))",
        background: "rgb(var(--background))",
        foreground: "rgb(var(--foreground))",
        primary: { DEFAULT: "rgb(var(--primary))", foreground: "rgb(var(--primary-foreground))" },
        secondary: { DEFAULT: "rgb(var(--secondary))", foreground: "rgb(var(--secondary-foreground))" },
        destructive: { DEFAULT: "rgb(var(--destructive))", foreground: "rgb(var(--destructive-foreground))" },
        muted: { DEFAULT: "rgb(var(--muted))", foreground: "rgb(var(--muted-foreground))" },
        accent: { DEFAULT: "rgb(var(--accent))", foreground: "rgb(var(--accent-foreground))" },
        card: { DEFAULT: "rgb(var(--card))", foreground: "rgb(var(--card-foreground))" },
        brand: { DEFAULT: "rgb(var(--primary))", soft: "rgb(var(--accent))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;
