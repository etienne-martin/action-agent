# Issue assistant

Auto-triage issue threads: ask clarifying questions and close duplicates.

## Workflow

```yaml
name: issue-assistant

on:
  issues:
    types: [opened, edited, reopened]
  issue_comment:
    types: [created, edited]

concurrency:
  group: issue-assistant-${{ github.event.issue.number }}
  cancel-in-progress: false

jobs:
  issue-assistant:
    if: ${{ !github.event.issue.pull_request }}
    runs-on: ubuntu-latest
    permissions:
      contents: write # create branches/commits when an issue request becomes a PR
      pull-requests: write # open PRs when asked
      issues: write # post comments, close duplicates
      actions: read # resume sessions via artifacts
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run sudden-agent
        uses: sudden-network/agent@v1
        with:
          agent_api_key: ${{ secrets.OPENAI_API_KEY }}
          resume: true
          prompt: |
            Goals:
            - Help the developer turn this issue into a clear, implementable plan.
            - When asked, move the work into a pull request.

            Duplicate detection:
            - On `issues` events with action `opened` or `reopened`, search existing issues (open + closed) for
              duplicates (do not limit by label).
            - If high-confidence duplicate: comment `Duplicate of #<n>` (1-line why), close this issue, then stop.
            - If possible duplicate but unsure: comment with up to 3 candidates and ask the author to confirm; do not
              close.

            Be concise and specific.
            Review the issue and any new comments or edits.
            Ask for missing info, confirm scope, and propose concrete next steps.
            Point to relevant files or areas of the codebase when applicable.
            If the author asks you to implement or open a PR, do so, link the issue, and comment back with a short
            summary and the PR link.
            If no response is warranted, do nothing.
```
