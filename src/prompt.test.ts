import {WORKFLOW_TOKEN_ACTOR} from "./github/identity";

const loadPrompt = async (prompt?: string) => {
  jest.resetModules();
  process.env.GITHUB_EVENT_PATH = '/tmp/event.json';

  if (prompt) {
    process.env.INPUT_PROMPT = prompt;
  } else {
    delete process.env.INPUT_PROMPT;
  }

  const { buildPrompt } = await import('./prompt');

  return buildPrompt;
};

describe('buildPrompt', () => {
  afterEach(() => {
    delete process.env.GITHUB_EVENT_PATH;
    delete process.env.INPUT_PROMPT;
  });

  it('uses the resume prompt when resumed', async () => {
    const buildPrompt = await loadPrompt();
    const result = buildPrompt({ resumed: true, trustedCollaborators: ['octocat'], tokenActor: WORKFLOW_TOKEN_ACTOR });

    expect(result).toContain('A new GitHub event triggered this workflow.');
    expect(result).toContain('/tmp/event.json');
    expect(result).not.toContain('You are github-actions[bot]');
  });

  it('uses the full prompt when not resumed', async () => {
    const buildPrompt = await loadPrompt('Extra instructions');
    const result = buildPrompt({ resumed: false, trustedCollaborators: ['octocat', 'hubot'], tokenActor: WORKFLOW_TOKEN_ACTOR });

    expect(result).toContain('You are `github-actions[bot]`');
    expect(result).toContain('- @octocat');
    expect(result).toContain('- @hubot');
    expect(result).toContain('/tmp/event.json');
    expect(result).toContain('Extra instructions');
    expect(result).toContain('github-actions[bot]');
  });

  it('supports token context overrides', async () => {
    const buildPrompt = await loadPrompt('Extra instructions');
    const result = buildPrompt({
      resumed: false,
      trustedCollaborators: ['octocat', 'hubot'],
      tokenActor: 'sudden-agent[bot]',
    });

    expect(result).toContain('sudden-agent[bot]');
  });
});
