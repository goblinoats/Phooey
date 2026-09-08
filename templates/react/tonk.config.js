import { defineConfig } from 'tonk-builder';

export default defineConfig({
  name: '__APP_NAME__',
  notation: ['src/schema.yaml'],
  define: { 'process.env.NODE_ENV': '"production"' },
  entries: [{ name: 'counter-card', model: 'builder-counter', entry: 'src/card.html' }],
});
