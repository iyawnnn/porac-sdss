# Add a lint/typecheck/build verification checklist

**Labels:** `ci`, `docs`, `priority:p3`, `dx`
**Type:** Chore (documentation + optional tooling)
**Priority:** P3

## Background

`docs/testing.md` §1 lists every verification layer and its command. Two gaps are documented there:

- **No root typecheck script exists.** `pnpm exec tsc --noEmit` has to be typed from memory; it is not in `package.json`.
- **`pnpm --prefix api lint` runs with `--fix`**, so it silently modifies files — surprising if you expected a read-only check.

CI runs API build → API tests → root lint → root build. It does **not** run a typecheck step, and does not lint the API.

## Problem

There is no single command or checklist a contributor can run before opening a PR to know they have covered what CI covers, plus the parts CI misses. The knowledge is spread across `docs/testing.md`, `CLAUDE.md`, and CI's step list.

## Proposed scope

Two parts, the first mandatory:

**1. A pre-PR checklist** in `docs/testing.md`, ordered fastest-to-slowest:

```
pnpm exec tsc --noEmit          # root types
pnpm lint                       # root lint
pnpm --prefix api test          # 36 spec files, no DB needed
pnpm --prefix api build         # nest build
pnpm build                      # next build
# then targeted Playwright specs for what you touched
```

**2. Optional convenience scripts** in `package.json`:

- a root `typecheck` script for `tsc --noEmit`
- possibly a `verify` script chaining typecheck + lint + build

**Note:** `package.json` is normally out of scope for docs work. If the team prefers documentation only, part 2 can be dropped without losing most of the value — say so in the PR.

## Implementation notes

- **Do not add `--fix` to any new script.** A verification command must not mutate the working tree.
- Consider whether CI should also gain a typecheck step. `pnpm build` catches many type errors, but not all, and it is slower. Recommend, do not silently add.
- Consider whether CI should lint the API too. It currently does not, and the API script's `--fix` makes it unsuitable for CI as written.

## Files likely involved

- `docs/testing.md` §1 or a new pre-PR section
- Possibly `package.json` (root) — scripts only
- Possibly `.github/workflows/ci.yml` — only if a typecheck step is agreed

## Acceptance criteria

- [ ] `docs/testing.md` contains an ordered, copy-pasteable pre-PR checklist.
- [ ] The checklist notes which commands CI already runs and which it does not.
- [ ] The API lint `--fix` behavior is called out where a reader will hit it.
- [ ] If scripts are added: none of them mutate files, and they work on Windows and POSIX.
- [ ] No existing script's behavior changed.

## Suggested tests

- Run every command in the checklist on a clean tree and confirm each passes and none modifies files (`git status` clean afterwards, except where `--fix` is expected).

## Out of scope

Changing what CI gates on without team agreement, adding a pre-commit hook or Husky, coverage thresholds, and changing the existing API lint script's `--fix`.

## Risks / notes

Keep it a checklist, not a process. The value is that a contributor can copy six lines and know they are covered.

## Claude Code handoff prompt

```
Add a pre-PR verification checklist for PORAC-SDSS.

Read first: docs/testing.md §1, package.json (root), api/package.json,
.github/workflows/ci.yml, CLAUDE.md (commands sections).

Two known gaps to account for: there is no root typecheck script (tsc --noEmit
must be typed manually), and `pnpm --prefix api lint` runs with --fix, so it
MODIFIES files rather than just checking.

Part 1 (required): add an ordered, copy-pasteable pre-PR checklist to
docs/testing.md, fastest to slowest:
  pnpm exec tsc --noEmit
  pnpm lint
  pnpm --prefix api test
  pnpm --prefix api build
  pnpm build
  then targeted Playwright specs for whatever you touched
Mark clearly which of these CI already runs and which it does not (CI runs API
build, API tests, root lint, root build — no typecheck, no API lint).
Call out the API lint --fix behavior where a reader will hit it.

Part 2 (optional, drop if the team prefers docs-only): add a root `typecheck`
script and possibly a `verify` script chaining typecheck + lint + build. NO new
script may use --fix or otherwise mutate the working tree.

Do NOT: change what CI gates on without agreement, add a pre-commit hook or
Husky, add coverage thresholds, or change the existing API lint script.

Verify: run every command in the checklist on a clean tree; confirm each passes
and that git status is clean afterwards. Then git diff --check
```
