import { z } from 'zod';

// Fails at boot, not at first request — see PLAN blueprint §2. Only
// DATABASE_URL is exercised by anything built so far (Phase 1: health
// check only); the rest is declared now so later phases don't need to
// revisit this file per-endpoint.
const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    CLOUDINARY_URL: z.string().startsWith('cloudinary://'),
    OPENWEATHERMAP_API_KEY: z.string().min(1),
    CRON_SECRET: z.string().min(16),
    PORT: z.coerce.number().default(3001),
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    WEB_ORIGIN: z.string().url().optional(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_REDIRECT_URI: z.string().url().optional(),
    OAUTH_STATE_SECRET: z.string().min(32).optional(),
    RESET_TOKEN_TTL_MINUTES: z.coerce.number().default(30),
    EMAIL_FROM: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    TARGET_MUNICIPALITY_NAME: z.string().default('Municipality of Porac'),
    TARGET_MUNICIPALITY_PSGC_CODE: z.string().default('030541500'),
    TARGET_BARANGAY_COUNT: z.coerce.number().default(29),
    TARGET_MIN_LAT: z.coerce.number().default(14.98),
    TARGET_MAX_LAT: z.coerce.number().default(15.16),
    TARGET_MIN_LNG: z.coerce.number().default(120.35),
    TARGET_MAX_LNG: z.coerce.number().default(120.62),
    // DEMO-ONLY. Unset in every real environment. When present,
    // WeatherService.getCurrentRain1hMm() returns this fixed value instead
    // of live/cached OpenWeatherMap rainfall — see that file for the full
    // rationale. Absent (the default): zero behavior change.
    DEMO_FIXED_RAIN_MM: z.coerce.number().optional(),
  })
  .superRefine((data, ctx) => {
    // RESEND_API_KEY without EMAIL_FROM previously only failed later, inside
    // ResendEmailService's constructor (citizens.module.ts's factory) — a
    // startup crash with no mention the two are a required pair. Failing
    // here instead means it's the same boot-time Zod failure as any other
    // required var, wrapped by formatValidationError below. The reverse
    // (EMAIL_FROM without RESEND_API_KEY) stays valid/harmless — nothing
    // reads EMAIL_FROM unless RESEND_API_KEY selects ResendEmailService.
    if (data.RESEND_API_KEY && !data.EMAIL_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message:
          'RESEND_API_KEY is set but EMAIL_FROM is missing — both must be configured together for Resend email delivery.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

// Wraps Zod's own (already value-free) per-field detail with project
// context — which file the variable belongs in and where the setup docs
// are — since z.prettifyError alone names the field but assumes the reader
// already knows this repo's two-env-file split. Only ever reads
// issue.path/.message from Zod's own error object, never the raw input, so
// there is no path by which a secret value could end up in this message.
function formatValidationError(error: z.ZodError): string {
  const failingFields = new Set(
    error.issues.map((issue) => String(issue.path[0])),
  );
  const lines = [
    'Invalid API environment configuration.',
    '',
    'Backend variables belong in api/.env — not the root .env.local.',
    'See api/.env.example and README.md §C Step 4 (Configure Environment Variables) for setup instructions.',
  ];
  if (failingFields.has('JWT_SECRET')) {
    lines.push(
      '',
      'JWT_SECRET must be byte-identical to the root .env.local value — both apps verify the same session cookies.',
    );
  }
  lines.push('', 'Details:', z.prettifyError(error));
  return lines.join('\n');
}

export function validate(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatValidationError(result.error));
  }
  return result.data;
}
