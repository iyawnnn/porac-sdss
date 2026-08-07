import {
  BadRequestException,
  Body,
  Controller,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RecomputeService } from '../domain/recompute.service';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { TicketsService } from './tickets.service';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = /^image\/(jpeg|png|webp)$/;

@UseGuards(AdminSessionGuard)
@Controller('admin/tickets')
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly recompute: RecomputeService,
  ) {}

  @Get()
  async list(
    @Query() query: Record<string, string | undefined>,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const recomputeResult = await this.recompute.recomputeActiveTicketUrgency();
    const filters = this.tickets.parseTicketQuery(query, admin);
    const result = await this.tickets.getTicketsForAdmin(filters);
    return { ...result, recompute: recomputeResult };
  }

  @Get('geo')
  async geo(
    @Query('office') officeParam: string | undefined,
    @CurrentAdmin() admin: AdminSession,
  ) {
    await this.recompute.recomputeActiveTicketUrgency();
    const requestedOffice =
      officeParam === 'all' || officeParam === 'MEO' || officeParam === 'MDRRMO'
        ? officeParam
        : undefined;
    return this.tickets.getTicketsGeo(admin, requestedOffice);
  }

  @Get(':id')
  async detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
  ) {
    // Matches the original SSR page (app/admin/tickets/[id]/page.tsx),
    // which always recomputed right before reading — otherwise the
    // priority/urgency shown could lag behind the queue by up to the
    // caller's own recompute cadence.
    await this.recompute.recomputeActiveTicketUrgency();
    const detail = await this.tickets.getTicketDetail(id, admin);
    if (!detail) throw new NotFoundException();
    return detail;
  }

  @Get(':id/priority-context')
  async priorityContext(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const context = await this.tickets.getTicketPriorityContext(id, admin);
    if (!context) throw new NotFoundException();
    return context;
  }

  // FileInterceptor passes non-multipart requests straight through with no
  // file attached, so this one route handles both the plain-POST status
  // transitions and the Resolved-with-photo case, matching the original
  // conditional-on-content-type Next handler.
  @Post(':id/status')
  @UseInterceptors(FileInterceptor('image'))
  async advanceStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('notes') notes: string | undefined,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES }),
          new FileTypeValidator({ fileType: ALLOWED_IMAGE_TYPES }),
        ],
      }),
    )
    image: Express.Multer.File | undefined,
  ) {
    const result = await this.tickets.advanceStatus(
      id,
      admin,
      notes,
      image?.buffer,
    );
    return { ok: true, ...result };
  }

  @Post(':id/reassign')
  async reassign(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('toOffice') toOffice: unknown,
  ) {
    if (toOffice !== 'MEO' && toOffice !== 'MDRRMO') {
      throw new BadRequestException('toOffice must be MEO or MDRRMO');
    }
    const result = await this.tickets.reassignOffice(id, admin, toOffice);
    return { ok: true, assignedOffice: result.assignedOffice };
  }
}
