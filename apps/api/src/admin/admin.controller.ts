import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import * as bcrypt from 'bcrypt';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/** A co-admin added from Admin: they sign in with this email and temporary password. */
export class AddOrgMemberDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  /** Co-organiser (full access minus Admin) or treasurer (payments only). */
  @IsOptional()
  @IsIn([UserRole.MEMBER, UserRole.TREASURER])
  role?: UserRole.MEMBER | UserRole.TREASURER;
}

/** Never send password hashes or 2FA secrets to the browser. */
function publicUser({ passwordHash: _hash, twoFactorSecret: _secret, ...user }: User) {
  return user;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
  ) {}

  // Platform-wide (super admin) endpoints live in PlatformController.

  // ── Org Admin endpoints ──

  @Get('org/stats')
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  getOrgStats(@CurrentUser() user: User) {
    return this.adminService.getOrgStats(user.organizationId);
  }

  @Get('org/members')
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  async getOrgMembers(@CurrentUser() user: User) {
    const members = await this.adminService.getOrgMembers(user.organizationId);
    return members.map(publicUser);
  }

  @Post('org/members')
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  async addOrgMember(
    @CurrentUser() user: User,
    @Body() body: AddOrgMemberDto,
  ) {
    const passwordHash = await bcrypt.hash(body.password, 10);
    const newUser = await this.usersService.create({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      passwordHash,
      // Co-organiser (full access minus Admin) or treasurer (payments only).
      role: body.role === UserRole.TREASURER ? UserRole.TREASURER : UserRole.MEMBER,
      organizationId: user.organizationId,
    });

    // Send invite email
    const orgName = user.organization?.name || 'your organization';
    await this.mailService.sendMemberInvite(
      body.email,
      body.firstName,
      orgName,
      body.password,
    );

    return publicUser(newUser);
  }

  @Get('org/audit-log')
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  getAuditLog(@CurrentUser() user: User, @Query() query: PaginationDto) {
    return this.auditService.findByOrganization(user.organizationId, query);
  }
}
