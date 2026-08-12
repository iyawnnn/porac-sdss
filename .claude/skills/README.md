# Claude Code skills (repo-owned)

Repo-owned Claude Code skills for PORAC-SDSS, checked in so both project members get the same workflow when implementing backlog issues.

## How to use them

- Ask for a skill **by name** in your prompt. Automatic skill selection exists but is not reliable — don't count on it.
- Type `/` in Claude Code to see available commands and skills, if your version lists them.
- These skills do not replace `CLAUDE.md`, the `docs/` reference set, or the GitHub issue body. They are a workflow wrapper around those; the docs and the issue remain the source of truth.

## The skills

| Skill | Use it for |
|---|---|
| `porac-github-issue-implementation` | Implementing one focused GitHub issue: read the issue, scope it, plan, make the smallest change, verify. |
| `porac-code-review` | Reviewing your current diff before commit or PR — security, scope, docs drift. |
| `porac-test-verification` | Choosing the smallest safe test set for what you touched. |

## Recommended team workflow

1. Pick **one** GitHub issue.
2. Ask: *"Use porac-github-issue-implementation for GitHub issue #44. Read the issue first. Plan first; do not edit yet."*
3. Review the plan. Correct the scope now, not after the edits.
4. Let Claude implement.
5. Ask: *"Use porac-code-review on my current diff."*
6. Ask: *"Use porac-test-verification for the files changed."*
7. Run the recommended commands yourself.
8. Commit.

## Example prompts

```
Use porac-github-issue-implementation for GitHub issue #44. Plan first; do not edit yet.
Use porac-github-issue-implementation for this pasted issue body.
Use porac-code-review on my current diff.
Use porac-test-verification for this Playwright change.
Use porac-test-verification and recommend the smallest safe test set.
```

## Notes

- `.github/ISSUE_DRAFTS/` is temporary seeding material for creating the GitHub backlog and may be deleted. Once an issue exists on GitHub, its issue body is the source of truth; the skills never require the drafts to exist.
- Keep each skill narrow. If a skill starts accumulating unrelated rules, that's a sign it should stay as-is and the rule belongs in `CLAUDE.md` or a `docs/` file instead.