import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function createPngBuffer(width, height, getPixelRgba) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // color type 6: RGBA
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdrChunk = makeChunk("IHDR", ihdrData);

  // Raw image scanlines: filter byte (0) + width * 4 bytes per row
  const stride = 1 + width * 4;
  const rawData = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride;
    rawData[rowOffset] = 0; // Filter type 0: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixelRgba(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = Math.max(0, Math.min(255, Math.floor(r)));
      rawData[pxOffset + 1] = Math.max(0, Math.min(255, Math.floor(g)));
      rawData[pxOffset + 2] = Math.max(0, Math.min(255, Math.floor(b)));
      rawData[pxOffset + 3] = Math.max(0, Math.min(255, Math.floor(a)));
    }
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk("IDAT", compressedData);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(12 + length);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);

  const crcTarget = chunk.subarray(4, 8 + length);
  const crcValue = calcCrc32(crcTarget);
  chunk.writeUInt32BE(crcValue, 8 + length);
  return chunk;
}

// Standard CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function calcCrc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Pseudo-random noise functions
function pseudoNoise(x, y, seed = 1) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.123) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, y, scale, seed = 1) {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const x1 = x0 + 1;
  const y0 = Math.floor(sy);
  const y1 = y0 + 1;

  const fx = sx - x0;
  const fy = sy - y0;

  const sfx = fx * fx * (3 - 2 * fx);
  const sfy = fy * fy * (3 - 2 * fy);

  const v00 = pseudoNoise(x0, y0, seed);
  const v10 = pseudoNoise(x1, y0, seed);
  const v01 = pseudoNoise(x0, y1, seed);
  const v11 = pseudoNoise(x1, y1, seed);

  const top = v00 * (1 - sfx) + v10 * sfx;
  const bottom = v01 * (1 - sfx) + v11 * sfx;
  return top * (1 - sfy) + bottom * sfy;
}

function fbm(x, y, octaves = 4, seed = 1) {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * smoothNoise(x * freq, y * freq, 32, seed + i * 17);
    amp *= 0.5;
    freq *= 2;
  }
  return val;
}

// 1. Plaster texture: damp, cracked, desaturated gray-green plaster
function generatePlaster(width = 512, height = 512) {
  return createPngBuffer(width, height, (x, y) => {
    // Wrap coordinates for seamless tile
    const nx = (Math.sin((x / width) * Math.PI * 2) + 1) * 60;
    const ny = (Math.cos((y / height) * Math.PI * 2) + 1) * 60;

    const baseNoise = fbm(nx, ny, 4, 101);
    const detailNoise = smoothNoise(x, y, 4, 202);
    const stain = fbm(nx * 0.5, ny * 0.5, 3, 303);

    // Weathered plaster palette (greenish stone-gray with damp stains)
    let r = 118 + (baseNoise - 0.5) * 35 - stain * 25 + (detailNoise - 0.5) * 12;
    let g = 126 + (baseNoise - 0.5) * 38 - stain * 20 + (detailNoise - 0.5) * 12;
    let b = 114 + (baseNoise - 0.5) * 32 - stain * 28 + (detailNoise - 0.5) * 10;

    // Subtle cracks
    const crackNoise = Math.abs(fbm(nx * 2, ny * 2, 4, 404) - 0.5);
    if (crackNoise < 0.02) {
      const crackDarken = (0.02 - crackNoise) / 0.02;
      r -= crackDarken * 45;
      g -= crackDarken * 45;
      b -= crackDarken * 45;
    }

    return [r, g, b, 255];
  });
}

