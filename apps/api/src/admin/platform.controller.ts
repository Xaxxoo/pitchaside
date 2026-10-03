import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ClubsQueryDto, StatusQueryDto } from './dto/platform-query.dto';
import { PushBroadcastDto } from './dto/push-broadcast.dto';
import { NotificationsService } from '../notifications/notifications.service';

/** HQ: the PitchAside team's view across every club. Super admins only. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('overview')
  overview() {
    return this.platform.getOverview();
  }

  @Get('clubs')
  clubs(@Query() query: ClubsQueryDto) {
    return this.platform.getClubs(query);
  }

  @Get('clubs/:id')
  club(@Param('id') id: string) {
    return this.platform.getClub(id);
  }

  @Get('organisers')
  organisers(@Query() query: PaginationDto) {
    return this.platform.getOrganisers(query);
  }

  @Get('players')
  players(@Query() query: PaginationDto) {
    return this.platform.getPlayers(query);
  }

  @Get('money')
  money(@Query() query: StatusQueryDto) {
    return this.platform.getMoney(query);
  }

  @Get('messages')
  messages(@Query() query: StatusQueryDto) {
    return this.platform.getMessages(query);
  }

  @Post('notifications/push')
  broadcastPush(@Body() dto: PushBroadcastDto) {
    return this.notifications.broadcastPush(dto);
  }

  @Get('activity')
  activity(@Query() query: PaginationDto) {
    return this.platform.getActivity(query);
  }
}
