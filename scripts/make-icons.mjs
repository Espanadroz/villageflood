// Run once (or after changing the SVGs): node scripts/make-icons.mjs
import sharp from 'sharp';
for (const size of [192, 512]) await sharp('public/icon.svg').resize(size, size).png().toFile(`public/icon-${size}.png`);
// Maskable: full-bleed background, droplet inside the central ~60% safe zone.
await sharp('public/icon-maskable.svg').resize(512, 512).png().toFile('public/icon-maskable-512.png');
console.log('icons written');
