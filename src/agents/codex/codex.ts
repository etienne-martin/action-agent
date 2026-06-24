import fs from 'fs';
import os from 'os';
import path from 'path';
import { context } from '@actions/github';
import { downloadLatestArtifact, uploadArtifact } from '../../github/artifacts';
import { runCommand } from '../../exec';
import type { ExecOptions } from '@actions/exec';
import { inputs } from '../../github/input';
import { isPermissionError } from '../../github/error';
import { info, warning } from '@actions/core';
import { BootstrapOptions, BootstrapResult } from '../../agent';
import type { McpServerConfig } from '../../mcp';
import { CODEX_AUTH_SECRET_NAME, updateActionsSecret } from '../../github/secrets';

type AuthStrategy =
  | { kind: 'api_key'; apiKey: string }
  | { kind: 'auth_file'; authFile: string };

const CODEX_VERSION = '0.136.0';
const CODEX_DIR = path.join(os.homedir(), '.codex');
const CODEX_CONFIG_PATH = path.join(CODEX_DIR, 'config.toml');
const CODEX_AUTH_PATH = path.join(CODEX_DIR, 'auth.json');
const CODEX_SESSIONS_PATH = path.join(CODEX_DIR, 'sessions');

const ensureDir = (dir: string) => fs.mkdirSync(dir, { recursive: true });

const shouldResume = (): boolean => {
  if (!inputs.resume) return false;
  return Boolean(context.payload.issue || context.payload.pull_request);
};

export const buildConfig = (mcpServers: McpServerConfig[]) => [
  'cli_auth_credentials_store = "file"',
  ...mcpServers.map(({ name, url }) => [
    `[mcp_servers.${name}]`,
    `url = "${url}"`,
    'default_tools_approval_mode = "approve"',
  ].join('\n')),
].join('\n\n');

const writeCodexConfig = (mcpServers: McpServerConfig[]) => {
  ensureDir(CODEX_DIR);
  fs.writeFileSync(CODEX_CONFIG_PATH, buildConfig(mcpServers));
};

const restoreSession = async (): Promise<boolean> => {
  if (!shouldResume()) return false;
  ensureDir(CODEX_SESSIONS_PATH);

  try {
    if (await downloadLatestArtifact(CODEX_SESSIONS_PATH)) {
      info('Restored previous session');
      return true;
    } else {
      info('No previous session found');
      return false;
    }
  } catch (error) {
    if (isPermissionError(error)) {
      throw new Error('Resume is enabled but the workflow lacks `actions: read` permission.');
    }
    throw error;
  }
};

const persistSession = async () => {
  if (!shouldResume()) return;
  await uploadArtifact(CODEX_SESSIONS_PATH);
};

const install = async () => {
  await runCommand('npm', ['install', '-g', `@openai/codex@${CODEX_VERSION}`]);
};

export const shouldPrepareLinuxSandbox = (): boolean => {
  if (inputs.sudo) return false;
  if (process.env.RUNNER_OS !== 'Linux') return false;
  if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') return false;

  return true;
};

const prepareLinuxSandbox = async () => {
  if (!shouldPrepareLinuxSandbox()) return;

  await runCommand('sudo', ['sysctl', '-w', 'kernel.unprivileged_userns_clone=1']);
  await runCommand('sudo', ['sysctl', '-w', 'kernel.apparmor_restrict_unprivileged_userns=0']);
};

export const resolveAuthStrategy = (): AuthStrategy => {
  const apiKey = inputs.agentApiKey?.trim() || undefined;
  const authFile = inputs.agentAuthFile?.trim() || undefined;

  if (apiKey && authFile) throw new Error('Set only one: `agent_api_key` or `agent_auth_file`.');
  if (authFile) return { kind: 'auth_file', authFile };
  if (apiKey) return { kind: 'api_key', apiKey };

  throw new Error('Missing auth: set `agent_api_key` or `agent_auth_file`.');
};

export const hasAuthFileChanged = (initialAuthFile: string, currentAuthFile: string): boolean => {
  return currentAuthFile.trim() !== initialAuthFile;
};

export const getAuthFileSecretUpdate = (
  initialAuthFile: string,
  currentAuthFile: string,
): { authFile: string; secretName: string } | undefined => {
  const trimmedAuthFile = currentAuthFile.trim();

  if (!hasAuthFileChanged(initialAuthFile, trimmedAuthFile)) return undefined;

  return {
    authFile: trimmedAuthFile,
    secretName: CODEX_AUTH_SECRET_NAME,
  };
};

const login = async () => {
  const auth = resolveAuthStrategy();

  if (auth.kind === 'auth_file') {
    ensureDir(CODEX_DIR);
    fs.writeFileSync(CODEX_AUTH_PATH, auth.authFile, { mode: 0o600 });
    return;
  }

  await runCommand('codex', ['login', '--with-api-key'], { input: Buffer.from(auth.apiKey, 'utf8') });
};

const persistAuthFileSecret = async () => {
  const auth = resolveAuthStrategy();

  if (auth.kind !== 'auth_file') return;
  if (!fs.existsSync(CODEX_AUTH_PATH)) {
    warning(`Cannot update ${CODEX_AUTH_SECRET_NAME} auth file secret: ${CODEX_AUTH_PATH} does not exist.`);
    return;
  }

  const update = getAuthFileSecretUpdate(
    auth.authFile,
    fs.readFileSync(CODEX_AUTH_PATH, 'utf8'),
  );

  if (!update) return;

  try {
    await updateActionsSecret(update.secretName, update.authFile);
    info(`Updated ${update.secretName} auth file secret`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warning(`Failed to update ${update.secretName} auth file secret: ${message}`);
  }
};

export const parseModelInput = (value: string | undefined) => {
  if (!value) return {};
  const [model, reasoningEffort, serviceTier] = value.split('/').map((part) => part.trim());

  if (serviceTier && !reasoningEffort) {
    throw new Error('Invalid model input: service tier requires reasoning effort.');
  }

  return {
    model: model || undefined,
    reasoningEffort: reasoningEffort || undefined,
    serviceTier: serviceTier || undefined,
  };
};

export const bootstrap = async ({ mcpServers }: BootstrapOptions): Promise<BootstrapResult> => {
  const [resumed] = await Promise.all([
    restoreSession(),
    install(),
    prepareLinuxSandbox(),
  ]);
  writeCodexConfig(mcpServers);
  await login();

  return { resumed };
};

export const teardown = async () => {
  await Promise.all([
    persistSession(),
    persistAuthFileSecret(),
  ]);
};

export const run = async (prompt: string) => {
  const { model, reasoningEffort, serviceTier } = parseModelInput(inputs.model);
  const sandbox = inputs.sudo ? 'danger-full-access' : 'read-only';
  const execOptions: ExecOptions = { input: Buffer.from(prompt, 'utf8') };

  if (inputs.sudo) {
    execOptions.env = { ...process.env, GITHUB_TOKEN: inputs.githubToken };
  }

  await runCommand(
    'codex',
    [
      'exec',
      `--sandbox=${sandbox}`,
      ...(model ? [`--model=${model}`] : []),
      ...(reasoningEffort ? [`--config=model_reasoning_effort=${reasoningEffort}`] : []),
      ...(serviceTier ? [`--config=service_tier=${serviceTier}`] : []),
      '-',
      'resume',
      '--last',
      '--skip-git-repo-check',
    ],
    execOptions,
    'stderr',
  );
};
