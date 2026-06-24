import {
  buildConfig,
  getAuthFileSecretUpdate,
  hasAuthFileChanged,
  parseModelInput,
  resolveAuthStrategy,
  shouldPrepareLinuxSandbox,
} from './codex';

describe('agent codex', () => {
  describe('buildConfig', () => {
    it('renders multiple MCP servers', () => {
      const config = buildConfig([
        { name: 'github', url: 'http://localhost:1234/mcp' },
        { name: 'jira', url: 'https://jira.example.com/mcp' },
      ]);

      expect(config).toBe(
        [
          'cli_auth_credentials_store = "file"',
          '',
          '[mcp_servers.github]',
          'url = "http://localhost:1234/mcp"',
          'default_tools_approval_mode = "approve"',
          '',
          '[mcp_servers.jira]',
          'url = "https://jira.example.com/mcp"',
          'default_tools_approval_mode = "approve"',
        ].join('\n'),
      );
    });
  });

  describe('parseModelInput', () => {
    it('returns empty config for undefined', () => {
      expect(parseModelInput(undefined)).toEqual({});
    });

    it('parses model only', () => {
      expect(parseModelInput('test-model')).toEqual({
        model: 'test-model',
        reasoningEffort: undefined,
        serviceTier: undefined,
      });
    });

    it('parses model and reasoning effort', () => {
      expect(parseModelInput('test-model/xhigh')).toEqual({
        model: 'test-model',
        reasoningEffort: 'xhigh',
        serviceTier: undefined,
      });
    });

    it('parses model, reasoning effort, and service tier', () => {
      expect(parseModelInput('gpt-5.5/xhigh/fast')).toEqual({
        model: 'gpt-5.5',
        reasoningEffort: 'xhigh',
        serviceTier: 'fast',
      });
    });

    it('trims whitespace', () => {
      expect(parseModelInput(' test-model / high / fast ')).toEqual({
        model: 'test-model',
        reasoningEffort: 'high',
        serviceTier: 'fast',
      });
    });

    it('handles empty model or effort', () => {
      expect(parseModelInput('/high')).toEqual({
        model: undefined,
        reasoningEffort: 'high',
        serviceTier: undefined,
      });
      expect(parseModelInput('test-model/')).toEqual({
        model: 'test-model',
        reasoningEffort: undefined,
        serviceTier: undefined,
      });
    });

    it('throws when service tier skips reasoning effort', () => {
      expect(() => parseModelInput('gpt-5.5//fast')).toThrow(
        'Invalid model input: service tier requires reasoning effort.',
      );
      expect(() => parseModelInput('gpt-5.5/ /fast')).toThrow(
        'Invalid model input: service tier requires reasoning effort.',
      );
    });
  });

  describe('resolveAuthStrategy', () => {
    afterEach(() => {
      delete process.env.INPUT_AGENT_API_KEY;
      delete process.env.INPUT_AGENT_AUTH_FILE;
    });

    it('uses api key when provided', () => {
      process.env.INPUT_AGENT_API_KEY = ' sk-123 ';

      expect(resolveAuthStrategy()).toEqual({
        kind: 'api_key',
        apiKey: 'sk-123',
      });
    });

    it('uses auth file when provided', () => {
      process.env.INPUT_AGENT_AUTH_FILE = ' { "ok": true } ';

      expect(resolveAuthStrategy()).toEqual({
        kind: 'auth_file',
        authFile: '{ "ok": true }',
      });
    });

    it('throws when both are set', () => {
      process.env.INPUT_AGENT_API_KEY = 'sk-123';
      process.env.INPUT_AGENT_AUTH_FILE = '{ "ok": true }';

      expect(() => resolveAuthStrategy()).toThrow(
        'Set only one: `agent_api_key` or `agent_auth_file`.',
      );
    });

    it('throws when missing both', () => {
      expect(() => resolveAuthStrategy()).toThrow(
        'Missing auth: set `agent_api_key` or `agent_auth_file`.',
      );
    });
  });

  describe('shouldPrepareLinuxSandbox', () => {
    afterEach(() => {
      delete process.env.INPUT_SUDO;
      delete process.env.RUNNER_OS;
      delete process.env.RUNNER_ENVIRONMENT;
    });

    it('prepares non-sudo runs on GitHub-hosted Linux', () => {
      process.env.RUNNER_OS = 'Linux';
      process.env.RUNNER_ENVIRONMENT = 'github-hosted';

      expect(shouldPrepareLinuxSandbox()).toBe(true);
    });

    it('skips sudo mode', () => {
      process.env.INPUT_SUDO = 'true';
      process.env.RUNNER_OS = 'Linux';
      process.env.RUNNER_ENVIRONMENT = 'github-hosted';

      expect(shouldPrepareLinuxSandbox()).toBe(false);
    });

    it('skips self-hosted Linux runners', () => {
      process.env.RUNNER_OS = 'Linux';
      process.env.RUNNER_ENVIRONMENT = 'self-hosted';

      expect(shouldPrepareLinuxSandbox()).toBe(false);
    });
  });

  describe('hasAuthFileChanged', () => {
    it('returns false when unchanged', () => {
      expect(hasAuthFileChanged('{ "ok": true }', '{ "ok": true }\n')).toBe(false);
    });

    it('returns true when changed', () => {
      expect(hasAuthFileChanged('{ "ok": true }', '{ "ok": false }')).toBe(true);
    });
  });

  describe('getAuthFileSecretUpdate', () => {
    it('returns update when auth file changed', () => {
      expect(getAuthFileSecretUpdate('{ "ok": true }', '{ "ok": false }\n')).toEqual({
        authFile: '{ "ok": false }',
        secretName: 'CODEX_AUTH_JSON',
      });
    });

    it('skips unchanged auth file', () => {
      expect(getAuthFileSecretUpdate('{ "ok": true }', '{ "ok": true }\n')).toBeUndefined();
    });
  });
});
