import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { RecomputeService } from '../domain/recompute.service';
import { AdminSessionGuard } from '../auth/guards/admin-session.guard';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { TicketsService } from './tickets.service';

@UseGuards(AdminSessionGuard)
@Controller('admin/tickets')
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly recompute: RecomputeService,
  ) {}

  @Get()
  async list(@Query() query: Record<string, string | undefined>, @CurrentAdmin() admin: AdminSession) {
    const recomputeResult = await this.recompute.recomputeActiveTicketUrgency();
    const filters = this.tickets.parseTicketQuery(query, admin.office);
    const result = await this.tickets.getTicketsForAdmin(filters);
    return { ...result, recompute: recomputeResult };
  }

  @Get('geo')
  async geo(@Query('office') officeParam?: string) {
    await this.recompute.recomputeActiveTicketUrgency();
    const office = officeParam === 'MEO' || officeParam === 'MDRRMO' ? officeParam : null;
    return this.tickets.getTicketsGeo(office);
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const detail = await this.tickets.getTicketDetail(id);
    if (!detail) throw new NotFoundException();
    return detail;
  }

  @Get(':id/priority-context')
  async priorityContext(@Param('id', ParseIntPipe) id: number) {
    const context = await this.tickets.getTicketPriorityContext(id);
    if (!context) throw new NotFoundException();
    return context;
  }
}
