import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { GroupsService } from './groups.service';
import { CreateGroupDto, UpdateGroupDto } from './dto/create-group.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { toCsv } from '../common/csv.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  create(@Body() dto: CreateGroupDto, @CurrentUser() user: User) {
    return this.groupsService.create(dto, user.organizationId);
  }

  @Get('export')
  async exportCsv(@CurrentUser() user: User, @Res() res: Response) {
    const groups = await this.groupsService.findAll(user.organizationId);
    const csv = toCsv(
      ['Name', 'Description', 'Schedule', 'Target Players', 'Fee per Player', 'Payment Type', 'Members', 'Created At'],
      groups.map((g) => [
        g.name,
        g.description || '',
        g.schedule || '',
        String(g.targetPlayers),
        String(g.feePerPlayer),
        g.paymentType,
        String(g.memberships?.length || 0),
        new Date(g.createdAt).toISOString(),
      ]),
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=groups.csv');
    res.send(csv);
  }

  @Get()
  findAll(@Query() query: PaginationDto, @CurrentUser() user: User) {
    return this.groupsService.findAllPaginated(user.organizationId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.groupsService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: User,
  ) {
    return this.groupsService.update(id, dto, user.organizationId);
  }

  @Post(':id/members')
  addMember(@Param('id') id: string, @Body() dto: AddMemberDto, @CurrentUser() user: User) {
    return this.groupsService.addMember(id, dto, user.organizationId);
  }

  /** The organiser adds themselves as a player in this group. */
  @Post(':id/members/me')
  addMe(@Param('id') id: string, @CurrentUser() user: User) {
    return this.groupsService.addOrganiser(id, user);
  }

  @Delete(':id/members/:playerId')
  removeMember(
    @Param('id') id: string,
    @Param('playerId') playerId: string,
    @CurrentUser() user: User,
    @Query('force') force?: string,
  ) {
    return this.groupsService.removeMember(id, playerId, user.organizationId, force === 'true');
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.groupsService.remove(id, user.organizationId);
  }
}
