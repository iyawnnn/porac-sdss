import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../auth/guards/admin-session.guard';
import { ModerationService } from './moderation.service';

@UseGuards(AdminSessionGuard)
@Controller('admin')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('moderation')
  queue() {
    return this.moderation.getModerationQueue();
  }

  @Get('moderation/stats')
  stats() {
    return this.moderation.getModerationStats();
  }
}
