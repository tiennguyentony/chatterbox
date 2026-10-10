import { randomBytes, randomUUID } from 'node:crypto';

export interface IdGenerator {
  id(prefix: string): string;
  token(): string;
}

export const randomIds: IdGenerator = {
  id: (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`,
  token: () => randomBytes(24).toString('base64url'),
};

// Predictable ids for tests: msg_1, msg_2, conn_1, ...
export function sequentialIds(): IdGenerator {
  const counters = new Map<string, number>();
  let tokens = 0;
  return {
    id(prefix) {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}_${n}`;
    },
    token: () => `token-${++tokens}`,
  };
}
