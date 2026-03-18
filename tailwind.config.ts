/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'macos-bg': '#F5F5F7',
        'macos-card': '#FFFFFF',
        'macos-border': '#E5E5E5',
        'macos-text': '#1D1D1F',
        'macos-text-secondary': '#6E6E73',
        'macos-text-tertiary': '#8E8E93',
        'macos-accent': '#007AFF',
        'macos-success': '#34C759',
        'macos-warning': '#FF9500',
        'macos-error': '#FF3B30',
      },
      borderRadius: {
        'macos': '10px',
        'macos-lg': '16px',
      },
      typography: {
        DEFAULT: {
          css: {
            // 只针对行内代码（排除 pre 中的 code）
            'code:not(pre > code)::before': {
              content: 'none',
            },
            'code:not(pre > code)::after': {
              content: 'none',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}