export interface Config {
  port: number;
  host: string;
  maxMessageLength: number;
  historyPageSize: number;
  maxHistoryPageSize: number;
  messageRateLimit: { max: number; windowMs: number };
  typingThrottleMs: number;
  heartbeatMs: number;
  maxBufferedBytes: number;
}

export const defaultConfig: Config = {
  port: 3000,
  host: '127.0.0.1',
  maxMessageLength: 2000,
  historyPageSize: 50,
  maxHistoryPageSize: 100,
  messageRateLimit: { max: 10, windowMs: 10_000 },
  typingThrottleMs: 2_000,
  heartbeatMs: 30_000,
  maxBufferedBytes: 1024 * 1024,
};

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    ...defaultConfig,
    port: Number(env.PORT ?? defaultConfig.port),
    host: env.HOST || defaultConfig.host,
  };
}
