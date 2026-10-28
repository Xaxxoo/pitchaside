import { BadRequestException } from '@nestjs/common';

/** The largest receipt kept: the phone sends a ~900px-wide JPEG, usually 100–300 KB. */
export const MAX_RECEIPT_BYTES = 700 * 1024;
/** Receipts are deleted after this long: by then the money has long been sorted. */
export const RECEIPT_KEEP_DAYS = 90;
/** A game confirmed on a receipt waits this long for the bank before it's back on "To check". */
export const RECEIPT_RECHECK_MS = 3 * 24 * 60 * 60 * 1000;

const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

/** A receipt as the phone sends it ("data:image/jpeg;base64,…"), checked by its bytes and size. */
export function parseReceipt(dataUrl: unknown): { data: Buffer; mime: string } {
  const m = typeof dataUrl === 'string' ? dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m) throw new BadRequestException('That receipt isn’t a picture we can use. Try a screenshot.');
  const data = Buffer.from(m[2], 'base64');
  if (!data.length) throw new BadRequestException('That receipt is empty.');
  if (data.length > MAX_RECEIPT_BYTES) throw new BadRequestException('That receipt is too big. Try a screenshot instead of a photo.');
  const kind = SIGNATURES.find((s) => s.test(data));
  if (!kind) throw new BadRequestException('That receipt isn’t a picture we can use. Try a screenshot.');
  return { data, mime: kind.mime };
}
