import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'src-tauri', 'icons');
const svgPath = join(iconsDir, 'icon.svg');

async function main() {
  console.log('Reading SVG...');
  const svg = readFileSync(svgPath);

  // Generate PNG sizes
  const sizes = {
    '32x32.png': 32,
    '128x128.png': 128,
    '128x128@2x.png': 256,
    'icon.icns': 512,
  };

  for (const [filename, size] of Object.entries(sizes)) {
    console.log(`Generating ${filename} (${size}x${size})...`);
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(join(iconsDir, filename));
  }

  // Generate ICO (use 32x32 PNG embedded in ICO)
  console.log('Generating icon.ico...');
  const png32 = await sharp(svg).resize(32, 32).png().toBuffer();

  // Build ICO manually
  // ICO format: header(6) + entry(16) + image data
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);    // reserved
  header.writeUInt16LE(1, 2);    // type: 1 = icon
  header.writeUInt16LE(1, 4);    // count: 1 image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);       // width
  entry.writeUInt8(32, 1);       // height
  entry.writeUInt8(0, 2);        // color palette
  entry.writeUInt8(0, 3);        // reserved
  entry.writeUInt16LE(1, 4);      // color planes
  entry.writeUInt16LE(32, 6);     // bits per pixel
  entry.writeUInt32LE(png32.length, 8);  // image size
  entry.writeUInt32LE(22, 12);         // offset (6 + 16)

  const ico = Buffer.concat([header, entry, png32]);
  writeFileSync(join(iconsDir, 'icon.ico'), ico);

  console.log('Done! All icons generated.');
  console.log(`Output: ${iconsDir}`);
}

main().catch(console.error);
