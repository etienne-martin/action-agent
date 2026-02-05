import type { McpServerConfig } from './mcp';

export type ResumeStatus = 'skipped' | 'not_found' | 'restored';

export interface BootstrapOptions {
  mcpServers: McpServerConfig[]
}

export interface BootstrapResult {
  resumeStatus: ResumeStatus
}

export interface Agent {
  bootstrap: (options: BootstrapOptions) => Promise<BootstrapResult>;
  run: (prompt: string) => Promise<void>;
  teardown: () => Promise<void>;
}
