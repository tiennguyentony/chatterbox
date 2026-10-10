import type { Message, User } from './domain/models';
import type { Clock } from './lib/clock';
import type { Store } from './store/store';

const USERS: User[] = [
  { id: 'usr_alice', username: 'alice', displayName: 'Alice Martin' },
  { id: 'usr_bob', username: 'bob', displayName: 'Bob Okafor' },
  { id: 'usr_carol', username: 'carol', displayName: 'Carol Diaz' },
  { id: 'usr_dave', username: 'dave', displayName: 'Dave Kim' },
];

const ROOMS = [
  { id: 'general', name: 'general', topic: 'Company-wide chatter', members: ['usr_alice', 'usr_bob', 'usr_carol', 'usr_dave'] },
  { id: 'random', name: 'random', topic: 'Cats, lunch, and everything else', members: ['usr_alice', 'usr_bob', 'usr_carol'] },
  { id: 'help', name: 'help', topic: 'Ask anything', members: ['usr_bob', 'usr_dave'] },
];

// [room, user, minutes ago, text]
const MESSAGES: [string, string, number, string][] = [
  ['general', 'usr_alice', 95, 'Morning all! Coffee machine on 3 is fixed.'],
  ['general', 'usr_bob', 90, 'Finally. Reminder: the <b>standup</b> moves to 10:00 from tomorrow.'],
  ['general', 'usr_carol', 62, 'Noted. Is the release still Thursday?'],
  ['general', 'usr_dave', 61, 'Yes, Thursday afternoon.'],
  ['general', 'usr_alice', 15, 'Demo recording is in the shared drive.'],
  ['random', 'usr_carol', 240, 'Anyone up for tacos at 12:30?'],
  ['random', 'usr_bob', 238, 'Always.'],
  ['help', 'usr_dave', 30, 'How do I get access to the staging logs?'],
  ['help', 'usr_bob', 25, 'Ask in #ops, they hand out the read-only role.'],
];

// Demo data so the web client has something to show on first start.
export async function seed(store: Store, clock: Clock): Promise<void> {
  const now = clock.now().getTime();
  const createdAt = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  for (const user of USERS) await store.saveUser(user);
  for (const { members, ...room } of ROOMS) {
    await store.saveRoom({ ...room, createdAt });
    for (const userId of members) await store.addMember(room.id, userId);
  }

  let n = 0;
  for (const [roomId, userId, minutesAgo, text] of MESSAGES) {
    const author = USERS.find((u) => u.id === userId)!;
    const message: Message = {
      id: `msg_seed${++n}`,
      roomId,
      userId,
      author: author.displayName,
      text,
      sentAt: new Date(now - minutesAgo * 60_000).toISOString(),
    };
    await store.addMessage(message);
  }

  // Alice and Carol haven't caught up on #general yet.
  await store.setUnread('usr_alice', 'general', 3);
  await store.setUnread('usr_carol', 'general', 2);
  await store.setUnread('usr_alice', 'random', 2);
}
