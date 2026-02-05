import type { Agent } from '../agent';
import { inputs } from '../github/input';

export const getAgent = async (): Promise<Agent> => {
  const value = inputs.agent;
  const normalized = value.trim().toLowerCase();

  if (normalized === 'codex') {
    return await import('./codex');
  }

  throw new Error(`Unsupported agent "${value}".`);
};
