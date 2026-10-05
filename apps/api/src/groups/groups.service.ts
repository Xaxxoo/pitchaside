import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CONTRIBUTIONS_VISIBILITY, Group } from './entities/group.entity';
import { GroupMembership } from './entities/group-membership.entity';
import { CreateGroupDto, UpdateGroupDto } from './dto/create-group.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { BillingService } from '../billing/billing.service';
import { User } from '../users/entities/user.entity';
import { naira } from '../common/format.util';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group) private groupsRepo: Repository<Group>,
    @InjectRepository(GroupMembership) private membershipsRepo: Repository<GroupMembership>,
    private billing: BillingService,
  ) {}

  async create(dto: CreateGroupDto, organizationId: string) {
    const group = await this.groupsRepo.save(this.groupsRepo.create({ ...dto, organizationId }));
    // Invite link, PulseMFB collection account and first dues period.
    return this.billing.setupGroup(group);
  }

  findAll(organizationId: string) {
    return this.groupsRepo.find({
      where: { organizationId },
      relations: ['memberships', 'memberships.player'],
    });
  }

  async findAllPaginated(
    organizationId: string,
    query: PaginationDto,
  ): Promise<PaginatedResult<Group>> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.groupsRepo
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.memberships', 'membership')
      .leftJoinAndSelect('membership.player', 'player')
      .where('group.organizationId = :organizationId', { organizationId });

    if (query.search) {
      qb.andWhere('group.name ILIKE :s', { s: `%${query.search}%` });
    }

    qb.orderBy('group.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, organizationId: string) {
    const group = await this.groupsRepo.findOne({
      where: { id, organizationId },
      relations: ['memberships', 'memberships.player'],
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  async update(id: string, dto: UpdateGroupDto, organizationId: string) {
    const group = await this.findOne(id, organizationId);
    // Also checked by UpdateGroupDto; kept for callers that don't go through the controller.
    if (dto.contributionsVisibility !== undefined && !CONTRIBUTIONS_VISIBILITY.includes(dto.contributionsVisibility)) {
      throw new BadRequestException('contributionsVisibility must be private, totals or names');
    }
    Object.assign(group, dto);
    const saved = await this.groupsRepo.save(group);
    // Switching to a periodic type opens the current dues period straight away.
    await this.billing.ensureCurrentPeriod(saved);
    // The fee and how the group collects apply to what's still unpaid, not just to dues
    // created from now on. Run on every save (it only touches unpaid upcoming dues), so
    // re-saving fixes dues left at an old amount.
    if (dto.feePerPlayer !== undefined || dto.paymentType !== undefined) await this.billing.repriceOpenDues(saved);
    return saved;
  }

  async addMember(groupId: string, dto: AddMemberDto, organizationId: string) {
    await this.findOne(groupId, organizationId);
    const membership = await this.membershipsRepo.save(
      this.membershipsRepo.create({
        groupId,
        playerId: dto.playerId,
        role: dto.role,
      }),
    );
    await this.billing.onMemberAdded(membership);
    return membership;
  }

  addOrganiser(groupId: string, user: User) {
    return this.billing.addOrganiserToGroup(groupId, user);
  }

  /** A member's credit goes with them, so removing one who has some needs `force`. */
  async removeMember(groupId: string, playerId: string, organizationId: string, force = false) {
    await this.findOne(groupId, organizationId);
    const membership = await this.membershipsRepo.findOne({ where: { groupId, playerId } });
    if (!membership) throw new NotFoundException('Membership not found');
    const credit = Number(membership.credit);
    if (credit > 0 && !force) {
      throw new ConflictException(
        `They have ${naira(credit)} credit in this group that hasn't paid a due yet. Removing them drops it from the books, so refund them first if it's owed back.`,
      );
    }
    await this.membershipsRepo.delete({ groupId, playerId });
  }

  /** Not while its account holds money: the group's transfers and payouts go with it. */
  async remove(id: string, organizationId: string) {
    const group = await this.findOne(id, organizationId);
    const { available } = await this.billing.getGroupBalance(id, organizationId);
    if (available > 0.001) {
      throw new ConflictException(
        `This group's account still holds ${naira(available)}. Send it out before deleting the group, or its payment history goes with it.`,
      );
    }
    await this.groupsRepo.remove(group);
  }

  countByOrganization(organizationId: string) {
    return this.groupsRepo.count({ where: { organizationId } });
  }

  countAll() {
    return this.groupsRepo.count();
  }
}
