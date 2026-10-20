import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { dedupe: ['three'] },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: {
        vfx: fileURLToPath(new URL('./index.html', import.meta.url)),
        ar: fileURLToPath(new URL('./ar.html', import.meta.url)),
        target: fileURLToPath(new URL('./cafea.html', import.meta.url)),
        targetRedirect: fileURLToPath(new URL('./target.html', import.meta.url)),
      },
    },
  },
});
