# Add a CI job summary for build and test results

**Labels:** `ci`, `priority:p4`, `dx`
**Type:** Enhancement (developer experience)
**Priority:** P4 — nice to have, not blocking anything

## Background

`.github/workflows/ci.yml` runs two parallel jobs — Frontend (typecheck, lint, build) and API (build-recovery check, build, unit tests) — six checks total. Results are readable only by expanding individual step logs.

## Problem

On a failure, a reviewer has to open the run and expand steps to learn what actually broke. There is no at-a-glance summary on the PR or the Actions run page. With 36 API spec files, "the tests failed" is not enough to triage from.

## Proposed scope

Write a GitHub Actions **job summary** (`$GITHUB_STEP_SUMMARY`) reporting:

- Pass/fail per step, as a small table.
- Jest results: total tests, passed, failed, and the names of any failures.
- Lint: error and warning counts.
- Build: success/failure for both the API and root builds.

`$GITHUB_STEP_SUMMARY` accepts Markdown and renders on the run page — no external service, no new dependency.

## Implementation notes

- Keep it entirely inside the workflow file. **No new npm packages.**
- Use `if: always()` so the summary is written even when an earlier step fails — that is the case it exists for.
- Jest can emit JSON (`--json --outputFile=`) for parsing. Weigh that against a simpler approach: even a step-status table is a real improvement over nothing.
- Do not fail the build because summary generation failed. The summary is diagnostics, not a gate.

## Files likely involved

- `.github/workflows/ci.yml`
- Possibly `docs/testing.md` §1 (mention the summary exists)

## Acceptance criteria

- [ ] A job summary appears on the Actions run page for both passing and failing runs.
- [ ] Failing test names are listed, not just a count.
- [ ] The summary is written even when a step fails (`if: always()`).
- [ ] No new dependency added.
- [ ] Summary generation failing never fails the build.

## Suggested tests

- Push a branch with a deliberately failing unit test and confirm the summary names it.
- Push a passing branch and confirm the summary is still generated.

## Out of scope

Playwright results (#019 — Playwright does not run in CI yet), PR comment bots, code-coverage reporting or gates, and any external CI dashboard.

## Risks / notes

Genuinely optional. If it starts requiring a custom parser or a new action dependency, scale it back to a step-status table — that alone covers most of the value.

## Claude Code handoff prompt

```
Add a GitHub Actions job summary to PORAC-SDSS CI.

Read first: .github/workflows/ci.yml (two parallel jobs: Frontend — typecheck,
lint, build; API — build-recovery, build, Jest tests), docs/testing.md §1.

Write a job summary to $GITHUB_STEP_SUMMARY (Markdown, renders on the Actions
run page — no external service needed) containing:
- a small pass/fail table for each of the six checks, grouped by job
- Jest results: total / passed / failed, and the NAMES of any failing tests
- lint error and warning counts
- build success/failure for API and root

Requirements:
- Everything inside the workflow file. Do NOT add an npm package or a
  third-party action.
- Use if: always() so the summary is written when an earlier step fails — that
  is the case it exists for.
- Summary generation failing must NEVER fail the build.
- If parsing Jest JSON turns out to need a custom parser, scale back to a
  step-status table. Do not over-build this.

Do NOT add: Playwright results (it does not run in CI yet), a PR comment bot,
coverage reporting or gates.

Verify: push a branch with a deliberately failing unit test, confirm the
summary names it; then confirm a passing run still generates one.
```
