import { renderMessage, typingLabel } from './render.js';

const $ = (selector) => document.querySelector(selector);
const state = { token: null, user: null, rooms: [], current: null, socket: null, oldestCursor: null, typing: new Map() };

$('#login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = new FormData(e.target).get('username');
  const res = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username }) });
  state.token = res.token;
  state.user = res.user;
  $('#login').hidden = true;
  $('#chat').hidden = false;
  $('#me').textContent = `Logged in as ${state.user.displayName}`;
  await loadRooms();
  connect();
  const first = state.rooms.find((r) => r.member);
  if (first) await openRoom(first.id);
});

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(state.token ? { authorization: `Bearer ${state.token}` } : {}) },
  });
  if (res.status === 204) return null;
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? res.statusText);
  return body;
}

async function loadRooms() {
  state.rooms = (await api('/rooms')).rooms;
  renderRooms();
}

function renderRooms() {
  const list = $('#rooms');
  list.replaceChildren();
  for (const room of state.rooms) {
    const li = document.createElement('li');
    li.className = (room.id === state.current ? 'active ' : '') + (room.member ? '' : 'not-member');
    li.textContent = `# ${room.name}`;
    if (room.unread > 0 && room.id !== state.current) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = room.unread;
      li.append(badge);
    }
    li.addEventListener('click', () => openRoom(room.id));
    list.append(li);
  }
}

async function openRoom(roomId) {
  state.current = roomId;
  state.typing.clear();
  const room = state.rooms.find((r) => r.id === roomId);
  $('#room-name').textContent = `# ${room.name}`;
  $('#join').hidden = room.member;
  $('#leave').hidden = !room.member;
  $('#messages').replaceChildren();
  renderTyping();
  renderRooms();
  if (!room.member) return;
  await loadHistory();
  send({ type: 'read', roomId });
  room.unread = 0;
  renderRooms();
}

async function loadHistory(before) {
  const query = new URLSearchParams({ limit: '30', ...(before ? { before } : {}) });
  const page = await api(`/rooms/${state.current}/messages?${query}`);
  const html = page.items.map((m) => renderMessage(m, { currentUserId: state.user.id })).reverse().join('');
  $('#messages').insertAdjacentHTML(before ? 'afterbegin' : 'beforeend', html);
  state.oldestCursor = page.nextCursor;
  $('#older').hidden = !page.nextCursor;
  if (!before) scrollToBottom();
}

function appendMessage(message) {
  $('#messages').insertAdjacentHTML('beforeend', renderMessage(message, { currentUserId: state.user.id }));
  scrollToBottom();
}

function scrollToBottom() {
  const list = $('#messages');
  list.scrollTop = list.scrollHeight;
}

function renderTyping() {
  $('#typing').textContent = typingLabel([...state.typing.values()].map((t) => t.name));
}

function connect(attempt = 0) {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${scheme}://${location.host}/ws?token=${encodeURIComponent(state.token)}`);
  state.socket = socket;
  socket.addEventListener('open', () => {
    $('#status').textContent = 'connected';
    attempt = 0;
  });
  socket.addEventListener('message', (e) => onFrame(JSON.parse(e.data)));
  socket.addEventListener('close', () => {
    $('#status').textContent = 'reconnecting…';
    const delay = Math.min(1000 * 2 ** attempt, 15000);
    setTimeout(async () => {
      connect(attempt + 1);
      // Anything we missed while disconnected is in the history.
      await loadRooms();
      if (state.current) await openRoom(state.current);
    }, delay);
  });
}

function send(frame) {
  if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify(frame));
}

function onFrame(frame) {
  switch (frame.type) {
    case 'message':
      if (frame.message.roomId === state.current) {
        appendMessage(frame.message);
        state.typing.delete(frame.message.userId);
        renderTyping();
        send({ type: 'read', roomId: state.current });
      }
      break;
    case 'unread': {
      const room = state.rooms.find((r) => r.id === frame.roomId);
      if (room) room.unread = frame.roomId === state.current ? 0 : frame.count;
      renderRooms();
      break;
    }
    case 'typing':
      if (frame.roomId !== state.current) break;
      state.typing.set(frame.userId, { name: frame.displayName, at: Date.now() });
      renderTyping();
      break;
    case 'joined':
    case 'left':
      loadRooms().then(() => openRoom(state.current));
      break;
    case 'error':
      $('#status').textContent = frame.message;
      break;
  }
}

// Typing indicators fade after a few seconds without a new event.
setInterval(() => {
  for (const [userId, t] of state.typing) if (Date.now() - t.at > 4000) state.typing.delete(userId);
  renderTyping();
}, 1000);

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = e.target.elements.text;
  const text = input.value.trim();
  if (!text || !state.current) return;
  send({ type: 'message', roomId: state.current, text, sentAt: new Date().toISOString(), ref: crypto.randomUUID() });
  input.value = '';
});

$('#composer').elements.text.addEventListener('input', () => {
  if (state.current) send({ type: 'typing', roomId: state.current });
});

$('#older').addEventListener('click', () => loadHistory(state.oldestCursor));
$('#join').addEventListener('click', () => send({ type: 'join', roomId: state.current }));
$('#leave').addEventListener('click', () => send({ type: 'leave', roomId: state.current }));
