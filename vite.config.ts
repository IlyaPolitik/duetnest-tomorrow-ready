import { defineConfig } from 'vite';
import { metaPlugin } from './server/api.ts';
export default defineConfig({
  plugins: [metaPlugin()],
  optimizeDeps: { include: ['@huggingface/transformers', '@tensorflow/tfjs', '@tensorflow-models/coco-ssd'] },
  server: { host: '127.0.0.1', port: 4318, strictPort: true, fs: { strict: true } },
  preview: { host: '127.0.0.1', port: 4318, strictPort: true },
});
