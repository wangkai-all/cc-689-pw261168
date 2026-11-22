import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 4173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    target: 'es2022',
    // 字体自带 base64 内联，关闭 cssCodeSplit 避免 101 个 @font-face 被拆散。
  },
});
