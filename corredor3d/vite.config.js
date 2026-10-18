import { defineConfig } from 'vite';

// base './' = funciona em qualquer subpasta/host (GitHub Pages, Vercel, Netlify)
// o build vai para ../3d, que o portal estático já serve sem precisar de CI
export default defineConfig({
  base: './',
  build: { outDir: '../3d', emptyOutDir: true, target: 'es2022' },
});
