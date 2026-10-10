import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

// CRC32 calculation
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Generate a PNG icon with smooth rounded corners (squircle) for PWA home screen shortcuts.
 * @param {number} width 
 * @param {number} height 
 * @param {boolean} isMaskable - If true, full bleed for Android Adaptive Icons; if false, smooth rounded corners with transparent border.
 */
function generateIcon(width, height, isMaskable = false) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(rowBytes * height);

  const cx = width / 2;
  const cy = height / 2;
  const cornerRadius = width * 0.22; // 22% corner radius for sleek modern rounded app icon

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // Filter byte: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      let alpha = 255;

      if (!isMaskable) {
        // Compute distance from rounded rectangle boundary with anti-aliasing
        const qx = Math.max(Math.abs(x - cx) - (cx - cornerRadius), 0);
        const qy = Math.max(Math.abs(y - cy) - (cy - cornerRadius), 0);
        const dist = Math.sqrt(qx * qx + qy * qy);

        if (dist > cornerRadius + 0.8) {
          alpha = 0; // Transparent outside rounded corner
        } else if (dist > cornerRadius - 0.8) {
          // Antialiased edge
          alpha = Math.round(255 * Math.max(0, Math.min(1, (cornerRadius + 0.8 - dist) / 1.6)));
        }
      }

      if (alpha === 0) {
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
        continue;
      }

      // Base background gradient: Deep navy (#1A3C6E -> #0A192F)
      const gradT = y / height;
      let r = Math.round(26 * (1 - gradT) + 10 * gradT);
      let g = Math.round(60 * (1 - gradT) + 25 * gradT);
      let b = Math.round(110 * (1 - gradT) + 48 * gradT);

      // Subtle inner border ring highlight
      if (!isMaskable) {
        const qx = Math.max(Math.abs(x - cx) - (cx - cornerRadius), 0);
        const qy = Math.max(Math.abs(y - cy) - (cy - cornerRadius), 0);
        const dist = Math.sqrt(qx * qx + qy * qy);
        const borderDist = Math.abs(dist - (cornerRadius - 1.5));
        if (borderDist < 1.5) {
          // Subtle warm glow highlight on the rounded border
          const blend = (1.5 - borderDist) / 1.5 * 0.35;
          r = Math.round(r * (1 - blend) + 245 * blend);
          g = Math.round(g * (1 - blend) + 158 * blend);
          b = Math.round(b * (1 - blend) + 11 * blend);
        }
      }

      // Normalized coordinates from center for emblem (-1 to 1)
      const scale = isMaskable ? 0.32 : 0.42;
      const nx = (x - cx) / (width * scale);
      const ny = (y - cy + (isMaskable ? 0 : height * 0.02)) / (height * scale);

      // 1. Draw outer droplet/flame shape
      // Lower circle: center at (0, 0.25), radius 0.58
      // Top tip: cone narrowing up to (0, -0.95)
      let insideFlame = false;
      let insideInnerCore = false;

      // Bottom curved base
      if (ny >= -0.15 && ny <= 0.82) {
        const dBottom = Math.sqrt(nx * nx + (ny - 0.25) * (ny - 0.25));
        if (dBottom <= 0.58) insideFlame = true;
      }
      // Top tapered cone
      if (ny < 0.25 && ny >= -0.92) {
        const coneHalfWidth = 0.58 * (1 - (0.25 - ny) / 1.17);
        if (Math.abs(nx) <= coneHalfWidth) insideFlame = true;
      }

      // 2. Draw inner bright golden core
      const inx = nx / 0.56;
      const iny = (ny - 0.12) / 0.56;
      if (iny >= -0.15 && iny <= 0.82) {
        const dIn = Math.sqrt(inx * inx + (iny - 0.22) * (iny - 0.22));
        if (dIn <= 0.52) insideInnerCore = true;
      }
      if (iny < 0.22 && iny >= -0.9) {
        const inConeWidth = 0.52 * (1 - (0.22 - iny) / 1.12);
        if (Math.abs(inx) <= inConeWidth) insideInnerCore = true;
      }

      // Color the emblem
      if (insideInnerCore) {
        // Bright radiant gold/yellow core
        r = 254;
        g = 240;
        b = 138;
      } else if (insideFlame) {
        // Vibrant rich amber-orange flame
        r = 245;
        g = 158;
        b = 11;
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = alpha;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const pubDir = path.resolve('public');
if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });

// Generate icons
fs.writeFileSync(path.join(pubDir, 'pwa-192x192.png'), generateIcon(192, 192, false));
fs.writeFileSync(path.join(pubDir, 'pwa-512x512.png'), generateIcon(512, 512, false));
fs.writeFileSync(path.join(pubDir, 'pwa-maskable-512x512.png'), generateIcon(512, 512, true));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), generateIcon(180, 180, false));
fs.writeFileSync(path.join(pubDir, 'favicon.png'), generateIcon(64, 64, false));

console.log('Successfully generated rounded shortcut icons in', pubDir);
