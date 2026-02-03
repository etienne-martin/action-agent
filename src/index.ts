import { setFailed } from '@actions/core';
import { context } from '@actions/github';
import { bootstrap, runCodex, teardown } from './codex';
import { postComment } from './comment';
import { getIssueNumber, getSubjectType } from './context';
import { readInputs } from './input';
import { ensureActorHasWriteAccess } from './permissions';

const main = async (): Promise<void> => {
  try {
    const { apiKey, githubToken } = readInputs();

    await ensureActorHasWriteAccess(githubToken);
    await bootstrap({ apiKey, githubToken });

    await runCodex([
      'You are action-agent, running inside a GitHub Actions runner.',
      `Repo: ${context.repo.owner}/${context.repo.repo}`,
      `Event: ${context.eventName}`,
      `Subject: ${getSubjectType()} #${getIssueNumber()}`,
      `Workspace: ${process.env.GITHUB_WORKSPACE}`,
      `Event: ${JSON.stringify(context.payload)}`,
      'Act autonomously and take action only if it is useful.',
    ].join('\n'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await postComment(`
action-agent failed:
\`\`\`
${message}
\`\`\`
    `);

    setFailed(`action-agent failed: ${message}`);
  } finally {
    await teardown();
  }
};

void main();
