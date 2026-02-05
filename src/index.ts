import { setFailed } from '@actions/core';
import { getAgent } from './agents';
import { postErrorComment } from './github/comment';
import { isIssueOrPullRequest } from './github/context';
import { githubMcpServer } from './github/mcp';
import { buildPrompt } from './prompt';
import { ensurePrivateRepo, ensureWriteAccess } from './github/security';

const main = async () => {
  try {
    const agent = await getAgent();

    try {
      ensurePrivateRepo();
      await ensureWriteAccess();

      const { resumeStatus } = await agent.bootstrap({
        mcpServers: [await githubMcpServer.start()]
      });

      await agent.run(buildPrompt({ resumeStatus }));
    } finally {
      await Promise.allSettled([
        githubMcpServer.stop(),
        agent.teardown()
      ]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    setFailed(`action-agent failed: ${message}`);

    if (isIssueOrPullRequest()) {
      await postErrorComment();
    }
  }
};

void main();
