import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { BULK_MAX_TICKETS } from './tickets.service';
import { WorkOrdersService } from './work-orders.service';

@UseGuards(AdminSessionGuard)
@Controller('admin/work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Get()
  async list(
    @Query() query: Record<string, string | undefined>,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const filters = this.workOrders.parseQuery(query, admin);
    // kpis is the same office-scoped WorkOrdersService.getOfficePerformanceCounts
    // the Dashboard's Office Performance Summary already calls — reused here
    // rather than a second endpoint, so the workspace's one request carries
    // both the filtered rows and the (status/overdue-filter-independent)
    // workload summary.
    const [paginated, kpis] = await Promise.all([
      this.workOrders.list(filters),
      this.workOrders.getOfficePerformanceCounts(filters.office),
    ]);
    return { ...paginated, kpis };
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @CurrentAdmin() admin: AdminSession) {
    return this.workOrders.get(id, admin);
  }

  @Post()
  create(
    @CurrentAdmin() admin: AdminSession,
    @Body('ticketId') ticketId: unknown,
    @Body('title') title: unknown,
    @Body('notes') notes: unknown,
    @Body('assignedAdminId') assignedAdminId: unknown,
    @Body('dueDate') dueDate: unknown,
  ) {
    return this.workOrders.create({ ticketId, title, notes, assignedAdminId, dueDate }, admin);
  }

  // Declared before @Patch(':id')/@Post(':id/status') is not required (the
  // path segment differs), but 'bulk' is a literal that must never be parsed
  // as an id — keeping it on its own POST path guarantees that.
  @Post('bulk')
  bulkCreate(
    @CurrentAdmin() admin: AdminSession,
    @Body('ticketIds') ticketIds: unknown,
    @Body('title') title: unknown,
    @Body('notes') notes: unknown,
    @Body('assignedAdminId') assignedAdminId: unknown,
    @Body('dueDate') dueDate: unknown,
  ) {
    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      throw new BadRequestException('ticketIds must be a non-empty array');
    }
    if (ticketIds.length > BULK_MAX_TICKETS) {
      throw new BadRequestException(
        `ticketIds must contain at most ${BULK_MAX_TICKETS} ids`,
      );
    }
    const ids = [...new Set(ticketIds.map((v) => Number(v)))];
    if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
      throw new BadRequestException('ticketIds must be positive integers');
    }
    return this.workOrders.bulkCreate(
      ids,
      { title, notes, assignedAdminId, dueDate },
      admin,
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('title') title: unknown,
    @Body('notes') notes: unknown,
    @Body('assignedAdminId') assignedAdminId: unknown,
    @Body('dueDate') dueDate: unknown,
  ) {
    return this.workOrders.update(id, { title, notes, assignedAdminId, dueDate }, admin);
  }

  @Post(':id/status')
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('status') status: unknown,
  ) {
    return this.workOrders.setStatus(id, status, admin);
  }
}
