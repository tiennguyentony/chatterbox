import { describe, expect, it } from 'vitest';
import { formatTime, linkify, renderMessage, typingLabel } from '../../public/render.js';

const message = {
  id: 'msg_1',
  roomId: 'general',
  userId: 'usr_bob',
  author: 'Bob',
  text: 'Release notes are up',
  sentAt: '2027-03-01T14:05:00.000Z',
};

describe('web client rendering', () => {
  it('formats the time as HH:MM in the given zone', () => {
    expect(formatTime(message.sentAt, 'UTC')).toBe('14:05');
    expect(formatTime(message.sentAt, 'Europe/Berlin')).toBe('15:05');
  });

  it('shows the author, time and text', () => {
    const html = renderMessage(message, { timeZone: 'UTC' });
    expect(html).toContain('<span class="author">Bob</span>');
    expect(html).toContain('14:05');
    expect(html).toContain('Release notes are up');
    expect(html).not.toContain('mine');
  });

  it('marks your own messages', () => {
    expect(renderMessage(message, { currentUserId: 'usr_bob', timeZone: 'UTC' })).toContain('class="message mine"');
  });

  it('turns links into anchors', () => {
    expect(linkify('see https://example.com/notes now')).toBe(
      'see <a href="https://example.com/notes" target="_blank" rel="noopener">https://example.com/notes</a> now',
    );
  });

  it('describes who is typing', () => {
    expect(typingLabel([])).toBe('');
    expect(typingLabel(['Bob'])).toBe('Bob is typing…');
    expect(typingLabel(['Bob', 'Carol'])).toBe('Bob and Carol are typing…');
    expect(typingLabel(['Bob', 'Carol', 'Dave'])).toBe('Several people are typing…');
  });
});
