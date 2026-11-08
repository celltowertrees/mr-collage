// A canvas JPEG says nothing useful about its physical size — browsers write
// a JFIF header with density 1:1 and no unit, so print software falls back
// to 72 or 96dpi. This rewrites the JFIF density fields (or adds a JFIF
// header if the encoder left one out) so the file reads as `dpi`.

// APP0 "JFIF\0", version 1.01, units, X/Y density, no thumbnail.
function jfifSegment(dpi: number): Uint8Array {
  const seg = new Uint8Array(18);
  const view = new DataView(seg.buffer);
  seg.set([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01]);
  seg[11] = 1; // unit: dots per inch
  view.setUint16(12, dpi);
  view.setUint16(14, dpi);
  return seg;
}

// Returns a copy of `jpeg` that declares `dpi` on both axes.
export function setJpegDpi(jpeg: Uint8Array, dpi: number): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG');
  const hasJfif =
    jpeg[2] === 0xff &&
    jpeg[3] === 0xe0 &&
    String.fromCharCode(...jpeg.subarray(6, 11)) === 'JFIF\0';

  if (hasJfif) {
    const out = jpeg.slice();
    const view = new DataView(out.buffer);
    out[13] = 1;
    view.setUint16(14, dpi);
    view.setUint16(16, dpi);
    return out;
  }

  // JFIF has to be the first segment after SOI.
  const out = new Uint8Array(jpeg.length + 18);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(jfifSegment(dpi), 2);
  out.set(jpeg.subarray(2), 20);
  return out;
}
