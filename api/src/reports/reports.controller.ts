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
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { z } from 'zod';
import { CitizenSessionGuard } from '../common/guards/citizen-session.guard';
import { CurrentCitizen } from '../common/decorators/current-citizen.decorator';
import type { CitizenSession } from '../auth/session.service';
import { reportSchema } from '../contracts/schemas';
import { ReportsService } from './reports.service';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = /^image\/(jpeg|png|webp)$/;

// x-forwarded-for's first hop — main.ts sets `trust proxy` since all
// traffic arrives one hop away via Next's rewrite proxy (PLAN blueprint §3
// gotcha: must be verified empirically that the rewrite actually forwards
// this header, or rate-limit layer 3 silently collapses to one IP bucket).
function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const value = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return value.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp;
  return req.ip ?? 'unknown';
}

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

    const ip = getClientIp(req);
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

  @Get('reports/mine/:id')
  async mineDetail(
    @CurrentCitizen() citizen: CitizenSession,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const detail = await this.reports.getMyReportDetail(citizen.citizenId, id);
    if (!detail) throw new NotFoundException();
    return detail;
  }

  @Get('public-map')
  publicMap(@CurrentCitizen() citizen: CitizenSession) {
    return this.reports.getPublicHazardMapData(citizen.citizenId);
  }
}
