import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Pitch } from './entities/pitch.entity';
import { PitchPhoto } from './entities/pitch-photo.entity';
import { parsePhoto } from '../players/photos';

/** A pitch keeps this many photos at most. */
export const MAX_PITCH_PHOTOS = 6;
/** The largest pitch photo kept: the phone sends a 1200 × 900 JPEG, well under this. */
export const MAX_PITCH_PHOTO_BYTES = 300 * 1024;

/** A pitch's photos: added, removed, one made the cover (first), and served by key. */
@Injectable()
export class PitchPhotosService {
  constructor(
    @InjectRepository(Pitch) private pitchRepo: Repository<Pitch>,
    @InjectRepository(PitchPhoto) private photoRepo: Repository<PitchPhoto>,
  ) {}

  private async own(pitchId: string, ownerId: string) {
    const pitch = await this.pitchRepo.findOne({ where: { id: pitchId, ownerId } });
    if (!pitch) throw new NotFoundException('Pitch not found');
    return pitch;
  }

  async add(pitchId: string, ownerId: string, dataUrl: unknown) {
    const pitch = await this.own(pitchId, ownerId);
    if ((pitch.photoKeys ?? []).length >= MAX_PITCH_PHOTOS) {
      throw new BadRequestException(`A pitch can have ${MAX_PITCH_PHOTOS} photos. Remove one to add another.`);
    }
    const { data, mime } = parsePhoto(dataUrl, MAX_PITCH_PHOTO_BYTES);
    const key = randomBytes(16).toString('hex');
    await this.pitchRepo.manager.transaction(async (tx) => {
      await tx.insert(PitchPhoto, { key, pitchId, data, mime });
      // Append in the database so two uploads at once both land.
      await tx.query(`UPDATE "pitches" SET "photo_keys" = array_append("photo_keys", $1) WHERE "id" = $2`, [key, pitchId]);
    });
    return this.keys(pitchId);
  }

  async remove(pitchId: string, ownerId: string, key: string) {
    await this.own(pitchId, ownerId);
    await this.pitchRepo.manager.transaction(async (tx) => {
      await tx.query(`UPDATE "pitches" SET "photo_keys" = array_remove("photo_keys", $1) WHERE "id" = $2`, [key, pitchId]);
      await tx.delete(PitchPhoto, { key, pitchId });
    });
    return this.keys(pitchId);
  }

  /** Moves a photo to the front, where it's the cover. */
  async cover(pitchId: string, ownerId: string, key: string) {
    const pitch = await this.own(pitchId, ownerId);
    const keys = pitch.photoKeys ?? [];
    if (!keys.includes(key)) throw new NotFoundException('No photo here');
    await this.pitchRepo.update(pitchId, { photoKeys: [key, ...keys.filter((k) => k !== key)] });
    return this.keys(pitchId);
  }

  async get(key: string) {
    const photo = /^[a-f0-9]{32}$/.test(key) ? await this.photoRepo.findOne({ where: { key } }) : null;
    if (!photo) throw new NotFoundException('No photo here');
    return photo;
  }

  private async keys(pitchId: string) {
    const pitch = await this.pitchRepo.findOne({ where: { id: pitchId }, select: ['id', 'photoKeys'] });
    return { photoKeys: pitch?.photoKeys ?? [] };
  }
}
