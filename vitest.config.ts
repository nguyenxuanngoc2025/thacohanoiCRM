import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests là logic thuần (không import CSS). Dùng PostCSS rỗng inline để vitest
  // KHÔNG nạp postcss.config.mjs (file đó dùng format string cho Next/Turbopack,
  // Vite không hiểu được). Giữ build Next nguyên vẹn.
  css: { postcss: { plugins: [] } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
