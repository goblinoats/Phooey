import { defineConfig } from 'tonk-builder';

export default defineConfig({
  name: 'builder-react',
  notation: ['../counter/src/schema.yaml'],
  define: { 'process.env.NODE_ENV': '"production"' },
  entries: [{
    name: 'counter-card', model: 'builder-counter', entry: 'src/card.html',
    // Use the same entity to replace the native example view.
    entity: 'id:builder-demo/counter-card',
  }],
});
