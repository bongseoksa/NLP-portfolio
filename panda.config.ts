import { defineConfig } from '@pandacss/dev';

export default defineConfig({
  preflight: true,
  include: ['./src/**/*.{js,jsx,ts,tsx}'],
  exclude: [],
  outdir: 'styled-system',
  theme: {
    extend: {
      tokens: {
        colors: {
          'surface.basic': { value: '#ffffff' },
          'surface.secondary': { value: '#f8fafc' },
          'surface.accent': { value: '#3b82f6' },
          'surface.success': { value: '#22c55e' },
          'surface.warning': { value: '#f59e0b' },
          'surface.error': { value: '#ef4444' },
          'text.strong': { value: '#1e293b' },
          'text.normal': { value: '#475569' },
          'text.subtle': { value: '#64748b' },
          'text.inverse': { value: '#ffffff' },
          'border.normal': { value: '#e2e8f0' },
          'border.subtle': { value: '#f1f5f9' },
          'border.primary': { value: '#3b82f6' },
        },
        fonts: {
          sans: {
            value:
              "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          },
          mono: { value: "'JetBrains Mono', 'Fira Code', monospace" },
        },
        radii: {
          sm: { value: '4px' },
          md: { value: '8px' },
          lg: { value: '12px' },
        },
        shadows: {
          sm: { value: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
          md: { value: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
          lg: { value: '0 10px 15px -3px rgb(0 0 0 / 0.1)' },
        },
      },
      textStyles: {
        Heading1: {
          value: { fontSize: '2rem', fontWeight: 700, lineHeight: 1.2 },
        },
        Heading2: {
          value: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.3 },
        },
        Heading3: {
          value: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4 },
        },
        Body1: {
          value: { fontSize: '1rem', fontWeight: 400, lineHeight: 1.5 },
        },
        Body2: {
          value: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.5 },
        },
        Caption: {
          value: { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.4 },
        },
      },
    },
  },
  conditions: {
    dark: '@media (prefers-color-scheme: dark)',
  },
});
