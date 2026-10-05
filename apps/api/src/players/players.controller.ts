import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { PlayersService } from './players.service';
import { CreatePlayerDto, UpdatePlayerDto } from './dto/create-player.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { toCsv } from '../common/csv.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Post()
  create(@Body() dto: CreatePlayerDto, @CurrentUser() user: User) {
    return this.playersService.create(dto, user.organizationId);
  }

  @Get('export')
  async exportCsv(@CurrentUser() user: User, @Res() res: Response) {
    const players = await this.playersService.findAll(user.organizationId);
    const csv = toCsv(
      ['First Name', 'Last Name', 'Phone', 'Email', 'Created At'],
      players.map((p) => [
        p.firstName,
        p.lastName,
        p.phone || '',
        p.email || '',
        new Date(p.createdAt).toISOString(),
      ]),
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=players.csv');
    res.send(csv);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string, @CurrentUser() user: User) {
    return this.playersService.getStats(id, user.organizationId);
  }

  @Get()
  findAll(@Query() query: PaginationDto, @CurrentUser() user: User) {
    return this.playersService.findAllPaginated(user.organizationId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.playersService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlayerDto,
    @CurrentUser() user: User,
  ) {
    return this.playersService.update(id, dto, user.organizationId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.playersService.remove(id, user.organizationId);
  }
}
