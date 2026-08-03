import { z } from 'zod';

// Fails at boot, not at first request — see PLAN blueprint §2. Only
// DATABASE_URL is exercised by anything built so far (Phase 1: health
// check only); the rest is declared now so later phases don't need to
// revisit this file per-endpoint.
const envSchema = z.object({
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
  FACEBOOK_APP_ID: z.string().min(1).optional(),
  FACEBOOK_APP_SECRET: z.string().min(1).optional(),
  FACEBOOK_REDIRECT_URI: z.string().url().optional(),
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
});

export type Env = z.infer<typeof envSchema>;

export function validate(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
