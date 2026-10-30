import { BadRequestException } from '@nestjs/common';

/** The largest photo kept: the phone sends a ~320px square, well under this. */
export const MAX_PHOTO_BYTES = 70 * 1024;

const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

/**
 * A photo as sent from the phone ("data:image/jpeg;base64,…"), checked: it must really be a
 * JPEG, PNG or WebP (by its bytes, not just what it says it is) and no bigger than `maxBytes`.
 */
export function parsePhoto(dataUrl: unknown, maxBytes = MAX_PHOTO_BYTES): { data: Buffer; mime: string } {
  const m = typeof dataUrl === 'string' ? dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m) throw new BadRequestException('That isn’t a photo we can use. Try a JPEG or PNG.');
  const data = Buffer.from(m[2], 'base64');
  if (!data.length) throw new BadRequestException('That photo is empty.');
  if (data.length > maxBytes) throw new BadRequestException('That photo is too big. Try another one.');
  const kind = SIGNATURES.find((s) => s.test(data));
  if (!kind) throw new BadRequestException('That isn’t a photo we can use. Try a JPEG or PNG.');
  return { data, mime: kind.mime };
}
