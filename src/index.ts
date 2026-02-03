import { setFailed } from '@actions/core';
import { bootstrap, runCodex, teardown } from './codex';
import { postComment } from './comment';
import { ensurePermission } from './permissions';
import { buildPrompt } from './prompt';

const main = async (): Promise<void> => {
  try {
    await ensurePermission();
    await bootstrap();
    await runCodex(buildPrompt());
    await teardown();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    setFailed(`action-agent failed: ${message}`);

    await postComment(`
action-agent failed:
\`\`\`
${message}
\`\`\`
    `);
  }
};

void main();
