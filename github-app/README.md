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
    github_token: ${{ steps.app_token.outputs.token }}
    github_token_actor: ${{ steps.app_token.outputs.app-slug }}[bot]
    ...
```

## Use Codex with ChatGPT in Actions

For the default agent (`codex`), `agent_auth_file` can inject Codex's `auth.json` so the CLI can use a ChatGPT subscription. Codex can update that login file during a run, so the action saves the updated file back into `CODEX_AUTH_JSON`.

During a run:

- The workflow passes `agent_auth_file: ${{ secrets.CODEX_AUTH_JSON }}`.
- The action writes that value to Codex's `~/.codex/auth.json`.
- Codex may update `auth.json`.
- If `auth.json` changed, the action saves it back to the existing `CODEX_AUTH_JSON` repository or organization secret.

Requirements:

- The workflow must pass `agent_auth_file: ${{ secrets.CODEX_AUTH_JSON }}`. GitHub does not let actions read secret values by name.
- `CODEX_AUTH_JSON` must already exist as a repository secret or an organization secret shared with the repository.
- `github_token` must be a GitHub App token with `permission-secrets: write`; the default `GITHUB_TOKEN` cannot update secrets.
- Updating an organization secret requires the GitHub App to have the organization `secrets: write` permission.

Use a separate Codex `auth.json` for this GitHub Actions secret. Running `codex logout` with the same file revokes its refresh token and invalidates `CODEX_AUTH_JSON`.

Create that separate file locally without touching your normal `~/.codex` login:

```bash
curl -fsSL https://raw.githubusercontent.com/sudden-network/agent/main/scripts/bootstrap-codex-auth.sh | bash
```

The script uses Codex browser login with a fresh temporary `CODEX_HOME`. Paste the copied `auth.json` into the `CODEX_AUTH_JSON` GitHub Actions secret. Run it once per repo or org secret; do not reuse one generated `auth.json` across repos or orgs.
