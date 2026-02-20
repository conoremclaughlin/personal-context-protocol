import { describe, expect, it } from 'vitest';
import { extractUnreadCount, summarizeMissionRows } from './mission.js';
import type { Session } from './session.js';

describe('summarizeMissionRows', () => {
  it('counts active sessions and merges unread counts from missing-session agents', () => {
    const sessions: Session[] = [
      {
        id: '1',
        agentId: 'lumen',
        status: 'active',
        startedAt: '2026-02-20T08:00:00.000Z',
      },
      {
        id: '2',
        agentId: 'lumen',
        status: 'active',
        startedAt: '2026-02-20T08:05:00.000Z',
        threadKey: 'pr:70',
        currentPhase: 'implementing',
        backendSessionId: 'backend-123',
      },
      {
        id: '3',
        agentId: 'wren',
        status: 'active',
        startedAt: '2026-02-20T07:55:00.000Z',
      },
    ];

    const rows = summarizeMissionRows(sessions, { lumen: 4, wren: 1, aster: 2 });

    expect(rows).toEqual([
      {
        agent: 'lumen',
        activeSessions: 2,
        unreadInbox: 4,
        latestSessionId: '2',
        latestThreadKey: 'pr:70',
        latestPhase: 'implementing',
        latestBackendSessionId: 'backend-123',
      },
      {
        agent: 'wren',
        activeSessions: 1,
        unreadInbox: 1,
        latestSessionId: '3',
        latestThreadKey: undefined,
        latestPhase: 'active',
        latestBackendSessionId: undefined,
      },
      {
        agent: 'aster',
        activeSessions: 0,
        unreadInbox: 2,
        latestSessionId: undefined,
        latestThreadKey: undefined,
        latestPhase: undefined,
        latestBackendSessionId: undefined,
      },
    ]);
  });
});

describe('extractUnreadCount', () => {
  it('reads unreadCount when present', () => {
    expect(extractUnreadCount({ unreadCount: 5 })).toBe(5);
  });

  it('falls back to messages length', () => {
    expect(extractUnreadCount({ messages: [{}, {}, {}] })).toBe(3);
  });

  it('falls back to nested data.unreadCount', () => {
    expect(extractUnreadCount({ data: { unreadCount: 9 } })).toBe(9);
  });
});
