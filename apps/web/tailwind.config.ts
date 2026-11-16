import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Cores do gestor (painel interno) nas cores da Winner Cakes: os cinzas viram
      // tons de chocolate/creme e o azul dos botões vira o vermelho da logo.
      colors: {
        neutral: {
          50: "#fffaf6",
          100: "#fff6ef",
          200: "#faece2",
          300: "#f3e0d3",
          400: "#e8cdbd",
          500: "#d4b2a0",
          600: "#a98474",
          700: "#5a3229",
          800: "#43241d",
          900: "#2f1914",
          950: "#200f0b",
        },
        blue: {
          50: "#fff1f2",
          100: "#ffe0e3",
          200: "#ffc6cc",
          300: "#ff9ba6",
          400: "#ff6375",
          500: "#f02d45",
          600: "#c8102e",
          700: "#a50d26",
          800: "#8a1024",
          900: "#741224",
          950: "#40040f",
        },
      },
      keyframes: {
        'slide-in-right': { from: { opacity: '0', transform: 'translateX(56px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        'slide-in-left': { from: { opacity: '0', transform: 'translateX(-56px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(18px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        kenburns: { from: { transform: 'scale(1.02) translate3d(0,0,0)' }, to: { transform: 'scale(1.14) translate3d(-1.5%,-1%,0)' } },
        progress: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        'drawer-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'sheet-up': { from: { opacity: '0', transform: 'translateY(48px) scale(0.98)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        pop: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.3)' }, '100%': { transform: 'scale(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(16px) scale(0.96)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
      },
      animation: {
        'slide-in-right': 'slide-in-right 520ms cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-left': 'slide-in-left 520ms cubic-bezier(0.22,1,0.36,1) both',
        'fade-up': 'fade-up 640ms cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 400ms ease-out both',
        kenburns: 'kenburns 9s ease-out both',
        progress: 'progress 5500ms linear both',
        'drawer-in': 'drawer-in 420ms cubic-bezier(0.22,1,0.36,1) both',
        'sheet-up': 'sheet-up 420ms cubic-bezier(0.22,1,0.36,1) both',
        pop: 'pop 380ms ease-out',
        shimmer: 'shimmer 1.4s infinite',
        'toast-in': 'toast-in 320ms cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
