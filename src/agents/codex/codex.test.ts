import { buildConfig, parseModelInput } from './codex';

describe('buildConfig', () => {
  test('renders multiple MCP servers', () => {
    const config = buildConfig([
      { name: 'github', url: 'http://localhost:1234/mcp' },
      { name: 'jira', url: 'https://jira.example.com/mcp' },
    ]);

    expect(config).toBe(
      [
        '[mcp_servers.github]',
        'url = "http://localhost:1234/mcp"',
        '',
        '[mcp_servers.jira]',
        'url = "https://jira.example.com/mcp"',
      ].join('\n'),
    );
  });
});

describe('parseModelInput', () => {
  test('returns empty config for undefined', () => {
    expect(parseModelInput(undefined)).toEqual({});
  });

  test('parses model only', () => {
    expect(parseModelInput('gpt-5.2-codex')).toEqual({ model: 'gpt-5.2-codex', reasoningEffort: undefined });
  });

  test('parses model and reasoning effort', () => {
    expect(parseModelInput('gpt-5.2-codex/xhigh')).toEqual({
      model: 'gpt-5.2-codex',
      reasoningEffort: 'xhigh',
    });
  });

  test('trims whitespace', () => {
    expect(parseModelInput(' gpt-5.2-codex / high ')).toEqual({
      model: 'gpt-5.2-codex',
      reasoningEffort: 'high',
    });
  });

  test('handles empty model or effort', () => {
    expect(parseModelInput('/high')).toEqual({ model: undefined, reasoningEffort: 'high' });
    expect(parseModelInput('gpt-5.2-codex/')).toEqual({ model: 'gpt-5.2-codex', reasoningEffort: undefined });
  });
});
