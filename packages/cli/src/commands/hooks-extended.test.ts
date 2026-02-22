/**
 * Extended Hooks Tests
 *
 * Tests for new hook capabilities:
 * - Gemini PreCompress hook
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installHooks } from './hooks.js';

const TEST_DIR = join(tmpdir(), 'pcp-hooks-extended-test-' + Date.now());

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('installHooks: Gemini Extended', () => {
  it('should install PreCompress hook into .gemini/settings.json', () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    const { result } = installHooks(TEST_DIR, { backend: 'gemini' });
    expect(result).toBe('installed');

    const configPath = join(TEST_DIR, '.gemini', 'settings.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.hooks.PreCompress).toBeDefined();
    expect(config.hooks.PreCompress[0].command).toContain('sb hooks pre-compact');
  });
});

describe('installHooks: Codex Extended', () => {
  it('should install user_prompt hook into codex.toml', () => {
    mkdirSync(join(TEST_DIR, '.codex'), { recursive: true });
    const { result } = installHooks(TEST_DIR, { backend: 'codex' });
    expect(result).toBe('installed');

    const configPath = join(TEST_DIR, '.codex', 'config.toml');
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('user_prompt =');
    expect(content).toContain('sb hooks on-prompt');
  });
});
