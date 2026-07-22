const inputsMock: { sudo: boolean; githubToken: string; model?: string } = {
  sudo: false,
  githubToken: 'token',
  model: undefined,
};

const runCommandMock = jest.fn().mockResolvedValue(undefined);

jest.mock('../../github/input', () => ({
  inputs: inputsMock,
}));

jest.mock('../../exec', () => ({
  runCommand: runCommandMock,
}));

import { run } from './codex';

describe('codex run', () => {
  afterEach(() => {
    runCommandMock.mockReset();
    inputsMock.sudo = false;
    inputsMock.githubToken = 'token';
    inputsMock.model = undefined;
  });

  it('passes GITHUB_TOKEN when sudo', async () => {
    inputsMock.sudo = true;

    await run('prompt');

    const options = runCommandMock.mock.calls[0][2];
    expect(options.env).toEqual(expect.objectContaining({
      GITHUB_TOKEN: 'token',
    }));
  });

  it('does not pass GITHUB_TOKEN when not sudo', async () => {
    inputsMock.sudo = false;

    await run('prompt');

    const options = runCommandMock.mock.calls[0][2];
    expect(options.env).toBeUndefined();
  });

  it('passes model config', async () => {
    inputsMock.model = 'gpt-5.6-sol/xhigh/fast';

    await run('prompt');

    const args = runCommandMock.mock.calls[0][1];
    expect(args).toEqual(expect.arrayContaining([
      '--model=gpt-5.6-sol',
      '--config=model_reasoning_effort=xhigh',
      '--config=service_tier=fast',
    ]));
  });
});
