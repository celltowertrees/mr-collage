// Canvas PNGs carry no physical size, so print software assumes 72 or 96dpi
// and a 1800px card arrives as 25 inches wide. Writing a pHYs chunk tells it
// the real density. The chunk has to come before the image data; right after
// IHDR (always the first chunk) is the conventional spot.

const PNG_SIGNATURE_LENGTH = 8;
const INCHES_PER_METRE = 39.3701;

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function physChunk(dpi: number): Uint8Array {
  const pixelsPerMetre = Math.round(dpi * INCHES_PER_METRE);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, pixelsPerMetre);
  view.setUint32(12, pixelsPerMetre);
  view.setUint8(16, 1); // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

// Returns a copy of `png` tagged with `dpi`, replacing any pHYs already there.
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const parts: Uint8Array[] = [png.subarray(0, PNG_SIGNATURE_LENGTH)];
  let pos = PNG_SIGNATURE_LENGTH;
  while (pos < png.length) {
    const length = view.getUint32(pos);
    const end = pos + 12 + length;
    const type = String.fromCharCode(...png.subarray(pos + 4, pos + 8));
    if (type !== 'pHYs') parts.push(png.subarray(pos, end));
    if (type === 'IHDR') parts.push(physChunk(dpi));
    pos = end;
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
