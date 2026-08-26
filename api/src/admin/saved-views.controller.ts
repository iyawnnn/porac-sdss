import {
  Body,
  Controller,
  Delete,
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
import { SavedViewsService, parseSavedViewSurface } from './saved-views.service';

// No SystemAdminGuard: a saved view is the caller's own private bookmark and
// carries no office-scoped data of its own. SavedViewsService scopes every
// statement on adminId, which is the authorization boundary here.
@UseGuards(AdminSessionGuard)
@Controller('admin/saved-views')
export class SavedViewsController {
  constructor(private readonly savedViews: SavedViewsService) {}

  // `surface` is optional on both routes and falls back to 'tickets'. The
  // Ticket Queue shipped before the column existed and still calls these
  // without one — that request has to keep resolving to its own strip.
  @Get()
  list(
    @CurrentAdmin() admin: AdminSession,
    @Query('surface') surface: string | undefined,
  ) {
    return this.savedViews.list(admin, parseSavedViewSurface(surface));
  }

  @Post()
  create(
    @CurrentAdmin() admin: AdminSession,
    @Body('name') name: unknown,
    @Body('query') query: unknown,
    @Body('surface') surface: unknown,
  ) {
    return this.savedViews.create(
      admin,
      name,
      query,
      parseSavedViewSurface(surface),
    );
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
  ) {
    return this.savedViews.remove(admin, id);
  }
}
