import zlib from 'node:zlib';

/**
 * PNG decode/resize/encode in pure JS, just enough to build a multi-size .ico for the Windows desktop shortcut
 * without native image libraries. Supports non-interlaced PNG, bit depth 8 or 16 (truncated) for every color type,
 * plus 1/2/4 for gray and palette; color types 0 (gray), 2 (RGB), 3 (palette), 4 (gray + alpha), 6 (RGBA). Anything else returns null so callers can fall back.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** PNG buffer -> { width, height, data: Uint8Array RGBA } or null when the format is not supported. */
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || !buffer.subarray(0, 8).equals(SIGNATURE)) return null;
  let offset = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const chunks = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12] };
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') chunks.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!header || !chunks.length || header.interlace !== 0 || !CHANNELS[header.color]) return null;
  const { width, height, depth, color } = header;
  const lowDepth = depth < 8 && (color === 0 || color === 3) && [1, 2, 4].includes(depth);
  if (!(lowDepth || depth === 8 || (depth === 16 && color !== 3)) || width < 1 || height < 1 || width > 4096 || height > 4096) return null;
  if (color === 3 && !palette) return null;

  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(chunks));
  } catch {
    return null;
  }
  // Filters work on whole bytes: sub-byte pixels count as 1 byte for the "left" neighbour.
  const bytesPerPixel = Math.max(1, (CHANNELS[color] * depth) / 8);
  const stride = Math.ceil((width * CHANNELS[color] * depth) / 8);
  if (raw.length < height * (stride + 1)) return null;

  // Undo per-row filters.
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const row = y * stride;
    const previous = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? pixels[row + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[previous + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[previous + x - bytesPerPixel] : 0;
      let value = raw[source + x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      else if (filter !== 0) return null;
      pixels[row + x] = value & 0xff;
    }
  }

  // Convert to RGBA 8-bit. Sub-byte samples are read row by row (each row starts on a byte boundary).
  const step = depth / 8;
  const lowSample = (i) => {
    const y = Math.floor(i / width);
    const bit = (i - y * width) * depth;
    const value = (pixels[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return value;
  };
  const sample = (index) => pixels[index * step];
  const data = new Uint8Array(width * height * 4);
  const channels = CHANNELS[color];
  for (let i = 0; i < width * height; i += 1) {
    const base = i * channels;
    const out = i * 4;
    if (color === 6) {
      data[out] = sample(base);
      data[out + 1] = sample(base + 1);
      data[out + 2] = sample(base + 2);
      data[out + 3] = sample(base + 3);
    } else if (color === 2) {
      data[out] = sample(base);
      data[out + 1] = sample(base + 1);
      data[out + 2] = sample(base + 2);
      data[out + 3] = 255;
    } else if (color === 0 || color === 4) {
      const gray = lowDepth ? Math.round((lowSample(i) * 255) / ((1 << depth) - 1)) : sample(base);
      data[out] = gray;
      data[out + 1] = gray;
      data[out + 2] = gray;
      data[out + 3] = color === 4 ? sample(base + 1) : 255;
    } else {
      const index = lowDepth ? lowSample(i) : pixels[i];
      data[out] = palette[index * 3] ?? 0;
      data[out + 1] = palette[index * 3 + 1] ?? 0;
      data[out + 2] = palette[index * 3 + 2] ?? 0;
      data[out + 3] = transparency && index < transparency.length ? transparency[index] : 255;
    }
  }
  return { width, height, data };
}

/** Box-filter weights mapping `from` source pixels onto `to` target pixels along one axis. */
function axisWeights(from, to) {
  const scale = from / to;
  const weights = [];
  for (let target = 0; target < to; target += 1) {
    const start = target * scale;
    const end = start + scale;
    const taps = [];
    for (let source = Math.floor(start); source < Math.min(Math.ceil(end), from); source += 1) {
      const coverage = Math.min(end, source + 1) - Math.max(start, source);
      if (coverage > 0) taps.push([source, coverage / scale]);
    }
    weights.push(taps);
  }
  return weights;
}

/**
 * Fit the image into a size×size square (aspect ratio kept, transparent padding), area-averaged
 * with premultiplied alpha so edges do not get dark fringes.
 */
export function resizeSquare(image, size) {
  const scale = Math.min(size / image.width, size / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const offsetX = Math.floor((size - width) / 2);
  const offsetY = Math.floor((size - height) / 2);
  const columns = axisWeights(image.width, width);
  const rows = axisWeights(image.height, height);
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const [sy, wy] of rows[y]) {
        for (const [sx, wx] of columns[x]) {
          const weight = wx * wy;
          const index = (sy * image.width + sx) * 4;
          const alpha = image.data[index + 3] * weight;
          r += image.data[index] * alpha;
          g += image.data[index + 1] * alpha;
          b += image.data[index + 2] * alpha;
          a += alpha;
        }
      }
      const target = ((y + offsetY) * size + (x + offsetX)) * 4;
      if (a > 0) {
        out[target] = Math.round(r / a);
        out[target + 1] = Math.round(g / a);
        out[target + 2] = Math.round(b / a);
      }
      out[target + 3] = Math.round(a);
    }
  }
  return { width: size, height: size, data: out };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** RGBA image -> PNG buffer (8-bit RGBA, filter 0 rows). */
export function encodePng(image) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = image.width * 4;
  const raw = Buffer.alloc(image.height * (stride + 1));
  for (let y = 0; y < image.height; y += 1) Buffer.from(image.data.buffer, image.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
