import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { randomBytes } from 'crypto';
import { Organization } from './entities/organization.entity';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private orgsRepo: Repository<Organization>,
  ) {}

  create(name: string, country?: string, state?: string) {
    const org = this.orgsRepo.create({ name, country, state });
    return this.orgsRepo.save(org);
  }

  /** A club's new name (a pitch owner's hidden "X's Pitches" becomes their club when they start a group). */
  async rename(id: string, name: string) {
    await this.orgsRepo.update(id, { name });
  }

  findAll() {
    return this.orgsRepo.find();
  }

  async findAllPaginated(query: PaginationDto): Promise<PaginatedResult<Organization>> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: any = {};
    if (query.search) {
      where.name = ILike(`%${query.search}%`);
    }

    const [data, total] = await this.orgsRepo.findAndCount({
      where,
      relations: ['users', 'groups'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const org = await this.orgsRepo.findOne({
      where: { id },
      relations: ['users', 'groups'],
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  count() {
    return this.orgsRepo.count();
  }

  async getOrCreateInviteCode(orgId: string): Promise<string> {
    const org = await this.findOne(orgId);
    if (org.inviteCode) return org.inviteCode;
    org.inviteCode = randomBytes(16).toString('hex');
    await this.orgsRepo.save(org);
    return org.inviteCode;
  }

  async regenerateInviteCode(orgId: string): Promise<string> {
    const org = await this.findOne(orgId);
    org.inviteCode = randomBytes(16).toString('hex');
    await this.orgsRepo.save(org);
    return org.inviteCode;
  }

  async findByInviteCode(code: string): Promise<Organization | null> {
    return this.orgsRepo.findOne({ where: { inviteCode: code } });
  }
}
