import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { ModerationService, type ModerationAction } from './moderation.service';

const ACTIONS: ModerationAction[] = ['dismiss', 'quarantine', 'duplicate'];

@UseGuards(AdminSessionGuard)
@Controller('admin')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('moderation')
  queue(
    @Query() query: Record<string, string | undefined>,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const filters = this.moderation.parseModerationQuery(query, admin.office);
    return this.moderation.getModerationQueue(filters);
  }

  @Get('moderation/stats')
  stats() {
    return this.moderation.getModerationStats();
  }

  @Post('reports/:id/moderate')
  async moderate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('action') action: unknown,
    @Body('canonicalReportId') canonicalReportId: number | undefined,
    @Body('note') note: string | undefined,
  ) {
    if (!ACTIONS.includes(action as ModerationAction)) {
      throw new BadRequestException(
        'action must be dismiss, quarantine, or duplicate',
      );
    }
    const result = await this.moderation.moderateReport(
      id,
      action as ModerationAction,
      admin.adminName,
      canonicalReportId,
      note,
    );
    return { ok: true, status: result.status };
  }
}
