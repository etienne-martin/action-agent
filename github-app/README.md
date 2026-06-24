# GitHub App setup

This folder contains a helper HTML page with an embedded manifest to create a GitHub App with the right defaults.

## When to use a GitHub App

- You want a distinct bot identity for comments and commits.
- You need your agent to be able to update workflow files in `.github/workflows`.
- You need your agent to refresh repository Actions secrets such as `CODEX_AUTH_JSON`.
- You need org-wide access across multiple repos.

## Create the app

1. Open [create-app.html](./create-app.html) in your browser (download it first, then open locally).
2. Select `Personal` or `Organization` and enter the org slug if needed.
3. Click "Create GitHub App from manifest".
4. Review the configuration and create the app.
5. GitHub redirects you with a `code` in the URL. Paste that code into the helper page to get the conversion command.
6. Run the conversion command to finalize the app and get the App ID and private key:

```bash
gh api --method POST /app-manifests/<code>/conversions
```

7. Install the app on your org or repo. Select the repo(s) you want the app to access. If “selected repositories,” ensure your target repo is included.

Alternatively create the app manually in GitHub settings if you want different permissions.

## Store credentials

- Set `WORKFLOW_AGENT_GITHUB_APP_ID` as a variable.
- Set `WORKFLOW_AGENT_GITHUB_APP_PRIVATE_KEY` as a secret.

Use org-level settings for reuse across repos, or repo-level settings for a single repo.

## Use in a workflow

```yaml
- uses: actions/create-github-app-token@v1
  id: app_token
  with:
    app-id: ${{ vars.WORKFLOW_AGENT_GITHUB_APP_ID }}
    private-key: ${{ secrets.WORKFLOW_AGENT_GITHUB_APP_PRIVATE_KEY }}
    permission-secrets: write

- uses: sudden-network/agent@v1
  with:
    agent_auth_file: ${{ secrets.CODEX_AUTH_JSON }}
    agent_auth_file_secret_name: CODEX_AUTH_JSON
    github_token: ${{ steps.app_token.outputs.token }}
    github_token_actor: ${{ steps.app_token.outputs.app-slug }}[bot]
    ...
```

Refresh writeback requires `agent_auth_file_secret_name`, `github_token`, and `permission-secrets: write`. The action writes changed auth files back as repository secrets. If the run initially reads an organization secret, writeback creates or updates a repository secret with the same name for that repository.

Use a separate Codex `auth.json` for this GitHub Actions secret. Running `codex logout` with the same file revokes its refresh token and invalidates `CODEX_AUTH_JSON`.

Create that separate file locally without touching your normal `~/.codex` login:

```bash
curl -fsSL https://raw.githubusercontent.com/sudden-network/agent/main/scripts/bootstrap-codex-auth.sh | bash
```

The script uses Codex browser login with a fresh temporary `CODEX_HOME`. Paste the copied `auth.json` into the `CODEX_AUTH_JSON` GitHub Actions secret. Run it once per repo or org secret; do not reuse one generated `auth.json` across repos or orgs.
