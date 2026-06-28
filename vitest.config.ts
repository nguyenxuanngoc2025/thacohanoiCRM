import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Tests là logic thuần (không import CSS). Dùng PostCSS rỗng inline để vitest
  // KHÔNG nạp postcss.config.mjs (file đó dùng format string cho Next/Turbopack,
  // Vite không hiểu được). Giữ build Next nguyên vẹn.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      // Ánh xạ @/ → src/ để vitest giải quyết path alias giống Next.js
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'zca-bot/**/*.test.mjs'],
    // Mock các module server-only (next/headers, @supabase/ssr) không chạy được
    // trong môi trường vitest thuần node. tenant.ts dùng chúng nhưng các test
    // chỉ test parseHost — không gọi resolveCompanyFromHost hay getTenant.
    server: {
      deps: {
        inline: ['next'],
      },
    },
  },
});
