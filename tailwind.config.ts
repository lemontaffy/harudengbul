import type { Config } from "tailwindcss";

// SPEC 8장 팔레트: 다크 기본, 메신저 톤
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#191B25",
        surface: "#222531",
        accent: "#E8A86B",
      },
    },
  },
  plugins: [],
} satisfies Config;
