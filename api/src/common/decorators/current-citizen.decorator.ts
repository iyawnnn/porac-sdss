import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithCitizen } from '../guards/citizen-session.guard';
import type { CitizenSession } from '../../auth/session.service';

// Only meaningful behind CitizenSessionGuard, which populates
// req.citizenSession — used together, never on their own.
export const CurrentCitizen = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CitizenSession => {
    const req = ctx.switchToHttp().getRequest<RequestWithCitizen>();
    return req.citizenSession as CitizenSession;
  },
);
