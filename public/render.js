// Pure rendering helpers for the web client, kept free of DOM access so they
// can be unit tested (tests/unit/render.test.ts).

const URL_PATTERN = /https?:\/\/[^\s<]+/g;

export function formatTime(iso, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso));
}

// Turns bare links into clickable ones.
export function linkify(text) {
  return text.replace(URL_PATTERN, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

export function renderMessage(message, { currentUserId, timeZone } = {}) {
  const mine = message.userId === currentUserId ? ' mine' : '';
  return (
    `<li class="message${mine}" data-id="${message.id}">` +
    `<span class="author">${message.author}</span>` +
    `<time datetime="${message.sentAt}">${formatTime(message.sentAt, timeZone)}</time>` +
    `<div class="text">${linkify(message.text)}</div>` +
    `</li>`
  );
}

export function typingLabel(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}