// 2. Wood floor texture: dark rain-soaked oak floorboards with seams and grain
function generateWood(width = 512, height = 512) {
  const plankCount = 8;
  const plankHeight = height / plankCount;

  return createPngBuffer(width, height, (x, y) => {
    const plankIdx = Math.floor(y / plankHeight);
    const localY = y % plankHeight;

    // Plank gap / seam (dark border between planks)
    if (localY < 3 || localY > plankHeight - 3) {
      return [24, 18, 14, 255];
    }

    // Wood grain runs along X axis
    const grainNoise = smoothNoise(x * 0.8, y * 4, 16, 505 + plankIdx * 13);
    const fineGrain = Math.sin(y * 1.8 + grainNoise * 14) * 0.5 + 0.5;
    const fbmVal = fbm(x * 0.2, y * 0.8, 3, 606 + plankIdx * 31);

    // Plank individual tint variation
    const plankTint = ((plankIdx * 37) % 25) - 12;

    // Dark rain-swollen oak palette
    let r = 72 + plankTint + fbmVal * 20 + fineGrain * 14;
    let g = 58 + plankTint * 0.8 + fbmVal * 16 + fineGrain * 11;
    let b = 44 + plankTint * 0.6 + fbmVal * 12 + fineGrain * 8;

    // Wet sheen / water reflection spots
    const wetSpot = smoothNoise(x, y, 64, 707);
    if (wetSpot > 0.65) {
      const sheen = (wetSpot - 0.65) * 45;
      r += sheen;
      g += sheen * 1.1;
      b += sheen * 1.2;
    }

    return [r, g, b, 255];
  });
}

// 3. Reference image: 1280x720 atmospheric title art
function generateReference(width = 1280, height = 720) {
  return createPngBuffer(width, height, (x, y) => {
    const u = x / width;
    const v = y / height;

    // Sky gradient (stormy coastal night: deep blue-black to fog horizon)
    let r = 8 + v * 18;
    let g = 12 + v * 24;
    let b = 15 + v * 28;

    // Horizon mist
    const horizonFog = Math.exp(-Math.pow((v - 0.55) * 5, 2));
    r += horizonFog * 25;
    g += horizonFog * 30;
    b += horizonFog * 35;

    // Signal Estate & Tower silhouette on the right side
    const inBuilding = (u > 0.45 && u < 0.85 && v > 0.35 && v < 0.75);
    const inTower = (u > 0.68 && u < 0.74 && v > 0.12 && v < 0.75);
    const inSpire = (u > 0.706 && u < 0.714 && v > 0.04 && v < 0.15);

    if (inSpire || inTower || inBuilding) {
      r = 9; g = 11; b = 10;

      // Warm amber lantern glowing from one window
      const inWindow = (u > 0.55 && u < 0.60 && v > 0.44 && v < 0.50);
      if (inWindow) {
        r = 210; g = 145; b = 55;
      }
      // Red relay warning lamp at top of tower
      const inLamp = (Math.hypot((u - 0.71) * width, (v - 0.12) * height) < 7);
      if (inLamp) {
        r = 230; g = 40; b = 25;
      }
    }

    // Ground darkness (near-black wet earth)
    if (v > 0.7) {
      const gProgress = (v - 0.7) / 0.3;
      r = r * (1 - gProgress) + 6 * gProgress;
      g = g * (1 - gProgress) + 8 * gProgress;
      b = b * (1 - gProgress) + 7 * gProgress;
    }

    // Vignette
    const cx = (u - 0.5) * 2;
    const cy = (v - 0.5) * 2;
    const vig = 1 - Math.min(1, Math.hypot(cx, cy) * 0.6);
    r *= vig; g *= vig; b *= vig;

    return [r, g, b, 255];
  });
}

const outDir = path.resolve("client/public/textures");
fs.mkdirSync(outDir, { recursive: true });

console.log("Generating plaster.png...");
fs.writeFileSync(path.join(outDir, "plaster.png"), generatePlaster(512, 512));

console.log("Generating wood.png...");
fs.writeFileSync(path.join(outDir, "wood.png"), generateWood(512, 512));

console.log("Generating reference.png...");
fs.writeFileSync(path.join(outDir, "reference.png"), generateReference(1280, 720));

console.log("All textures generated successfully in client/public/textures/!");
