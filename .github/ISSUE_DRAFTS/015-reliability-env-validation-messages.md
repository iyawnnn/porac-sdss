# Add clearer API startup validation messages for missing env vars

**Labels:** `reliability`, `priority:p3`, `backend`, `dx`
**Type:** Enhancement (developer experience)
**Priority:** P3

## Background

`api/src/config/env.ts` validates the environment with a Zod schema at **boot**, not at first request — a good design choice. A missing or malformed required variable fails startup immediately:

```ts
throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
```

Required: `DATABASE_URL`, `JWT_SECRET` (min 32), `CLOUDINARY_URL` (must start `cloudinary://`), `OPENWEATHERMAP_API_KEY`, `CRON_SECRET` (min 16).

## Problem

`z.prettifyError` names the failing variable but gives no project context. A new team member — or a returning one on a fresh clone — sees a validation error with no pointer to:

- **which file** the variable belongs in (`api/.env`, *not* root `.env.local` — a genuinely confusing split this project has already had to document),
- **where the documentation is** (`README.md` §C Step 4 has the full tables),
- **which pairs must match** (`JWT_SECRET` must be byte-identical across both env files),
- **which variables must be set together** (`RESEND_API_KEY` + `EMAIL_FROM` — see #014).

Both `README.md` and `CLAUDE.md` carry warnings that this two-env-file split is a common stumbling block. The error message is where that guidance is most needed and currently absent.

## Proposed scope

Wrap the existing validation failure with a short, actionable message:

1. State clearly that the variables belong in **`api/.env`**, not the root `.env.local`.
2. Point at `README.md` §C Step 4 and `api/.env.example`.
3. Call out `JWT_SECRET` needing to match root `.env.local` exactly, when that is the failing variable.
4. Keep Zod's per-variable detail — it is good; this adds context around it, not instead of it.

## Implementation notes

- Keep it to a handful of lines. This is an error-message improvement, not a config framework.
- **Never print an actual env value** in the error — only variable names. A malformed `DATABASE_URL` or `CLOUDINARY_URL` contains credentials.
- Consider a `superRefine` for paired variables (`RESEND_API_KEY` + `EMAIL_FROM`), which overlaps #014 — coordinate so the two issues do not both implement it.
- The existing message format is already reasonable; do not restructure it wholesale.

## Files likely involved

- `api/src/config/env.ts`
- Possibly `api/src/main.ts` (if the wrapping happens at bootstrap)
- `README.md` §C Step 4 — only if the guidance changes

## Acceptance criteria

- [ ] A missing required variable produces an error naming the variable **and** stating it belongs in `api/.env`.
- [ ] The message points at `README.md` §C Step 4 and `api/.env.example`.
- [ ] No env **value** appears in any error output.
- [ ] Zod's per-field detail is preserved.
- [ ] `pnpm --prefix api build` passes and the API still starts normally with a valid `.env`.

## Suggested tests

- Unit test on the `validate()` function: missing `DATABASE_URL` produces a message containing the variable name and the `api/.env` guidance.
- Manual: temporarily rename `api/.env` and confirm the message is genuinely helpful.
- `pnpm --prefix api test`.

## Out of scope

Changing which variables are required, adding new variables, changing the Zod schema's validation rules, and runtime (non-boot) config reloading.

## Risks / notes

Keep it proportionate — the current behavior is already correct, just terse. A few well-chosen lines beat a config-diagnostics subsystem.

## Claude Code handoff prompt

```
Improve PORAC-SDSS API startup env-validation error messages.

Read first: api/src/config/env.ts, api/src/main.ts, README.md §C Step 4,
api/.env.example, CLAUDE.md (the two-env-file split section).

The API already validates env at boot via Zod and fails fast — that design is
correct and should not change. The problem is that z.prettifyError names the
variable but gives no project context.

Wrap the existing failure with a short actionable message that:
1. States the variables belong in api/.env, NOT the root .env.local (this split
   is a documented stumbling block).
2. Points at README.md §C Step 4 and api/.env.example.
3. When JWT_SECRET is the failing variable, notes it must be byte-identical to
   the root .env.local value.
4. Preserves Zod's existing per-variable detail — add context around it, do not
   replace it.

NEVER print an env VALUE in an error — only variable names. DATABASE_URL and
CLOUDINARY_URL contain credentials.

Note: paired-variable validation (RESEND_API_KEY + EMAIL_FROM) overlaps issue
#014. Implement it in only one of the two.

Do NOT change which variables are required, add variables, alter validation
rules, or add runtime config reloading.

Add a unit test on validate(): a missing DATABASE_URL yields a message
containing the variable name and the api/.env guidance.

Verify: pnpm --prefix api test, pnpm --prefix api build, and manually rename
api/.env to confirm the message is actually helpful. Then git diff --check
```
