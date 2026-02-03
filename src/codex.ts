import fs from 'fs';
import os from 'os';
import path from 'path';
import { downloadLatestArtifact, uploadArtifact } from './artifacts';
import { runCommand } from './exec';

const CODEX_VERSION = '0.93.0';
const CODEX_DIR = path.join(os.homedir(), '.codex');

const ensureDir = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true });
};

const restoreSession = async (githubToken: string): Promise<void> => {
  ensureDir(CODEX_DIR);
  await downloadLatestArtifact(githubToken, CODEX_DIR);
};

const persistSession = async (): Promise<void> => {
  fs.rmSync(path.join(CODEX_DIR, 'auth.json'), { force: true });
  fs.rmSync(path.join(CODEX_DIR, 'tmp'), { recursive: true, force: true });
  await uploadArtifact(CODEX_DIR);
};

const install = async (): Promise<void> => {
  await runCommand('npm', ['install', '-g', `@openai/codex@${CODEX_VERSION}`]);
};

const login = async (apiKey: string): Promise<void> => {
  await runCommand('bash', ['-lc', 'printenv OPENAI_API_KEY | codex login --with-api-key'], {
    env: { OPENAI_API_KEY: apiKey },
  });
};

export const bootstrap = async ({
  apiKey,
  githubToken,
}: {
  apiKey: string;
  githubToken: string;
}) => {
  await install();
  await restoreSession(githubToken);
  await login(apiKey);
};

export const teardown = async (): Promise<void> => {
  await persistSession();
};

export const runCodex = async (prompt: string): Promise<void> => {
  // TODO: pass --skip-git-repo-check when we want to allow non-git workdirs.
  await runCommand('codex', ['exec', 'resume', '--last', prompt]);
};
