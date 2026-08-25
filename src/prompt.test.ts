import { WORKFLOW_TOKEN_ACTOR } from './github/identity';

const loadPrompt = async ({
  prompt,
  sudo,
}: {
  prompt?: string;
  sudo?: boolean;
} = {}) => {
  jest.resetModules();
  process.env.GITHUB_EVENT_PATH = '/tmp/event.json';

  if (prompt) {
    process.env.INPUT_PROMPT = prompt;
  } else {
    delete process.env.INPUT_PROMPT;
  }

  if (sudo !== undefined) {
    process.env.INPUT_SUDO = sudo ? 'true' : 'false';
  } else {
    delete process.env.INPUT_SUDO;
  }

  const { buildPrompt } = await import('./prompt');

  return buildPrompt;
};

describe('buildPrompt', () => {
  afterEach(() => {
    delete process.env.GITHUB_EVENT_PATH;
    delete process.env.INPUT_PROMPT;
    delete process.env.INPUT_SUDO;
  });

  it('uses the resume prompt when resumed', async () => {
    const buildPrompt = await loadPrompt();
    const result = buildPrompt({
      resumed: true,
      trustedCollaborators: ['octocat'],
      tokenActor: WORKFLOW_TOKEN_ACTOR,
    });

    expect(result).toContain('A new GitHub event triggered this workflow.');
    expect(result).toContain('/tmp/event.json');
    expect(result).toContain('Re-evaluate the task you were previously given');
    expect(result).not.toContain('You are `github-actions[bot]`');
  });

  it('uses the full prompt when not resumed', async () => {
    const buildPrompt = await loadPrompt({ prompt: 'Extra instructions' });
    const result = buildPrompt({
      resumed: false,
      trustedCollaborators: ['octocat', 'hubot'],
      tokenActor: WORKFLOW_TOKEN_ACTOR,
    });

    expect(result).toContain('You are `github-actions[bot]`');
    expect(result).toContain('- @octocat');
    expect(result).toContain('- @hubot');
    expect(result).toContain('/tmp/event.json');
    expect(result).toContain('Extra instructions');
    expect(result).toContain('github-actions[bot]');
    expect(result).toContain('POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews');
    expect(result).toContain('so the review is submitted immediately instead of left pending');
    expect(result).toContain('GitHub creates a resolvable review conversation');
    expect(result).toContain('Include `body`, `path`, `line`, and `side`');
    expect(result).toContain('Do not duplicate actionable finding details');
  });

  it('supports token context overrides', async () => {
    const buildPrompt = await loadPrompt({ prompt: 'Extra instructions' });
    const result = buildPrompt({
      resumed: false,
      trustedCollaborators: ['octocat', 'hubot'],
      tokenActor: 'sudden-agent[bot]',
    });

    expect(result).toContain('sudden-agent[bot]');
  });

  it('uses sudo mode instructions when enabled', async () => {
    const buildPrompt = await loadPrompt({ sudo: true });
    const result = buildPrompt({
      resumed: false,
      trustedCollaborators: ['octocat'],
      tokenActor: WORKFLOW_TOKEN_ACTOR,
    });

    expect(result).toContain('GitHub CLI is available');
  });
});
