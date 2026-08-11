# Verify the Resend sending domain setup

**Labels:** `deployment`, `priority:p2`, `blocked`
**Type:** Chore (operational)
**Priority:** P2 within deployment — **blocked on a domain decision**

## Background

`docs/deployment-readiness.md` §5. Email delivery is optional in code: without `RESEND_API_KEY` the app falls back to `ConsoleEmailService`, which logs a masked confirmation instead of sending. Password reset then works but delivers nothing.

Resend refuses to send to addresses outside the account owner's until a **sending domain is verified**. That is why local attempts to email fabricated `@porac.ph` addresses return a provider error — logged, never thrown (see #014).

## Problem

Without a verified sending domain, **password reset does not work for real citizens in production**. A citizen who forgets their password would receive nothing, and the enumeration-resistant response means the UI would still report success — so the failure is invisible from the outside.

For a system where citizen accounts are mandatory (there is no guest reporting), a broken password reset locks people out of reporting entirely.

## Proposed scope

1. **Register the sending domain** (depends on the domain decision — see `docs/deployment-readiness.md` §11).
2. **Complete Resend's DNS verification** — SPF and DKIM records.
3. **Set `EMAIL_FROM`** to an address on that verified domain. **Set it together with `RESEND_API_KEY`** — setting the key alone is a startup failure (#014).
4. **Set `WEB_ORIGIN`** to the production frontend origin so reset links resolve to the right host.
5. **Send one real end-to-end password reset** to a non-owner address and confirm it arrives, is not spam-filtered, and its link works.
6. **Decide whether notification emails ship beyond password reset** — currently undecided (`docs/deployment-readiness.md` §11).

## Implementation notes

- Step 5 is the acceptance test. Everything before it can look correct while delivery still fails.
- Check the spam folder — a newly verified domain with no sending reputation often lands there initially.
- `WEB_ORIGIN` is used for password-reset links, OAuth redirects, and notification links. A wrong value produces emails with links to the wrong host.
- If the domain is not ready at deploy time, the honest fallback is documenting that password reset is non-functional in production until it is — not pretending it works.

## Files likely involved

- No application code — this is configuration and DNS.
- `docs/deployment-readiness.md` §5 and §10
- `docs/runbook.md` (#022)
- `docs/project-status.md` §4.4

## Acceptance criteria

- [ ] Sending domain registered and verified with Resend (SPF + DKIM passing).
- [ ] `EMAIL_FROM` set to an address on the verified domain, alongside `RESEND_API_KEY`.
- [ ] `WEB_ORIGIN` set to the production frontend origin.
- [ ] A real password reset delivered to a **non-owner** address, arriving in the inbox.
- [ ] The reset link in that email works end to end.
- [ ] A decision recorded on whether other notification emails ship.

## Suggested tests

- End-to-end: request a password reset for a real address you control on a different provider, confirm delivery and that the link completes a password change.
- Confirm the API boots cleanly with both variables set (the paired-variable failure from #014).

## Out of scope

Switching email providers, email templates or design changes, notification emails beyond password reset (pending the decision above), and email deliverability tuning beyond initial SPF/DKIM.

## Risks / notes

This is easy to declare done after the DNS records validate. It is not done until an email has actually landed in someone's inbox with a working link.

## Claude Code handoff prompt

```
DO NOT START — blocked until a domain is chosen for PORAC-SDSS
(docs/deployment-readiness.md §11).

When unblocked:

Read first: docs/deployment-readiness.md §5, api/src/citizens/resend-email
.service.ts, api/src/citizens/citizens.module.ts (the provider factory),
api/src/config/env.ts, README.md §C Step 4.

Context: without a verified sending domain, password reset silently does not
work for real citizens — the enumeration-resistant response still reports
success, so the failure is invisible from the outside. Citizen accounts are
mandatory (no guest reporting), so this locks people out of reporting entirely.

Steps:
1. Register the sending domain and complete Resend's DNS verification (SPF,
   DKIM).
2. Set EMAIL_FROM to an address on that domain. Set it TOGETHER with
   RESEND_API_KEY — setting the key alone is a startup failure, because the
   factory constructs ResendEmailService and its constructor requires
   EMAIL_FROM.
3. Set WEB_ORIGIN to the production frontend origin — it builds password-reset
   links, OAuth redirects, and notification links.
4. THE ACCEPTANCE TEST: send one real password reset to a NON-OWNER address on
   a different email provider. Confirm it arrives (check spam — a newly
   verified domain often lands there), and that the link completes a password
   change end to end.
5. Record a decision on whether notification emails ship beyond password reset.

This is configuration and DNS — no application code changes expected.

If the domain is not ready at deploy time, document honestly that password
reset is non-functional in production until it is. Do not pretend otherwise.

Update docs/deployment-readiness.md §5/§10, docs/runbook.md, and
docs/project-status.md §4.4. Then git diff --check
```
