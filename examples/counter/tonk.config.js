import { defineConfig } from 'tonk-builder';

export default defineConfig({
  name: 'builder-demo',
  notation: ['src/schema.yaml'],
  entries: [
    { name: 'counter-card', model: 'builder-counter', entry: 'src/card.html' },
    { name: 'counter-title', kind: 'view/title', model: 'builder-counter', entry: 'src/title.html' },
  ],
});
