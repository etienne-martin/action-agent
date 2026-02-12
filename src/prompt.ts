import fs from 'fs';
import path from 'path';
import { inputs } from './github/input';
const PROMPT_TEMPLATE = fs.readFileSync(path.join(__dirname, 'PROMPT.md'), 'utf8');
const PROMPT_RESUME_TEMPLATE = fs.readFileSync(path.join(__dirname, 'PROMPT_RESUME.md'), 'utf8');
const { GITHUB_EVENT_PATH } = process.env;

export const buildPrompt = ({
  resumed,
  trustedCollaborators,
  tokenActor,
}: {
  resumed: boolean;
  trustedCollaborators: string[];
  tokenActor: string;
}): string => {
  if (!GITHUB_EVENT_PATH) throw new Error('Missing `GITHUB_EVENT_PATH`.');

  if (resumed) {
    return PROMPT_RESUME_TEMPLATE
      .replace('{{github_event_path}}', GITHUB_EVENT_PATH)
      .trim();
  }

  return PROMPT_TEMPLATE
    .replace('{{trusted_collaborators}}', trustedCollaborators.map((collaborator) => `- @${collaborator}`).join('\n'))
    .replace('{{github_event_path}}', GITHUB_EVENT_PATH)
    .replace('{{extra_prompt}}', inputs.prompt ?? '')
    .replace('{{token_actor}}', tokenActor)
    .trim();
};
