import { context } from '@actions/github';

export const buildPrompt = (prompt?: string): string => `
You are action-agent, running inside a GitHub Actions runner.

Workflow context:
\`\`\`json
${JSON.stringify(context)}
\`\`\`

${prompt ?? "Act autonomously and take action only if it is useful."}
`.trim();
