import { describe, expect, it } from 'vitest';
import { buildCleanEnv, spawnBackend, LineBuffer } from './spawn-backend.js';

describe('buildCleanEnv', () => {
  it('strips CLAUDECODE from process.env', () => {
    const original = process.env.CLAUDECODE;
    process.env.CLAUDECODE = '1';
    const env = buildCleanEnv();
    expect(env.CLAUDECODE).toBeUndefined();
    // Restore
    if (original !== undefined) {
      process.env.CLAUDECODE = original;
    } else {
      delete process.env.CLAUDECODE;
    }
  });

  it('merges extra env vars', () => {
    const env = buildCleanEnv({ MY_VAR: 'hello', AGENT_ID: 'wren' });
    expect(env.MY_VAR).toBe('hello');
    expect(env.AGENT_ID).toBe('wren');
  });

  it('extra env overrides process.env', () => {
    const env = buildCleanEnv({ HOME: '/custom/home' });
    expect(env.HOME).toBe('/custom/home');
  });
});

describe('spawnBackend', () => {
  it('captures stdout and stderr from a simple command', async () => {
    const { result } = spawnBackend({
      binary: 'echo',
      args: ['hello world'],
    });
    const res = await result;
    expect(res.stdout).toBe('hello world');
    expect(res.exitCode).toBe(0);
    expect(res.timedOut).toBe(false);
    expect(res.durationMs).toBeGreaterThan(0);
  });

  it('captures stderr output', async () => {
    const { result } = spawnBackend({
      binary: 'sh',
      args: ['-c', 'echo error >&2'],
    });
    const res = await result;
    expect(res.stderr).toBe('error');
    expect(res.exitCode).toBe(0);
  });

  it('reports non-zero exit code', async () => {
    const { result } = spawnBackend({
      binary: 'sh',
      args: ['-c', 'exit 42'],
    });
    const res = await result;
    expect(res.exitCode).toBe(42);
    expect(res.timedOut).toBe(false);
  });

  it('times out with hard ceiling', async () => {
    const { result } = spawnBackend({
      binary: 'sleep',
      args: ['10'],
      timeoutMs: 100,
    });
    const res = await result;
    expect(res.timedOut).toBe(true);
    expect(res.timeoutType).toBe('hard');
    expect(res.exitCode).toBe(124);
  });

  it('calls onStdout callback for each chunk', async () => {
    const chunks: string[] = [];
    const { result } = spawnBackend({
      binary: 'sh',
      args: ['-c', 'echo line1; echo line2'],
      onStdout: (chunk) => chunks.push(chunk),
    });
    await result;
    const combined = chunks.join('');
    expect(combined).toContain('line1');
    expect(combined).toContain('line2');
  });

  it('strips CLAUDECODE from spawned process env', async () => {
    process.env.CLAUDECODE = '1';
    const { result } = spawnBackend({
      binary: 'sh',
      args: ['-c', 'echo $CLAUDECODE'],
    });
    const res = await result;
    expect(res.stdout).toBe('');
    delete process.env.CLAUDECODE;
  });

  it('merges extra env vars into spawned process', async () => {
    const { result } = spawnBackend({
      binary: 'sh',
      args: ['-c', 'echo $MY_TEST_VAR'],
      env: { MY_TEST_VAR: 'wren-test' },
    });
    const res = await result;
    expect(res.stdout).toBe('wren-test');
  });
});

describe('LineBuffer', () => {
  it('splits complete lines', () => {
    const buf = new LineBuffer();
    const lines = buf.feed('line1\nline2\nline3\n');
    expect(lines).toEqual(['line1', 'line2', 'line3']);
  });

  it('buffers partial lines across chunks', () => {
    const buf = new LineBuffer();
    expect(buf.feed('hel')).toEqual([]);
    expect(buf.feed('lo\nwor')).toEqual(['hello']);
    expect(buf.feed('ld\n')).toEqual(['world']);
  });

  it('flushes remaining content', () => {
    const buf = new LineBuffer();
    buf.feed('partial');
    expect(buf.flush()).toBe('partial');
    expect(buf.flush()).toBeNull();
  });

  it('handles empty input', () => {
    const buf = new LineBuffer();
    expect(buf.feed('')).toEqual([]);
    expect(buf.flush()).toBeNull();
  });

  it('handles multiple newlines', () => {
    const buf = new LineBuffer();
    const lines = buf.feed('a\n\nb\n');
    expect(lines).toEqual(['a', '', 'b']);
  });
});
