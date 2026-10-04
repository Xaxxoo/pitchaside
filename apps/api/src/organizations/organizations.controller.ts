import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganizationsService } from './organizations.service';
import { PlayersService } from '../players/players.service';
import { JoinDto } from './dto/join.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly orgsService: OrganizationsService,
    private readonly playersService: PlayersService,
    private readonly config: ConfigService,
  ) {}

  private buildLink(inviteCode: string) {
    const appUrl = this.config.get('APP_URL', 'http://localhost:3000');
    return `${appUrl}/join/${inviteCode}`;
  }

  @UseGuards(JwtAuthGuard)
  @Get('invite-code')
  async getInviteCode(@CurrentUser() user: User) {
    const inviteCode = await this.orgsService.getOrCreateInviteCode(user.organizationId);
    return { inviteCode, link: this.buildLink(inviteCode) };
  }

  @UseGuards(JwtAuthGuard)
  @Post('invite-code/regenerate')
  async regenerateInviteCode(@CurrentUser() user: User) {
    const inviteCode = await this.orgsService.regenerateInviteCode(user.organizationId);
    return { inviteCode, link: this.buildLink(inviteCode) };
  }

  @Get('join/:code')
  async getOrgByInviteCode(@Param('code') code: string) {
    const org = await this.orgsService.findByInviteCode(code);
    if (!org) throw new NotFoundException('Invalid invite link');
    return { organizationId: org.id, organizationName: org.name };
  }

  @Post('join/:code')
  async joinOrg(@Param('code') code: string, @Body() dto: JoinDto) {
    const org = await this.orgsService.findByInviteCode(code);
    if (!org) throw new NotFoundException('Invalid invite link');
    return this.playersService.create(dto, org.id);
  }
}
