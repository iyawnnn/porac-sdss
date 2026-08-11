# Improve Resend/email failure visibility in development

**Labels:** `reliability`, `priority:p3`, `backend`, `dx`
**Type:** Enhancement (developer experience)
**Priority:** P3

## Background

`docs/deployment-readiness.md` §5. The email provider is chosen at startup: `ResendEmailService` if `RESEND_API_KEY` is set, otherwise `ConsoleEmailService`, which logs a masked confirmation instead of sending.

`ResendEmailService` **never throws** on a send failure. It logs the provider's error name and message — never the reset URL or token — and returns. That is deliberate and correct: a provider outage must not break the password-reset flow's enumeration-resistant response, and must not leak whether an address exists.

## Problem

Two developer-experience gaps follow from that correct design:

1. **A Resend rejection looks like nothing happened.** Resend refuses to send to addresses outside the account owner's until a sending domain is verified, so local attempts to email fabricated `@porac.ph` addresses fail with a provider error. The flow reports success (as designed), and the failure is a single log line easy to miss. Developers reasonably conclude the app is broken.

2. **`RESEND_API_KEY` without `EMAIL_FROM` is a startup failure.** The factory constructs `ResendEmailService` when the key is present, and that constructor throws if `EMAIL_FROM` is missing. Setting one without the other kills API startup — with an error that does not obviously say "you set one of a required pair."

## Proposed scope

1. **Make the provider choice visible at startup.** One clear log line on boot: which email service is active, and — for `ConsoleEmailService` — that no mail will actually be sent.
2. **Make send failures unmissable in development.** Keep the never-throw contract, but log at a level and format that stands out, and add a hint when the error looks like the unverified-domain case (a 403 to a non-owner address).
3. **Improve the paired-env-var failure.** Fail with a message that names *both* variables and says they must be set together.
4. **Document the local behavior** so the next developer does not debug a non-bug.

## Implementation notes

- **Do not change the never-throw contract.** That is a security property, not an oversight — see `docs/security.md` §2.6.
- Never log the reset URL, the token, or an unmasked email address. The existing masking helper is the pattern to follow.
- Keep the hint heuristic modest — matching on a provider status/error name is enough. Do not build error-code taxonomy.
- Consider whether the `EMAIL_FROM` check belongs in the Zod env schema (a superrefine pairing the two) rather than the service constructor. That would fail earlier with a better message.

## Files likely involved

- `api/src/citizens/resend-email.service.ts`
- `api/src/citizens/email.service.ts` (`ConsoleEmailService`)
- `api/src/citizens/citizens.module.ts` (the factory)
- Possibly `api/src/config/env.ts` (paired-variable validation)
- `README.md` §C Step 4, `docs/deployment-readiness.md` §5

## Acceptance criteria

- [ ] Boot logs state which email provider is active.
- [ ] `ConsoleEmailService` boot log makes clear no real mail is sent.
- [ ] A Resend send failure is clearly visible in the API log with the provider's error name.
- [ ] Setting `RESEND_API_KEY` without `EMAIL_FROM` fails with a message naming both.
- [ ] No secret, token, reset URL, or unmasked address is ever logged.
- [ ] The never-throw behavior on send failure is unchanged.
- [ ] README/deployment docs note that a local 403 to a fabricated address is the provider declining, not an app bug.

## Suggested tests

- `pnpm --prefix api test` — existing `resend-email.service.spec.ts` must still pass.
- Manual: start the API with and without `RESEND_API_KEY`, confirm the boot lines.
- Manual: start with `RESEND_API_KEY` but no `EMAIL_FROM`, confirm the improved failure.

## Out of scope

Actually verifying a sending domain (#027), switching email providers, queuing or retrying failed sends, and any change to what emails are sent.

## Risks / notes

The tempting wrong fix is making send failures throw so they are obvious. **Do not** — that would break the enumeration-resistant password-reset response.

## Claude Code handoff prompt

```
Improve email/Resend failure visibility in PORAC-SDSS development.

Read first: api/src/citizens/resend-email.service.ts,
api/src/citizens/email.service.ts, api/src/citizens/citizens.module.ts (the
provider factory), api/src/config/env.ts, docs/security.md §2.6,
docs/deployment-readiness.md §5.

Context: ResendEmailService never throws on send failure — that is a deliberate
security property (a provider outage must not break the enumeration-resistant
password-reset response). DO NOT change that contract.

Scope:
1. Log which email provider is active at boot. For ConsoleEmailService, make
   clear that no real mail is sent.
2. Make send failures clearly visible in the API log (keep never-throw). Add a
   modest hint when the error looks like Resend's unverified-domain rejection
   (403 to a non-owner address) — this is the confusing local case.
3. Setting RESEND_API_KEY without EMAIL_FROM currently kills API startup via
   the service constructor. Make it fail with a message naming BOTH variables
   and stating they must be set together. Consider moving this to a Zod
   superRefine in api/src/config/env.ts so it fails earlier and better.
4. Note in README §C Step 4 and docs/deployment-readiness.md §5 that a local
   403 to a fabricated @porac.ph address is the provider declining, not an app
   bug.

NEVER log the reset URL, the token, or an unmasked email address — follow the
existing masking helper.

Do NOT: make send failures throw, change which emails are sent, add retry/queue
logic, or switch providers.

Verify: pnpm --prefix api test (resend-email.service.spec.ts must still pass),
plus manual boots with/without RESEND_API_KEY and with the key but no
EMAIL_FROM. Then git diff --check
```
