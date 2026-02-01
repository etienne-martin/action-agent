# Codex Worker

Reusable GitHub Actions workflow that runs Codex CLI from issues and issue comments.

## What this does

- Runs Codex on GitHub-hosted runners.
- Persists Codex session state per issue via artifacts.
- Posts responses back to the issue.
- Can create branches/commits and open PRs when instructed.

## Requirements

1) OpenAI API key
- Add `OPENAI_API_KEY` as a secret in the target repo or org.

2) Repo settings (required for PR creation)
- Settings → Actions → Workflow permissions → **Read and write**
- Enable **“Allow GitHub Actions to create and approve pull requests.”**

3) Caller workflow permissions
- `contents: write`
- `issues: write`
- `pull-requests: write`
- `actions: read`

## Quick start (caller workflow)

Create a workflow in the target repo, e.g. `.github/workflows/codex-worker-issue.yml`:

```yaml
name: Codex Worker Issue

on:
  issues:
    types: [opened, edited]
  issue_comment:
    types: [created, edited]

permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: read

jobs:
  codex-worker:
    concurrency:
      group: ${{ format('issue-{0}', github.event.issue.number) }}
      cancel-in-progress: false
    uses: etienne-martin/codex-worker/.github/workflows/issue.yml@main
    with:
      issue_number: ${{ github.event.issue.number }}
      comment_id: ${{ github.event.comment.id || '' }}
      # Optional:
      # model: gpt-5.1-codex-mini
      # reasoning_effort: low
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Notes

- The runner filesystem is ephemeral. Only commits pushed to a branch persist.
- For follow-up comments, a session artifact must exist or the run fails.
- If Codex creates changes, it should commit and push before responding.

## Files

- `/.github/workflows/issue.yml` — reusable workflow entry point.
- `/draft.md` — original design notes and exploration.
