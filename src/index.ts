import { setFailed } from '@actions/core';
import { bootstrapCli } from './codex';
import { postComment } from './comment';
import { readInputs } from './input';

const main = async (): Promise<void> => {
  try {
    const { cliVersion, apiKey } = readInputs();
    await bootstrapCli({ version: cliVersion, apiKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await postComment(`
action-agent failed:
\`\`\`
${message}
\`\`\`
    `);

    setFailed(`action-agent failed: ${message}`);
  }
};

void main();
