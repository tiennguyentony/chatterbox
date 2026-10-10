import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { clientFrameSchema } from '../../src/ws/protocol';

const schema = clientFrameSchema(defaultConfig.maxMessageLength);

describe('client frames', () => {
  it('accepts a message at the configured maximum length', () => {
    const text = 'x'.repeat(2000);
    expect(schema.safeParse({ type: 'message', roomId: 'general', text }).success).toBe(true);
  });

  it('rejects a message one character over the limit', () => {
    const text = 'x'.repeat(2001);
    expect(schema.safeParse({ type: 'message', roomId: 'general', text }).success).toBe(false);
  });

  it('trims message text', () => {
    const result = schema.parse({ type: 'message', roomId: 'general', text: '  hi  ' });
    expect(result).toMatchObject({ text: 'hi' });
  });

  it('accepts an ISO timestamp with an offset', () => {
    const frame = { type: 'message', roomId: 'general', text: 'hi', sentAt: '2027-03-01T10:00:00+01:00' };
    expect(schema.safeParse(frame).success).toBe(true);
  });

  it('rejects unknown frame types', () => {
    expect(schema.safeParse({ type: 'kick', roomId: 'general' }).success).toBe(false);
  });
});
