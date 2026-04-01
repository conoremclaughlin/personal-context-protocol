import { describe, expect, it } from 'vitest';
import { buildDefaultJobLogPath } from './memory.js';

describe('buildDefaultJobLogPath', () => {
  it('writes backfill logs into the shared jobs log directory', () => {
    const path = buildDefaultJobLogPath('memory-backfill', new Date('2026-03-18T19:20:21.123Z'));
    expect(path).toContain('.ink/logs/jobs/memory-backfill-2026-03-18T19-20-21-123Z.log');
  });
});
