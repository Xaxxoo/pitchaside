import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MAX_PITCH_PHOTOS, MAX_PITCH_PHOTO_BYTES, PitchPhotosService } from './pitch-photos.service';

/** A real JPEG header followed by padding, as a data URL of the given size. */
const jpeg = (bytes: number) => {
  const b = Buffer.alloc(bytes, 0);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff;
  return `data:image/jpeg;base64,${b.toString('base64')}`;
};

describe('PitchPhotosService', () => {
  let pitch: { id: string; ownerId: string; photoKeys: string[] };
  let pitchRepo: any, photoRepo: any, tx: any, service: PitchPhotosService;

  beforeEach(() => {
    pitch = { id: 'p1', ownerId: 'owner-1', photoKeys: [] };
    tx = {
      insert: jest.fn(),
      delete: jest.fn(),
      query: jest.fn(async (sql: string, [key]: string[]) => {
        pitch.photoKeys = sql.includes('array_append') ? [...pitch.photoKeys, key] : pitch.photoKeys.filter((k) => k !== key);
      }),
    };
    pitchRepo = {
      findOne: jest.fn(async ({ where }: any) => (where.id === pitch.id && (!where.ownerId || where.ownerId === pitch.ownerId) ? { ...pitch } : null)),
      update: jest.fn(async (_id: string, patch: any) => Object.assign(pitch, patch)),
      manager: { transaction: (cb: any) => cb(tx) },
    };
    photoRepo = { findOne: jest.fn() };
    service = new PitchPhotosService(pitchRepo, photoRepo);
  });

  it('adds a photo under a new random key, at the end of the list', async () => {
    pitch.photoKeys = ['a'.repeat(32)];
    const { photoKeys } = await service.add('p1', 'owner-1', jpeg(1000));
    expect(photoKeys).toHaveLength(2);
    expect(photoKeys[1]).toMatch(/^[a-f0-9]{32}$/);
    expect(tx.insert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pitchId: 'p1', mime: 'image/jpeg' }));
  });

  it(`stops at ${MAX_PITCH_PHOTOS} photos`, async () => {
    pitch.photoKeys = Array.from({ length: MAX_PITCH_PHOTOS }, (_, i) => String(i).repeat(32).slice(0, 32));
    await expect(service.add('p1', 'owner-1', jpeg(1000))).rejects.toThrow(`A pitch can have ${MAX_PITCH_PHOTOS} photos`);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('refuses a photo over the size limit, or one that isn’t a photo', async () => {
    await expect(service.add('p1', 'owner-1', jpeg(MAX_PITCH_PHOTO_BYTES + 1))).rejects.toThrow('too big');
    await expect(service.add('p1', 'owner-1', 'data:image/jpeg;base64,' + Buffer.from('<svg>').toString('base64'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only the owner can change a pitch’s photos', async () => {
    await expect(service.add('p1', 'someone-else', jpeg(1000))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('p1', 'someone-else', 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.cover('p1', 'someone-else', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('makes a photo the cover by moving it to the front', async () => {
    pitch.photoKeys = ['a', 'b', 'c'];
    expect((await service.cover('p1', 'owner-1', 'c')).photoKeys).toEqual(['c', 'a', 'b']);
    await expect(service.cover('p1', 'owner-1', 'zzz')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes a photo from the list and the store', async () => {
    pitch.photoKeys = ['a', 'b'];
    expect((await service.remove('p1', 'owner-1', 'a')).photoKeys).toEqual(['b']);
    expect(tx.delete).toHaveBeenCalledWith(expect.anything(), { key: 'a', pitchId: 'p1' });
  });

  it('serves only well-formed keys', async () => {
    await expect(service.get('../../etc')).rejects.toBeInstanceOf(NotFoundException);
    expect(photoRepo.findOne).not.toHaveBeenCalled();
  });
});
