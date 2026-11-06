import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { setPngDpi } from '../utils/pngDpi';

// Maps to CLAUDE.md → "Printable Card Frames" (300dpi tagging)

function makePNG(width: number, height: number): Uint8Array {
  const png = new PNG({ width, height });
  png.data.fill(200);
  return new Uint8Array(PNG.sync.write(png));
}

// Walks the chunk list: [length:4][type:4][data:length][crc:4] after the 8-byte signature.
function chunks(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: { type: string; data: Uint8Array; crc: number }[] = [];
  let pos = 8;
  while (pos < bytes.length) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    out.push({ type, data: bytes.subarray(pos + 8, pos + 8 + length), crc: view.getUint32(pos + 8 + length) });
    pos += 12 + length;
  }
  return out;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe('setPngDpi', () => {
  it('inserts a pHYs chunk right after IHDR saying 300dpi in pixels per metre', () => {
    const tagged = setPngDpi(makePNG(4, 3), 300);
    const list = chunks(tagged);
    expect(list[0].type).toBe('IHDR');
    expect(list[1].type).toBe('pHYs');

    const phys = new DataView(list[1].data.buffer, list[1].data.byteOffset, 9);
    expect(phys.getUint32(0)).toBe(11811);
    expect(phys.getUint32(4)).toBe(11811);
    expect(phys.getUint8(8)).toBe(1); // unit: metre
  });

  it('writes a valid CRC over the chunk type and data', () => {
    const phys = chunks(setPngDpi(makePNG(4, 3), 300)).find((c) => c.type === 'pHYs')!;
    const typed = new Uint8Array(4 + phys.data.length);
    typed.set([0x70, 0x48, 0x59, 0x73]); // "pHYs"
    typed.set(phys.data, 4);
    expect(phys.crc).toBe(crc32(typed));
  });

  it('replaces an existing pHYs chunk rather than adding a second one', () => {
    const twice = setPngDpi(setPngDpi(makePNG(4, 3), 72), 300);
    const physChunks = chunks(twice).filter((c) => c.type === 'pHYs');
    expect(physChunks).toHaveLength(1);
    expect(new DataView(physChunks[0].data.buffer, physChunks[0].data.byteOffset, 4).getUint32(0)).toBe(11811);
  });

  it('still decodes to the same image', () => {
    const decoded = PNG.sync.read(Buffer.from(setPngDpi(makePNG(5, 2), 300)));
    expect(decoded.width).toBe(5);
    expect(decoded.height).toBe(2);
    expect(decoded.data[0]).toBe(200);
  });
});
