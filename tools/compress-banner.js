const sharp = require('sharp');
const path = require('path');
const src = path.resolve(__dirname, '..', 'projects', 'advanced-http-client', 'advanced-http-client.png');
const dest = path.resolve(__dirname, '..', 'projects', 'advanced-http-client', 'advanced-http-client.webp');

(async () => {
  try {
    const img = sharp(src);
    const meta = await img.metadata();
    const width = Math.min(meta.width || 1600, 1200);
    await img
      .resize({ width })
      .webp({ quality: 72 })
      .toFile(dest);
    console.log('Compressed to WebP:', dest);
  } catch (e) {
    console.error('Compression failed:', e);
    process.exit(1);
  }
})();