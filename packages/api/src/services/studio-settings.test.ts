import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ensureStudioSettings } from './studio-settings';

describe('ensureStudioSettings', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'studio-settings-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('generates settings in an empty worktree', async () => {
    const wrote = await ensureStudioSettings(tempDir);
    expect(wrote).toBe(true);

    const raw = await readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8');
    const settings = JSON.parse(raw);

    expect(settings.permissions.allow).toContain('mcp__*');
    expect(settings.permissions.allow).toContain('Bash(*)');
    expect(settings.permissions.deny).toContain('Bash(rm -rf *)');
    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreCompact).toBeDefined();
    expect(settings.hooks.Stop).toBeDefined();
  });

  it('skips generation when permissions already exist', async () => {
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    const existing = {
      permissions: { allow: ['mcp__inkwell__*'], deny: [] },
      hooks: { custom: true },
    };
    await writeFile(join(tempDir, '.claude', 'settings.local.json'), JSON.stringify(existing));

    const wrote = await ensureStudioSettings(tempDir);
    expect(wrote).toBe(false);

    // Verify original file unchanged
    const raw = await readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8');
    const settings = JSON.parse(raw);
    expect(settings.permissions.allow).toEqual(['mcp__inkwell__*']);
    expect(settings.hooks).toEqual({ custom: true });
  });

  it('preserves existing non-permission settings', async () => {
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    const existing = {
      enabledMcpjsonServers: ['supabase', 'inkstand'],
      hooks: { PreCompact: [{ custom: true }] },
    };
    await writeFile(join(tempDir, '.claude', 'settings.local.json'), JSON.stringify(existing));

    const wrote = await ensureStudioSettings(tempDir);
    expect(wrote).toBe(true);

    const raw = await readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8');
    const settings = JSON.parse(raw);

    // New permissions added
    expect(settings.permissions.allow).toContain('mcp__*');
    // Existing settings preserved
    expect(settings.enabledMcpjsonServers).toEqual(['supabase', 'inkstand']);
    // Existing hooks preserved (not overwritten with generated ones)
    expect(settings.hooks).toEqual({ PreCompact: [{ custom: true }] });
  });

  it('creates .claude directory if missing', async () => {
    await ensureStudioSettings(tempDir);
    const raw = await readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8');
    expect(JSON.parse(raw)).toBeDefined();
  });
});
