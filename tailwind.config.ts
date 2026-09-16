/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // 主题走 <html data-theme="dark">，具体色值在 src/styles/base.css 的 CSS 变量里
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // 色板全部指向 CSS 变量；用 rgb(... / <alpha-value>) 是为了保住 border-ink/15 这类透明度修饰符
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        'paper-deep': 'rgb(var(--c-paper-deep) / <alpha-value>)',
        'paper-edge': 'rgb(var(--c-paper-edge) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--c-ink-soft) / <alpha-value>)',
        'ink-faint': 'rgb(var(--c-ink-faint) / <alpha-value>)',
        cinnabar: 'rgb(var(--c-cinnabar) / <alpha-value>)',
        'cinnabar-deep': 'rgb(var(--c-cinnabar-deep) / <alpha-value>)',
        // 遮罩永远压暗，深色下不能跟着 ink 翻白
        scrim: 'rgb(var(--c-scrim) / <alpha-value>)',
      },
      fontFamily: {
        song: ['"Noto Serif SC"', 'serif'],
        sans: ['"Noto Sans SC"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', '"Cascadia Mono"', 'monospace'],
      },
      boxShadow: {
        paper: 'var(--shadow-paper)',
        seal: 'var(--shadow-seal)',
      },
    },
  },
  plugins: [],
}
