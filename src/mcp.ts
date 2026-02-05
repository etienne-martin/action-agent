export interface McpServerConfig {
  name: string;
  url: string
}

export interface LocalMcpServer {
  start: () => Promise<McpServerConfig>;
  stop: () => Promise<void>;
}
