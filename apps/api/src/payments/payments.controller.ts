import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { BulkMarkPaidDto } from './dto/bulk-mark-paid.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AllowTreasurer } from '../auth/decorators/allow-treasurer.decorator';
import { User } from '../users/entities/user.entity';

@UseGuards(JwtAuthGuard)
@AllowTreasurer()
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: User) {
    return this.paymentsService.create(dto, user.organizationId);
  }

  @Patch('bulk-mark-paid')
  async bulkMarkPaid(@Body() dto: BulkMarkPaidDto, @CurrentUser() user: User) {
    const result = await this.paymentsService.bulkMarkAsPaid(
      dto.paymentIds,
      user.organizationId,
      `${user.firstName} ${user.lastName}`,
    );
    await this.auditService.log({
      action: AuditAction.PAYMENT_BULK_MARKED_PAID,
      entityType: 'payment',
      entityId: dto.paymentIds.join(','),
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { count: dto.paymentIds.length },
    });
    return result;
  }

  @Patch(':id/mark-paid')
  async markAsPaid(
    @Param('id') id: string,
    @Body('markedBy') markedBy: string | undefined,
    @CurrentUser() user: User,
  ) {
    const result = await this.paymentsService.markAsPaid(id, user.organizationId, markedBy);
    await this.auditService.log({
      action: AuditAction.PAYMENT_MARKED_PAID,
      entityType: 'payment',
      entityId: id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { amount: result.amount, playerId: result.playerId },
    });
    return result;
  }

  @Patch(':id/mark-unpaid')
  async markAsUnpaid(@Param('id') id: string, @CurrentUser() user: User) {
    const result = await this.paymentsService.markAsUnpaid(id, user.organizationId);
    await this.auditService.log({
      action: AuditAction.PAYMENT_MARKED_UNPAID,
      entityType: 'payment',
      entityId: id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { amount: result.amount, playerId: result.playerId },
    });
    return result;
  }

  @Patch(':id/waive')
  async waive(@Param('id') id: string, @CurrentUser() user: User) {
    const result = await this.paymentsService.waive(
      id,
      user.organizationId,
      `${user.firstName} ${user.lastName}`,
    );
    await this.auditService.log({
      action: AuditAction.PAYMENT_WAIVED,
      entityType: 'payment',
      entityId: id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { amount: result.amount, playerId: result.playerId },
    });
    return result;
  }

  @Get('session/:sessionId')
  findBySession(@Param('sessionId') sessionId: string, @CurrentUser() user: User) {
    return this.paymentsService.findBySession(sessionId, user.organizationId);
  }

  @Get('player/:playerId')
  findByPlayer(@Param('playerId') playerId: string, @CurrentUser() user: User) {
    return this.paymentsService.findByPlayer(playerId, user.organizationId);
  }
}
