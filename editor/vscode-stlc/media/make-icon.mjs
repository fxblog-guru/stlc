// Regenerates media/icon.png (the marketplace icon) from the same motif as icon.svg: a flask with a
// check mark, on the teal that tells this board apart from the lavender SDLC one.
//
// Kept as a script rather than a committed binary with no provenance: an icon nobody can
// regenerate is an icon nobody can change. Pure Node - zlib is the only thing a PNG needs.
//
//   node media/make-icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SIZE = 128;
const SS = 4; // supersample factor, downsampled for anti-aliasing
const N = SIZE * SS;

const BG = [0x0f, 0x2a, 0x2a];      // deep teal tile
const LINE = [0xe6, 0xf6, 0xf3];    // flask outline
const LIQUID = [0x14, 0x6b, 0x63];  // liquid fill
const CHECK = [0x2d, 0xd4, 0xbf];   // accent check

const s = (v) => (v / 24) * N;      // viewBox units -> supersampled pixels
const buf = Buffer.alloc(N * N * 3);
for (let i = 0; i < N * N; i++) buf.set(BG, i * 3);
const put = (x, y, rgb) => {
  if (x >= 0 && y >= 0 && x < N && y < N) buf.set(rgb, (y * N + x) * 3);
};

// The flask body as a polygon (the SVG path with its rounded foot flattened to a few points).
const FLASK = [[10, 3], [10, 9], [4.6, 18.4], [4.5, 19.6], [5.2, 20.6], [6.2, 21], [17.8, 21], [18.8, 20.6], [19.5, 19.6], [19.4, 18.4], [14, 9], [14, 3]];
function inside(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// Liquid: the part of the flask below y = 12.5.
for (let py = 0; py < N; py++) {
  for (let px = 0; px < N; px++) {
    const x = (px / N) * 24, y = (py / N) * 24;
    if (y > 12.5 && inside(FLASK, x, y)) put(px, py, LIQUID);
  }
}

/** A round-capped stroke along a polyline: every pixel within half a stroke of a segment. */
function stroke(points, width, rgb) {
  const hw = s(width) / 2;
  for (let k = 0; k < points.length - 1; k++) {
    const [ax, ay] = points[k].map(s), [bx, by] = points[k + 1].map(s);
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    for (let py = Math.floor(Math.min(ay, by) - hw); py <= Math.ceil(Math.max(ay, by) + hw); py++) {
      for (let px = Math.floor(Math.min(ax, bx) - hw); px <= Math.ceil(Math.max(ax, bx) + hw); px++) {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        const qx = ax + t * dx, qy = ay + t * dy;
        if ((px - qx) ** 2 + (py - qy) ** 2 <= hw * hw) put(px, py, rgb);
      }
    }
  }
}
stroke([[9, 3], [15, 3]], 1.6, LINE);
stroke([...FLASK], 1.6, LINE);
stroke([[8.6, 15.4], [10.9, 17.7], [15.5, 12.9]], 2.0, CHECK);

// Downsample by averaging each SS x SS block.
const out = Buffer.alloc(SIZE * SIZE * 3);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const acc = [0, 0, 0];
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = ((y * SS + sy) * N + (x * SS + sx)) * 3;
      acc[0] += buf[o]; acc[1] += buf[o + 1]; acc[2] += buf[o + 2];
    }
    const o = (y * SIZE + x) * 3, n = SS * SS;
    out[o] = Math.round(acc[0] / n); out[o + 1] = Math.round(acc[1] / n); out[o + 2] = Math.round(acc[2] / n);
  }
}

// PNG: one filter byte (0 = none) per scanline, then deflate, then the four chunks.
const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
for (let y = 0; y < SIZE; y++) out.copy(raw, y * (SIZE * 3 + 1) + 1, y * SIZE * 3, (y + 1) * SIZE * 3);

let TABLE = null;
function crc32(b) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (const byte of b) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: truecolour
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const target = join(dirname(fileURLToPath(import.meta.url)), 'icon.png');
writeFileSync(target, png);
console.log(`wrote ${target} (${png.length} bytes)`);
