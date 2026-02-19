# Security audit

Run a scheduled security review that scans for risky patterns and files issues with suggested fixes.

## Workflow

```yaml
name: security-audit

on:
  schedule:
    - cron: "0 3 * * 0" # weekly at 03:00
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: false

jobs:
  security-audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read # scan repo for findings
      issues: write # file issues with results
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run sudden-agent
        uses: sudden-network/agent@v1
        with:
          agent_api_key: ${{ secrets.OPENAI_API_KEY }}
          prompt: |
            Goals:
            - Run a weekly, in-depth security audit of the entire repository.
            - Identify security flaws, abuse vectors, and security holes.
            - Create one issue per finding with correct labels.

            Scope:
            - Entire repository (apps, packages, infrastructure, .github, scripts, functions, tests, configs).

            Rules:
            - Do not use internet browsing or external security scanners; reasoning only. GitHub API calls are allowed +
              REQUIRED (issue search, create, comment, reopen).
            - Do not perform exploitation or live probing.
            - Do not exfiltrate secrets or PII.
            - Before creating any new issue for a finding, search existing issues (open + closed) for duplicates across
              the entire repo (do not limit by label).
            - Use 2-3 different searches (endpoint path, file path, key terms) and read the top results.
            - If a duplicate exists: do not open a new issue. Comment on the existing issue with any new details; if
              closed and still relevant, reopen then comment.

            For each finding:
            - After the duplicate check passes, open a GitHub issue with: summary, severity (low|medium|high|critical),
              impact, repro outline, fix guidance, abuse prevention note.
            - Add labels: security, weekly-audit, severity:low|medium|high|critical.
            - File issues immediately after confirming each finding; do not wait until the full audit is complete.

            If no findings:
            - Do not open issues.
```
