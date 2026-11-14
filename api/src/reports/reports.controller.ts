import {
  BadRequestException,
  Body,
  Controller,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PositiveIntPipe } from '../common/pipes/positive-int.pipe';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { clientIp } from '../common/utils/client-ip';
import { z } from 'zod';
import { CitizenSessionGuard } from '../common/guards/citizen-session.guard';
import { ReferenceLookupRateLimitGuard } from '../common/guards/reference-lookup-rate-limit.guard';
import { CurrentCitizen } from '../common/decorators/current-citizen.decorator';
import type { CitizenSession } from '../auth/session.service';
import { reportSchema } from '../contracts/schemas';
import { ReportsService } from './reports.service';

// The one 404 message for every reference that does not resolve to the
// citizen's own report.
export const REFERENCE_NOT_FOUND_MESSAGE =
  'No report found with that reference.';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = /^image\/(jpeg|png|webp)$/;

@UseGuards(CitizenSessionGuard)
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('reports')
  @UseInterceptors(FileInterceptor('image'))
  async submit(
    @Req() req: Request,
    @CurrentCitizen() citizen: CitizenSession,
    @Body() body: Record<string, string | undefined>,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES }),
          new FileTypeValidator({ fileType: ALLOWED_IMAGE_TYPES }),
        ],
      }),
    )
    image: Express.Multer.File,
  ) {
    const parsed = reportSchema.safeParse({
      title: body.title,
      description: body.description,
      category: body.category,
      citizenSeverity: body.citizen_severity,
      lat: body.lat,
      lng: body.lng,
    });
    if (!parsed.success) {
      throw new BadRequestException(z.flattenError(parsed.error));
    }

    const ip = clientIp(req);
    const result = await this.reports.submit(
      citizen,
      ip,
      parsed.data,
      image.buffer,
    );
    return result;
  }

  @Get('reports/mine')
  mine(@CurrentCitizen() citizen: CitizenSession) {
    return this.reports.getMyReports(citizen.citizenId);
  }

  // Owner-only tracking-reference lookup (manuscript revision Phase 6, step
  // 6b): { id } of the signed-in citizen's own report. A malformed
  // reference, a missing one and another citizen's all get the same 404
  // with the same body (REFERENCE_NOT_FOUND_MESSAGE), so nothing about other citizens'
  // reports can be learned. Throttled per citizen
  // (ReferenceLookupRateLimitGuard, 30 a minute).
  @Get('reports/mine/by-reference/:ref')
  @UseGuards(ReferenceLookupRateLimitGuard)
  async mineByReference(
    @CurrentCitizen() citizen: CitizenSession,
    @Param('ref') ref: string,
  ) {
    const found = await this.reports.findMyReportIdByReference(
      citizen.citizenId,
      ref,
    );
    if (!found) throw new NotFoundException(REFERENCE_NOT_FOUND_MESSAGE);
    return found;
  }

  @Get('reports/mine/:id')
  async mineDetail(
    @CurrentCitizen() citizen: CitizenSession,
    @Param('id', PositiveIntPipe) id: number,
  ) {
    const detail = await this.reports.getMyReportDetail(citizen.citizenId, id);
    if (!detail) throw new NotFoundException();
    return detail;
  }

  @Get('public-map')
  publicMap(@CurrentCitizen() citizen: CitizenSession) {
    return this.reports.getPublicHazardMapData(citizen.citizenId);
  }

  @Post('reports/mine/:id/dispute')
  @HttpCode(HttpStatus.OK)
  async dispute(
    @CurrentCitizen() citizen: CitizenSession,
    @Param('id', PositiveIntPipe) id: number,
    @Body('reason') reason: unknown,
  ) {
    if (typeof reason !== 'string') {
      throw new BadRequestException('A short reason is required.');
    }
    const result = await this.reports.disputeReport(
      citizen.citizenId,
      id,
      reason,
    );
    return { ok: true, ...result };
  }

  @Post('reports/mine/:id/confirm-resolution')
  @HttpCode(HttpStatus.OK)
  async confirmResolution(
    @CurrentCitizen() citizen: CitizenSession,
    @Param('id', PositiveIntPipe) id: number,
  ) {
    const result = await this.reports.confirmResolution(citizen.citizenId, id);
    return { ok: true, ...result };
  }
}
