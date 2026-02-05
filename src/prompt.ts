import fs from 'fs';
import path from 'path';
import { inputs } from './github/input';
import type { ResumeStatus } from './agent';

const PROMPT_TEMPLATE = fs.readFileSync(path.join(__dirname, 'PROMPT.md'), 'utf8');
const PROMPT_RESUME_TEMPLATE = fs.readFileSync(path.join(__dirname, 'PROMPT_RESUME.md'), 'utf8');
const { GITHUB_EVENT_PATH } = process.env;

export const buildPrompt = ({ resumeStatus }: { resumeStatus: ResumeStatus }): string => {
  if (!GITHUB_EVENT_PATH) throw new Error('Missing `GITHUB_EVENT_PATH`.');

  if (resumeStatus === 'not_found') {
    return PROMPT_TEMPLATE
      .replace('{{github_event_path}}', GITHUB_EVENT_PATH)
      .replace('{{extra_prompt}}', inputs.prompt ?? '')
      .trim();
  } else {
    return PROMPT_RESUME_TEMPLATE
      .replace('{{github_event_path}}', GITHUB_EVENT_PATH)
      .trim();
  }
};
