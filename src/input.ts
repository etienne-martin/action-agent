import { getInput } from '@actions/core';

export const inputs = {
  get apiKey(): string {
    return getInput('api_key', { required: true });
  },
  get githubToken(): string {
    return getInput('github_token', { required: true });
  },
  get model(): string | undefined {
    return getInput('model') || undefined;
  },
  get reasoningEffort(): string | undefined {
    return getInput('reasoning_effort') || undefined;
  },
  get prompt(): string | undefined {
    return getInput('prompt') || undefined;
  },
  get resume(): boolean {
    return getInput('resume').toLowerCase() === 'true';
  },
};
