import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { PersonnelGuard } from '../common/guards/personnel.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { TicketCorrectionsService } from './ticket-corrections.service';

// Staff category and location correction (manuscript revision Phase 3, step
// 3e). Shared by operational Personnel (Ticket Detail) and Focal (Focal
// Intake), so the guard admits both and rejects the System Administrator;
// which tickets each may correct is checked per ticket by the service.
@UseGuards(AdminSessionGuard, PersonnelGuard)
@Controller('admin/ticket-corrections')
export class TicketCorrectionsController {
  constructor(private readonly corrections: TicketCorrectionsService) {}

  @Get(':id')
  async availability(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const availability = await this.corrections.availability(id, admin);
    if (!availability) throw new NotFoundException();
    return availability;
  }

  @Post(':id/category')
  correctCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentAdmin() admin: AdminSession,
  ) {
    return this.corrections.correctCategory(id, body, admin);
  }

  @Post(':id/location')
  correctLocation(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentAdmin() admin: AdminSession,
  ) {
    return this.corrections.correctLocation(id, body, admin);
  }
}
