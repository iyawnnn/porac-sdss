import {
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
import { WorkOrdersService } from './work-orders.service';

@UseGuards(AdminSessionGuard)
@Controller('admin/work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Get()
  list(
    @Query() query: Record<string, string | undefined>,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const filters = this.workOrders.parseQuery(query, admin);
    return this.workOrders.list(filters);
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
