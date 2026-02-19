# Version bump

Suggest a semantic version bump for pull requests.

## Workflow

````yaml
name: version-bump

on:
  pull_request:
    types: [opened, reopened, edited, synchronize, ready_for_review]

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.event.issue.number }}
  cancel-in-progress: false

jobs:
  version-bump:
    if: ${{ !github.event.pull_request.draft }}
    runs-on: ubuntu-latest
    permissions:
      contents: write # update package.json in the PR branch
      pull-requests: write # post inline review comments
      issues: write # post PR conversation comments
      actions: read # resume sessions via artifacts
    steps:
      - name: Run sudden-agent
        uses: sudden-network/agent@v1
        with:
          agent_api_key: ${{ secrets.OPENAI_API_KEY }}
          resume: true
          prompt: |
            Goal: keep package.json version(s) aligned with the impact of changes.

            Identify which published packages are affected by this PR. For most repos:
            - Treat the root package.json as a published package unless it is private.
            - Also consider package.json files under packages/ or apps/ that are not private.
            - Prefer bumping only packages touched by this PR.

            Bump rules:
            - Breaking change -> major.
            - New backward-compatible feature -> minor.
            - Backward-compatible fixes or runtime-affecting changes -> patch (bugs, perf, dependency updates, docs for
              public API).
            - Tooling-only changes (tests, build/CI, internal refactors with no runtime impact) -> no bump.

            Detect manual bumps (package.json version changed vs base). If present and correct, keep. If wrong, adjust.

            Before applying or reapplying a bump, review the PR conversation and commit history for prior bump reverts
            or explicit rejections. If the same bump reason was previously rejected or reverted, do not reapply it.
            Only reapply when the PR diff changed after the rejection and you can justify a different bump reason. If
            you reapply, say why the prior rejection no longer applies.

            If a bump is required, update the matching package.json version(s) in the PR branch, only edit the
            `version` field, and add an inline comment with a short reason.
            If no bump is required and no manual bump is present, do not change files and do not comment.
````
