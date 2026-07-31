import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithAdmin } from '../guards/admin-session.guard';
import type { AdminSession } from '../session.service';

// Only meaningful behind AdminSessionGuard, which populates
// req.adminSession — used together, never on their own.
export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminSession => {
    const req = ctx.switchToHttp().getRequest<RequestWithAdmin>();
    return req.adminSession as AdminSession;
  },
);
