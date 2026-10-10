export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

function line(level: string, message: string, data?: Record<string, unknown>) {
  const extra = data ? ` ${JSON.stringify(data)}` : '';
  return `${new Date().toISOString()} ${level.padEnd(5)} ${message}${extra}`;
}

export const consoleLogger: Logger = {
  info: (m, d) => console.log(line('info', m, d)),
  warn: (m, d) => console.warn(line('warn', m, d)),
  error: (m, d) => console.error(line('error', m, d)),
};

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
