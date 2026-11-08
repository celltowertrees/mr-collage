// The smallest PDF that prints a card: one page, sized in points to the
// card's physical size, with the card's JPEG drawn across all of it. A PDF
// reader decodes JPEG natively (/DCTDecode), so the bytes go in untouched —
// no re-encoding, no PDF library.

interface Options {
  pixelWidth: number;
  pixelHeight: number;
  // The page's physical size; the image is stretched to fill it exactly.
  widthIn: number;
  heightIn: number;
}

const POINTS_PER_INCH = 72;

// Enough precision for a millimetre size (A6's 419.5276pt), without the
// float noise of a bare toString.
function num(n: number) {
  return String(Number(n.toFixed(4)));
}

export function jpegToPdf(jpeg: Uint8Array, { pixelWidth, pixelHeight, widthIn, heightIn }: Options): Uint8Array {
  const w = num(widthIn * POINTS_PER_INCH);
  const h = num(heightIn * POINTS_PER_INCH);
  const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (body: string) => {
    offsets.push(length);
    push(`${offsets.length} 0 obj\n${body}\nendobj\n`);
  };

  // The second line's high bytes mark the file as binary for transfer tools.
  push('%PDF-1.4\n%');
  push(new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object('<< /Type /Catalog /Pages 2 0 R >>');
  object('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'
  );
  offsets.push(length);
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
  );
  push(jpeg);
  push('\nendstream\nendobj\n');
  object(`<< /Length ${content.length} >>\nstream\n${content}endstream`);

  const xrefAt = length;
  const rows = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  push(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${rows}`);
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}
