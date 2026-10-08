/**
 * Every Redis key FlowDesk writes, in one place. (The client adds the global `fd:` prefix.)
 * Nothing here is a source of truth — losing Redis logs users out and empties caches, nothing more.
 */
export const keys = {
  session: (id: string) => `sess:${id}`,
  userSessions: (userId: string) => `user-sessions:${userId}`,
  rateLimit: (bucket: string, id: string) => `rl:${bucket}:${id}`,
  cache: (name: string) => `cache:${name}`,
  flash: (sessionId: string) => `flash:${sessionId}`,
  presence: (room: string) => `presence:${room}`,
};

export const EVENTS_CHANNEL_PREFIX = 'flowdesk.events.';
